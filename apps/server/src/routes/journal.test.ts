import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { generateNight, newCharacter, type CharacterBackup, type NightReport } from "@wayfarers-rest/shared";
import { loadStarterCatalog } from "@wayfarers-rest/shared/starter";
import { BACKUPS_KEPT } from "../journal/backups";
import { startTestServer } from "../testing/server";

const catalog = loadStarterCatalog();
const character = newCharacter("Aldric", "m");

/** A night that started `daysAgo` days before the clock of the test server. */
function reportOf(characterId: string, daysAgo: number, seed = 4821): NightReport {
  const start = Date.parse("2026-11-27T21:00:00.000Z") - daysAgo * 86_400_000;
  return {
    characterId,
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(start + 8 * 3_600_000).toISOString(),
    catalogueVersion: 1,
    night: generateNight({ seed, catalog, character, soundMinutes: 15, durationSeconds: 3600 }),
  };
}

test("a night report is stored once: created, replayed, or in conflict", async (t) => {
  const server = await startTestServer(t);
  const admin = await server.signIn();
  const device = await server.pairDevice(admin);
  const reportId = randomUUID();
  const report = reportOf(randomUUID(), 0);

  assert.equal((await server.anonymous.fail("putReport", { params: { reportId }, body: report })).code, "unauthorized");
  assert.equal((await admin.fail("putReport", { params: { reportId }, body: report })).code, "unauthorized");

  const first = await device.ok("putReport", { params: { reportId }, body: report });
  assert.deepEqual([first.status, first.body], [201, { id: reportId, receivedAt: "2026-11-27T22:00:00.000Z" }]);

  server.advance(5_000);
  // The same night with its keys in another order is the same body.
  const reordered = Object.fromEntries(Object.entries(report).reverse()) as NightReport;
  const again = await device.ok("putReport", { params: { reportId }, body: reordered });
  assert.deepEqual([again.status, again.body], [200, first.body]);

  assert.equal((await device.fail("putReport", { params: { reportId }, body: { ...report, catalogueVersion: 2 } })).code, "conflict");
  assert.equal((await device.fail("putReport", { params: { reportId: "not-a-uuid" }, body: report })).code, "badRequest");
  assert.equal((await device.fail("putReport", { params: { reportId }, body: { ...report, night: "none" } as never })).code, "badRequest");

  const { reports } = (await admin.ok("listReports")).body;
  assert.deepEqual(reports, [{ id: reportId, receivedAt: "2026-11-27T22:00:00.000Z", ...report }]);
});

test("the journal is read newest first, page by page, for one character or for all", async (t) => {
  const server = await startTestServer(t);
  const device = await server.pairDevice(await server.signIn());
  const [hero, other] = [randomUUID(), randomUUID()];
  // Sent out of order, as an outbox emptied after days offline may do.
  for (const daysAgo of [3, 0, 4, 1, 2]) {
    await device.ok("putReport", { params: { reportId: randomUUID() }, body: reportOf(hero, daysAgo, daysAgo) });
  }
  await device.ok("putReport", { params: { reportId: randomUUID() }, body: reportOf(other, 10) });
  const started = (daysAgo: number) => reportOf(hero, daysAgo).startedAt;

  const first = (await device.ok("listReports", { query: { characterId: hero, limit: 2 } })).body;
  assert.deepEqual(first.reports.map((report) => report.startedAt), [started(0), started(1)]);
  assert.equal(first.nextBefore, started(1));

  const second = (await device.ok("listReports", { query: { characterId: hero, limit: 2, before: first.nextBefore! } })).body;
  assert.deepEqual(second.reports.map((report) => report.startedAt), [started(2), started(3)]);
  // A cursor written without milliseconds names the same instant.
  const last = (await device.ok("listReports", { query: { characterId: hero, limit: 2, before: started(3).replace(".000Z", "Z") } })).body;
  assert.deepEqual(last.reports.map((report) => report.startedAt), [started(4)]);
  assert.equal(last.nextBefore, null);

  const everyone = (await device.ok("listReports")).body;
  assert.equal(everyone.reports.length, 6);
  assert.equal(everyone.nextBefore, null);
  assert.equal(everyone.reports[5].characterId, other);
  assert.equal((await device.ok("listReports", { query: { limit: 5000 } })).body.reports.length, 6);
  assert.equal((await device.fail("listReports", { query: { characterId: "someone" } })).code, "badRequest");
});

test("character backups are idempotent and the newest revision is given back", async (t) => {
  const server = await startTestServer(t);
  const device = await server.pairDevice(await server.signIn());
  const characterId = randomUUID();
  const backup = (level: number): CharacterBackup => ({
    savedAt: "2026-11-27T06:30:00.000Z",
    character: { ...character, level },
    appState: { bag: ["epee-rouillee"], wakeTime: "07:00" },
  });

  assert.equal((await device.fail("latestBackup", { params: { characterId } })).code, "notFound");

  const first = await device.ok("putBackup", { params: { characterId, revision: 1 }, body: backup(2) });
  assert.deepEqual([first.status, first.body], [201, { characterId, revision: 1, receivedAt: "2026-11-27T22:00:00.000Z" }]);
  assert.equal((await device.ok("putBackup", { params: { characterId, revision: 1 }, body: backup(2) })).status, 200);
  assert.equal((await device.fail("putBackup", { params: { characterId, revision: 1 }, body: backup(3) })).code, "conflict");

  server.advance(1_000);
  await device.ok("putBackup", { params: { characterId, revision: 3 }, body: backup(4) });
  await device.ok("putBackup", { params: { characterId, revision: 2 }, body: backup(3) });
  const latest = (await device.ok("latestBackup", { params: { characterId } })).body;
  assert.deepEqual(latest, { characterId, revision: 3, receivedAt: "2026-11-27T22:00:01.000Z", ...backup(4) });

  assert.equal((await device.fail("latestBackup", { params: { characterId: randomUUID() } })).code, "notFound");
  assert.equal((await (await server.signIn()).fail("latestBackup", { params: { characterId } })).code, "unauthorized");
});

test("only the last revisions of a character are kept", async (t) => {
  const server = await startTestServer(t);
  const device = await server.pairDevice(await server.signIn());
  const characterId = randomUUID();
  const body: CharacterBackup = { savedAt: "2026-11-27T06:30:00.000Z", character };
  for (let revision = 1; revision <= BACKUPS_KEPT + 2; revision++) {
    await device.ok("putBackup", { params: { characterId, revision }, body: { ...body, appState: { revision } } });
  }
  assert.equal((await device.ok("latestBackup", { params: { characterId } })).body.revision, BACKUPS_KEPT + 2);
  // Revision 3 is still there and still guarded; revision 1 is gone, so another body is not a conflict.
  assert.equal((await device.ok("putBackup", { params: { characterId, revision: 3 }, body: { ...body, appState: { revision: 3 } } })).status, 200);
  assert.equal((await device.fail("putBackup", { params: { characterId, revision: 3 }, body })).code, "conflict");
  assert.equal((await device.ok("putBackup", { params: { characterId, revision: 1 }, body })).status, 201);
});
