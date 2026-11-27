import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeCatalogue, versionEtag, type Catalog } from "@wayfarers-rest/shared";
import { loadStarterCatalog } from "@wayfarers-rest/shared/starter";
import { ApiFailure, createApiClient, type ApiClient, type FailureCode } from "../api/client";
import { draftOf } from "../api/draft";
import { createFakeServer, type FakeOptions } from "./fakeServer";
import { FAKE_PASSWORD } from "./password";

const starter = loadStarterCatalog();

async function signedIn(options: FakeOptions = { catalog: starter, published: true }): Promise<ApiClient> {
  const api = createApiClient(createFakeServer(options).fetch);
  await api.call("login", { body: { password: FAKE_PASSWORD } });
  return api;
}

async function refusal(call: Promise<unknown>, code: FailureCode): Promise<ApiFailure> {
  const error = await call.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  assert.ok(error instanceof ApiFailure, `expected the call to be refused with ${code}`);
  assert.equal(error.code, code);
  return error;
}

const monster = (id: string, more: Record<string, unknown> = {}) => ({ id, name: { text: { fr: "rat géant" }, gender: "m" }, rank: "normal", ...more });

test("nothing under /api/admin answers without a session, and a wrong password is refused", async () => {
  const api = createApiClient(createFakeServer({ catalog: starter }).fetch);
  await refusal(api.call("session"), "unauthorized");
  await refusal(api.call("listEntries", { params: { collection: "zones" } }), "unauthorized");
  await refusal(api.call("login", { body: { password: "nope" } }), "unauthorized");
  await api.call("login", { body: { password: FAKE_PASSWORD } });
  assert.match((await api.call("session")).expiresAt, /Z$/);
  assert.equal(await api.call("logout"), undefined);
  await refusal(api.call("session"), "unauthorized");
});

test("the draft catalogue rebuilds the catalog it was seeded with", async () => {
  const api = await signedIn();
  const sync = await api.call("draftCatalogue");
  assert.equal(sync.version, 1);
  assert.deepEqual(mergeCatalogue(undefined, sync), mergeCatalogue(undefined, { ...sync, changes: [...sync.changes].reverse() }));
  const sorted = (catalog: Catalog) => mergeCatalogue(undefined, { version: 1, schemaVersion: 1, settings: { version: 1, data: catalog.settings }, changes: [] });
  assert.deepEqual(mergeCatalogue(undefined, sync).settings, sorted(starter).settings);
  assert.equal(draftOf(sync).items.zones.length, starter.zones.length);
  assert.equal(draftOf(sync).byId.zones.get(starter.zones[0]!.id)?.id, starter.zones[0]!.id);
  assert.deepEqual((await api.call("draftCatalogue", { query: { since: 1 } })).changes, []);
});

test("lists filter on archived, on AI-written and on a search without accents", async () => {
  const api = await signedIn();
  const list = (query: Record<string, unknown>) => api.call("listEntries", { params: { collection: "monsters" }, query }).then((result) => result.entries);
  const all = await list({});
  assert.equal(all.length, starter.monsters.length);
  assert.ok(all.every((entry) => entry.aiGenerated && entry.version === 1));

  await api.call("putEntry", { params: { collection: "monsters", id: "rat-geant" }, headers: { "if-match": versionEtag(0) }, body: { data: monster("rat-geant") } });
  assert.deepEqual((await list({ aiGenerated: false })).map((entry) => entry.id), ["rat-geant"]);
  assert.deepEqual((await list({ search: "RAT GEANT" })).map((entry) => entry.id), ["rat-geant"]);

  await api.call("archiveEntry", { params: { collection: "monsters", id: "rat-geant" } });
  assert.equal((await list({})).length, starter.monsters.length);
  assert.equal((await list({ archived: "include" })).length, starter.monsters.length + 1);
  assert.deepEqual((await list({ archived: "only" })).map((entry) => entry.id), ["rat-geant"]);
});

test("a write takes the next version, keeps the earlier one and fills the defaults", async () => {
  const api = await signedIn();
  const params = { collection: "monsters" as const, id: "rat-geant" };
  const first = await api.call("putEntry", { params, body: { data: monster("rat-geant") } });
  assert.equal(first.entry.version, 2);
  assert.equal(first.entry.data.archived, false);
  const second = await api.call("putEntry", { params, headers: { "if-match": versionEtag(2) }, body: { data: monster("rat-geant", { rank: "elite" }) } });
  assert.equal(second.entry.version, 3);

  const detail = await api.call("getEntry", { params });
  assert.equal(detail.entry.data.rank, "elite");
  assert.equal(detail.published, null);
  assert.deepEqual(detail.revisions.map((revision) => [revision.version, revision.data.rank]), [[2, "normal"]]);
  await refusal(api.call("getEntry", { params: { collection: "monsters", id: "nobody" } }), "notFound");
});

test("If-Match refuses a write over a version that moved, and a creation over an existing item", async () => {
  const api = await signedIn();
  const params = { collection: "monsters" as const, id: starter.monsters[0]!.id };
  await refusal(api.call("putEntry", { params, headers: { "if-match": versionEtag(0) }, body: { data: starter.monsters[0]! } }), "versionConflict");
  await refusal(api.call("putEntry", { params, headers: { "if-match": versionEtag(7) }, body: { data: starter.monsters[0]! } }), "versionConflict");
  await api.call("putEntry", { params, headers: { "if-match": versionEtag(1) }, body: { data: starter.monsters[0]! } });
});

test("content that does not fit the schema is refused with the path of each field", async () => {
  const api = await signedIn();
  const error = await refusal(
    api.call("putEntry", { params: { collection: "monsters", id: "rat-geant" }, body: { data: monster("rat-geant", { rank: "dragon", name: { text: {}, gender: "m" } }) } }),
    "invalidContent",
  );
  assert.deepEqual(error.details?.fields?.map((field) => field.path).sort(), ["name.text.fr", "rank"]);
  await refusal(api.call("putEntry", { params: { collection: "monsters", id: "rat-geant" }, body: { data: monster("autre") } }), "badRequest");
});

test("a write that adds a broken reference is refused, one that keeps an old one is not", async () => {
  const api = await signedIn();
  const place = starter.places[0]!;
  const params = { collection: "places" as const, id: place.id };
  const error = await refusal(api.call("putEntry", { params, body: { data: { ...place, zone: "nulle-part" } } }), "brokenReferences");
  assert.deepEqual(error.details?.issues?.map((issue) => [issue.kind, issue.path, issue.target?.id]), [["missingRef", "zone", "nulle-part"]]);

  const category = starter.soundCategories.find((candidate) => candidate.layer !== "transition")!;
  const mismatch = await refusal(api.call("putEntry", { params, body: { data: { ...place, enterTransition: category.id } } }), "brokenReferences");
  assert.equal(mismatch.details?.issues?.[0]?.kind, "mismatchedRef");
});

test("archiving twice writes once, and unarchiving brings the item back", async () => {
  const api = await signedIn();
  const params = { collection: "items" as const, id: starter.items[0]!.id };
  const archived = await api.call("archiveEntry", { params });
  assert.deepEqual([archived.entry.archived, archived.entry.version], [true, 2]);
  assert.equal((await api.call("archiveEntry", { params })).entry.version, 2);
  const back = await api.call("unarchiveEntry", { params });
  assert.deepEqual([back.entry.archived, back.entry.version], [false, 3]);
});

test("settings are one form with the same version guard", async () => {
  const api = await signedIn();
  const { settings } = await api.call("getSettings");
  const data = { ...settings.data, weatherMinMinutes: 45 };
  await refusal(api.call("putSettings", { headers: { "if-match": versionEtag(9) }, body: { data } }), "versionConflict");
  const saved = await api.call("putSettings", { headers: { "if-match": versionEtag(settings.version) }, body: { data } });
  assert.equal(saved.settings.data.weatherMinMinutes, 45);
  assert.equal(saved.published?.data.weatherMinMinutes, settings.data.weatherMinMinutes);
  await refusal((await signedIn({})).call("getSettings"), "notFound");
});

test("the phone only receives what was published", async () => {
  const api = await signedIn();
  const params = { collection: "monsters" as const, id: "rat-geant" };
  await api.call("putEntry", { params, body: { data: monster("rat-geant") } });
  await api.call("archiveEntry", { params: { collection: "items", id: starter.items[0]!.id } });
  await api.call("putSettings", { body: { data: { ...starter.settings, weatherMinMinutes: 45 } } });

  assert.deepEqual((await api.call("catalogue", { query: { since: 1 } })).changes, []);
  const state = await api.call("publication");
  assert.equal(state.draftVersion, 4);
  assert.equal(state.published?.version, 1);
  assert.deepEqual(
    state.changes.map((change) => [change.collection, change.id, change.kind]),
    [
      ["monsters", "rat-geant", "created"],
      ["items", starter.items[0]!.id, "archived"],
      ["settings", "", "updated"],
    ],
  );

  await refusal(api.call("publish", { body: { draftVersion: 3 } }), "versionConflict");
  const after = await api.call("publish", { body: { draftVersion: 4 } });
  assert.deepEqual([after.published?.version, after.changes.length], [4, 0]);
  const sync = await api.call("catalogue", { query: { since: 1 } });
  assert.equal(sync.version, 4);
  assert.deepEqual(sync.changes.map((change) => change.id).sort(), [starter.items[0]!.id, "rat-geant"].sort());
  assert.equal(sync.settings?.data.weatherMinMinutes, 45);
  assert.equal((await api.call("getEntry", { params })).published?.version, 2);
  assert.equal((await api.call("health")).catalogueVersion, 4);
});

test("before the first publication the phone gets version 0 and nothing", async () => {
  const api = await signedIn({ catalog: starter });
  const sync = await api.call("catalogue");
  assert.deepEqual([sync.version, sync.changes.length, sync.settings], [0, 0, null]);
  const state = await api.call("publication");
  assert.equal(state.published, null);
  assert.ok(state.changes.every((change) => change.kind === "created"));
});

test("a draft with reference errors cannot be published, and the check says where", async () => {
  const broken: Catalog = { ...starter, places: starter.places.map((place, index) => (index === 0 ? { ...place, zone: "nulle-part" } : place)) };
  const api = await signedIn({ catalog: broken });
  const check = await api.call("check");
  const errors = check.issues.filter((issue) => issue.severity === "error");
  assert.deepEqual(errors.map((issue) => [issue.kind, issue.collection, issue.id, issue.path]), [["missingRef", "places", broken.places[0]!.id, "zone"]]);
  assert.ok(check.issues.some((issue) => issue.kind === "emptyCategory" && issue.severity === "warning"));

  const error = await refusal(api.call("publish", { body: { draftVersion: check.draftVersion } }), "publishBlocked");
  assert.equal(error.details?.issues?.length, 1);

  await api.call("putEntry", { params: { collection: "places", id: broken.places[0]!.id }, body: { data: starter.places[0]! } });
  const state = await api.call("publication");
  assert.equal((await api.call("publish", { body: { draftVersion: state.draftVersion } })).published?.version, state.draftVersion);
});

test("the export is the whole draft as one valid catalog", async () => {
  const api = await signedIn();
  const exported = await api.call("exportCatalogue");
  assert.equal(exported.catalog.monsters.length, starter.monsters.length);
  assert.deepEqual(exported.catalog.settings, starter.settings);
});

test("a call the network drops is a failure with its own code", async () => {
  const api = createApiClient(() => Promise.reject(new TypeError("fetch failed")));
  await refusal(api.call("health"), "network");
  const garbled = createApiClient(async () => new Response("<html>", { status: 502 }));
  await refusal(garbled.call("health"), "badResponse");
});
