import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COLLECTION_NAMES,
  catalogHash,
  generateNight,
  mergeCatalogue,
  newCharacter,
  versionEtag,
  type Ambience,
  type Catalog,
  type Monster,
} from "@wayfarers-rest/shared";
import { loadStarterCatalog } from "@wayfarers-rest/shared/starter";
import { startTestServer, type Client } from "../testing/server";

const ifMatch = (version: number) => ({ "if-match": versionEtag(version) });

/** The first live monster of the draft, to edit without naming anything of the starter world. */
async function someMonster(admin: Client) {
  const { body } = await admin.ok("listEntries", { params: { collection: "monsters" } });
  return body.entries[0];
}

test("the first start seeds the starter world and publishes it", async (t) => {
  const server = await startTestServer(t);
  const admin = await server.signIn();
  const device = await server.pairDevice(admin);
  const starter = loadStarterCatalog();

  const state = (await admin.ok("publication")).body;
  assert.ok(state.draftVersion > 0);
  assert.equal(state.published?.version, state.draftVersion);
  assert.deepEqual(state.changes, []);

  const sync = (await device.ok("catalogue")).body;
  assert.equal(sync.version, state.draftVersion);
  const onPhone = mergeCatalogue(undefined, sync);
  for (const name of COLLECTION_NAMES) assert.equal(onPhone[name].length, starter[name].length, name);
  assert.deepEqual(onPhone.settings, starter.settings);

  const exported = (await admin.ok("exportCatalogue")).body;
  assert.equal(exported.draftVersion, state.draftVersion);
  assert.equal(catalogHash(exported.catalog), catalogHash(onPhone));
  assert.equal(catalogHash(mergeCatalogue(undefined, (await admin.ok("draftCatalogue")).body)), catalogHash(onPhone));

  const night = generateNight({ seed: 4821, catalog: onPhone, character: newCharacter("Aldric", "m"), soundMinutes: 30, durationSeconds: 8 * 3600 });
  assert.ok(night.quests.length > 0);
});

test("a restart keeps the content and does not seed again", async (t) => {
  const first = await startTestServer(t);
  const admin = await first.signIn();
  const monster = await someMonster(admin);
  await admin.ok("archiveEntry", { params: { collection: "monsters", id: monster.id } });
  const before = (await admin.ok("publication")).body;
  await first.app.close();

  const second = await startTestServer(t, { dataDir: first.config.dataDir });
  const again = await second.signIn();
  assert.deepEqual((await again.ok("publication")).body, before);
  assert.equal((await again.ok("getEntry", { params: { collection: "monsters", id: monster.id } })).body.entry.archived, true);
});

test("the catalogue answers 304 to its own ETag and only sends what changed after `since`", async (t) => {
  const server = await startTestServer(t);
  const device = await server.pairDevice(await server.signIn());
  const full = await device.ok("catalogue", { query: { since: 0 } });
  const { version } = full.body;
  assert.equal(full.headers.etag, versionEtag(version));

  const unchanged = await device.send("catalogue", { headers: { "if-none-match": versionEtag(version) } });
  assert.equal(unchanged.statusCode, 304);
  assert.equal(unchanged.body, "");
  assert.equal((await device.send("catalogue", { headers: { "if-none-match": versionEtag(version - 1) } })).statusCode, 200);

  const nothing = (await device.ok("catalogue", { query: { since: version } })).body;
  assert.deepEqual({ changes: nothing.changes, settings: nothing.settings }, { changes: [], settings: null });
  assert.equal((await device.fail("catalogue", { query: { since: "abc" } as never })).code, "badRequest");
});

test("an edit stays in the draft until it is published", async (t) => {
  const server = await startTestServer(t);
  const admin = await server.signIn();
  const device = await server.pairDevice(admin);
  const held = (await device.ok("catalogue")).body;
  const monster = await someMonster(admin);
  const params = { collection: "monsters", id: monster.id } as const;
  const edited = { ...monster.data, aiGenerated: false };

  server.advance(60_000);
  const written = await admin.ok("putEntry", { params, headers: ifMatch(monster.version), body: { data: edited } });
  assert.equal(written.status, 200);
  assert.equal(written.body.entry.version, held.version + 1);
  assert.equal(written.body.entry.aiGenerated, false);
  assert.equal(written.body.entry.updatedAt, "2026-11-27T22:01:00.000Z");

  // The admin sees the change, the phone does not.
  const draft = (await admin.ok("draftCatalogue", { query: { since: held.version } })).body;
  assert.deepEqual(draft.changes.map((change) => [change.collection, change.id, change.version]), [["monsters", monster.id, held.version + 1]]);
  const stillPublished = (await device.ok("catalogue", { query: { since: held.version } })).body;
  assert.deepEqual({ version: stillPublished.version, changes: stillPublished.changes }, { version: held.version, changes: [] });

  const detail = (await admin.ok("getEntry", { params })).body;
  assert.deepEqual(detail.entry.data, edited);
  assert.deepEqual(detail.published?.data, monster.data);
  assert.deepEqual(detail.revisions.map((revision) => revision.version), [monster.version]);

  const pending = (await admin.ok("publication")).body;
  assert.deepEqual(pending.changes, [{ collection: "monsters", id: monster.id, version: held.version + 1, kind: "updated" }]);
  assert.equal((await admin.fail("publish", { body: { draftVersion: held.version } })).code, "versionConflict");

  const published = (await admin.ok("publish", { body: { draftVersion: pending.draftVersion } })).body;
  assert.deepEqual(published.changes, []);
  assert.equal(published.published?.version, pending.draftVersion);

  const sync = (await device.ok("catalogue", { query: { since: held.version } })).body;
  assert.deepEqual(sync.changes.map((change) => change.id), [monster.id]);
  const onPhone = mergeCatalogue(mergeCatalogue(undefined, held), sync);
  assert.equal(onPhone.monsters.find((item: Monster) => item.id === monster.id)?.aiGenerated, false);
  assert.equal((await device.ok("apiHealth")).body.catalogueVersion, pending.draftVersion);
  assert.equal((await admin.ok("getEntry", { params })).body.published?.version, held.version + 1);
});

test("a write is refused when the entry moved, does not fit the schema or points to nothing", async (t) => {
  const server = await startTestServer(t);
  const admin = await server.signIn();
  const monster = await someMonster(admin);
  const copy = { ...monster.data, id: "brand-new-monster" };
  const params = { collection: "monsters", id: "brand-new-monster" } as const;

  const created = await admin.ok("putEntry", { params, headers: ifMatch(0), body: { data: copy } });
  assert.equal(created.status, 201);
  assert.equal((await admin.fail("putEntry", { params, headers: ifMatch(0), body: { data: copy } })).code, "versionConflict");
  assert.equal((await admin.fail("putEntry", { params, headers: ifMatch(created.body.entry.version - 1), body: { data: copy } })).code, "versionConflict");
  assert.equal((await admin.fail("putEntry", { params, headers: { "if-match": "latest" }, body: { data: copy } })).code, "badRequest");
  // Without If-Match the write is not guarded.
  await admin.ok("putEntry", { params, body: { data: copy } });

  const invalid = await admin.fail("putEntry", { params, body: { data: { ...copy, rank: "giant", surprise: 1 } } });
  assert.equal(invalid.code, "invalidContent");
  assert.ok(invalid.details?.fields?.some((field) => field.path === "rank"));

  assert.equal((await admin.fail("putEntry", { params: { ...params, id: "another-id" }, body: { data: copy } })).code, "badRequest");
  assert.equal((await admin.fail("putEntry", { params: { collection: "dragons", id: "x" } as never, body: { data: copy } })).code, "badRequest");
  assert.equal((await admin.fail("getEntry", { params: { collection: "monsters", id: "nobody" } })).code, "notFound");

  const zone = (await admin.ok("listEntries", { params: { collection: "zones" } })).body.entries[0];
  const broken = await admin.fail("putEntry", {
    params: { collection: "zones", id: zone.id },
    body: { data: { ...zone.data, monsters: [...(zone.data.monsters as string[]), "no-such-monster"] } },
  });
  assert.equal(broken.code, "brokenReferences");
  assert.deepEqual(
    broken.details?.issues?.map((issue) => [issue.severity, issue.kind, issue.target?.id]),
    [["error", "missingRef", "no-such-monster"]],
  );
  assert.equal((await admin.ok("getEntry", { params: { collection: "zones", id: zone.id } })).body.entry.version, zone.version);
});

test("archiving hides an item from the lists, reaches the phone once published, and is never a deletion", async (t) => {
  const server = await startTestServer(t);
  const admin = await server.signIn();
  const device = await server.pairDevice(admin);
  const { version } = (await device.ok("catalogue")).body;
  const monster = await someMonster(admin);
  const params = { collection: "monsters", id: monster.id } as const;
  const list = async (archived?: "include" | "only") =>
    (await admin.ok("listEntries", { params: { collection: "monsters" }, query: { archived } })).body.entries.map((entry) => entry.id);
  const total = (await list()).length;

  const archived = (await admin.ok("archiveEntry", { params })).body.entry;
  assert.deepEqual([archived.archived, archived.version], [true, version + 1]);
  // Archiving twice writes nothing.
  assert.equal((await admin.ok("archiveEntry", { params })).body.entry.version, version + 1);
  assert.equal((await list()).length, total - 1);
  assert.equal((await list("include")).length, total);
  assert.deepEqual(await list("only"), [monster.id]);

  // What pointed to it is a warning of the check, and does not block the publication.
  const check = (await admin.ok("check")).body;
  assert.ok(check.issues.some((issue) => issue.kind === "archivedRef" && issue.severity === "warning" && issue.target?.id === monster.id));
  const pending = (await admin.ok("publication")).body;
  assert.deepEqual(pending.changes.map((change) => change.kind), ["archived"]);
  await admin.ok("publish", { body: { draftVersion: pending.draftVersion } });
  const sync = (await device.ok("catalogue", { query: { since: version } })).body;
  assert.deepEqual(sync.changes.map((change) => [change.id, change.archived]), [[monster.id, true]]);

  const back = (await admin.ok("unarchiveEntry", { params })).body.entry;
  assert.deepEqual([back.archived, back.version], [false, version + 2]);
  assert.deepEqual((await admin.ok("publication")).body.changes.map((change) => change.kind), ["unarchived"]);
  assert.equal((await admin.ok("getEntry", { params })).body.revisions.length, 2);
  assert.equal((await admin.fail("archiveEntry", { params: { collection: "monsters", id: "nobody" } })).code, "notFound");
});

test("a new item shows as created, and the publication is blocked while the check has errors", async (t) => {
  const server = await startTestServer(t);
  const admin = await server.signIn();
  const device = await server.pairDevice(admin);
  const { version } = (await device.ok("catalogue")).body;

  // A sound category moved to another layer: the ambience that plays it now points to the wrong kind.
  const exported = (await admin.ok("exportCatalogue")).body.catalog as Catalog;
  const ambience = exported.ambiences.find((item: Ambience) => !item.archived)!;
  const category = exported.soundCategories.find((item) => item.id === ambience.layers[0].category)!;
  const params = { collection: "soundCategories", id: category.id } as const;
  await admin.ok("putEntry", { params, body: { data: { ...category, layer: "action" } } });
  await admin.ok("putEntry", { params: { collection: "soundCategories", id: "new-category" }, body: { data: { ...category, id: "new-category" } } });

  const check = (await admin.ok("check")).body;
  const errors = check.issues.filter((issue) => issue.severity === "error");
  assert.ok(errors.length > 0);
  assert.ok(errors.every((issue) => issue.kind === "mismatchedRef" && issue.target?.id === category.id));

  const pending = (await admin.ok("publication")).body;
  assert.deepEqual(pending.changes.map((change) => [change.id, change.kind]), [[category.id, "updated"], ["new-category", "created"]]);
  const blocked = await admin.fail("publish", { body: { draftVersion: pending.draftVersion } });
  assert.equal(blocked.code, "publishBlocked");
  assert.deepEqual(blocked.details?.issues, errors);
  assert.equal((await device.ok("catalogue")).body.version, version);

  // An item that already had a broken reference can still be edited elsewhere.
  const owner = errors[0];
  const stuck = (await admin.ok("getEntry", { params: { collection: "ambiences", id: owner.id } })).body.entry;
  await admin.ok("putEntry", { params: { collection: "ambiences", id: owner.id }, body: { data: { ...stuck.data, aiGenerated: false } } });

  await admin.ok("putEntry", { params, body: { data: category } });
  const fixed = (await admin.ok("publication")).body;
  assert.equal((await admin.ok("publish", { body: { draftVersion: fixed.draftVersion } })).body.published?.version, fixed.draftVersion);
});

test("the starter world passes the check with warnings only: its sound categories have no sound yet", async (t) => {
  const server = await startTestServer(t);
  const admin = await server.signIn();
  const { issues, draftVersion } = (await admin.ok("check")).body;
  assert.equal(draftVersion, (await admin.ok("publication")).body.draftVersion);
  assert.deepEqual(issues.filter((issue) => issue.severity === "error"), []);
  const live = loadStarterCatalog().soundCategories.filter((category) => !category.archived);
  assert.deepEqual(issues.filter((issue) => issue.kind === "emptyCategory").map((issue) => issue.id).sort(), live.map((category) => category.id).sort());
});

test("lists filter on who wrote the item and search its id and texts without accents", async (t) => {
  const server = await startTestServer(t);
  const admin = await server.signIn();
  const list = async (query: { aiGenerated?: boolean; search?: string }) =>
    (await admin.ok("listEntries", { params: { collection: "monsters" }, query })).body.entries;
  const all = await list({});
  const [monster] = all;
  await admin.ok("putEntry", {
    params: { collection: "monsters", id: monster.id },
    body: { data: { ...monster.data, aiGenerated: false, name: { ...(monster.data.name as object), text: { fr: "Bête Éthérée" } } } },
  });

  assert.deepEqual((await list({ aiGenerated: false })).map((entry) => entry.id), [monster.id]);
  assert.equal((await list({ aiGenerated: true })).length, all.length - 1);
  assert.deepEqual((await list({ search: "etheree" })).map((entry) => entry.id), [monster.id]);
  assert.ok((await list({ search: monster.id.toUpperCase() })).some((entry) => entry.id === monster.id));
  assert.deepEqual(await list({ search: "no monster is called like this" }), []);
});

test("the settings are edited like an item: guarded, validated, and published with the rest", async (t) => {
  const server = await startTestServer(t);
  const admin = await server.signIn();
  const device = await server.pairDevice(admin);
  const { version } = (await device.ok("catalogue")).body;
  const before = (await admin.ok("getSettings")).body;
  assert.deepEqual(before.published, before.settings);

  const data = { ...before.settings.data, knownCompanionWeight: 9 };
  assert.equal((await admin.fail("putSettings", { headers: ifMatch(before.settings.version - 1), body: { data } })).code, "versionConflict");
  assert.equal((await admin.fail("putSettings", { body: { data: { ...data, unknown: true } as never } })).code, "badRequest");
  const after = (await admin.ok("putSettings", { headers: ifMatch(before.settings.version), body: { data } })).body;
  assert.equal(after.settings.version, version + 1);
  assert.deepEqual(after.settings.data, data);
  assert.deepEqual(after.published, before.settings);

  const pending = (await admin.ok("publication")).body;
  assert.deepEqual(pending.changes, [{ collection: "settings", id: "", version: version + 1, kind: "updated" }]);
  assert.equal((await device.ok("catalogue", { query: { since: version } })).body.settings, null);
  await admin.ok("publish", { body: { draftVersion: pending.draftVersion } });
  const sync = (await device.ok("catalogue", { query: { since: version } })).body;
  assert.deepEqual(sync.changes, []);
  assert.deepEqual(sync.settings, { version: version + 1, data });
});
