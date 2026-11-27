import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { generateNight } from "../night";
import { newCharacter } from "../progression/character";
import { COLLECTION_NAMES } from "../schema/admin";
import type { CatalogIssue } from "../schema/references";
import { loadStarterCatalog } from "../starter";
import {
  CHECK_ISSUE_KINDS,
  ERROR_STATUS,
  apiError,
  apiErrorSchema,
  buildPath,
  characterBackupSchema,
  etagMatches,
  mergeCatalogue,
  nightReportSchema,
  routes,
  soundBulkPatchSchema,
  versionEtag,
  type CatalogueSync,
  type RouteDef,
  type RouteInput,
  type RouteRequest,
  type RouteResponse,
} from "./index";

const table: [string, RouteDef][] = Object.entries(routes);
const paramNames = (path: string) => [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => match[1]);

// Every kind `checkReferences` reports must be a kind the check route can carry.
const referenceKind: (typeof CHECK_ISSUE_KINDS)[number] = "missingRef" as CatalogIssue["kind"];

test("no two routes share a method and a path", () => {
  const keys = table.map(([, route]) => `${route.method} ${route.path}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(referenceKind);
});

test("the params schema of a route names exactly the parameters of its path", () => {
  for (const [name, route] of table) {
    const declared = route.params instanceof z.ZodObject ? Object.keys(route.params.shape) : [];
    assert.deepEqual(declared.sort(), paramNames(route.path).sort(), name);
  }
});

test("the admin routes ask for the session, and the app never reaches them", () => {
  for (const [name, route] of table) {
    if (!route.path.startsWith("/api/admin/")) continue;
    assert.equal(route.auth, name === "login" ? "none" : "admin", name);
  }
  for (const name of ["packs", "packManifest", "putReport", "putBackup", "latestBackup"] as const) {
    assert.equal(routes[name].auth, "device", name);
  }
});

test("only requests that can carry a body declare one", () => {
  for (const [name, route] of table) {
    if (route.method === "GET" || route.method === "DELETE") assert.equal(route.body, undefined, name);
  }
});

test("buildPath fills the parameters and encodes the query", () => {
  assert.equal(buildPath(routes.health), "/health");
  assert.equal(
    buildPath(routes.getEntry, { params: { collection: "zones", id: "foret-de-brume" } }),
    "/api/admin/collections/zones/foret-de-brume",
  );
  assert.equal(buildPath(routes.convertedSound, { params: { sha256: "ab".repeat(32) } }), `/files/sounds/${"ab".repeat(32)}.m4a`);
  assert.equal(
    buildPath(routes.listEntries, { params: { collection: "sounds" }, query: { search: "pluie & vent", aiGenerated: true, archived: undefined } }),
    "/api/admin/collections/sounds?search=pluie%20%26%20vent&aiGenerated=true",
  );
  assert.throws(() => buildPath(routes.getEntry, { params: { collection: "zones" } }), /"id"/);
});

test("numbers and flags are read from the text of a path or a query", () => {
  assert.deepEqual(routes.catalogue.query.parse({ since: "412" }), { since: 412 });
  assert.deepEqual(routes.catalogue.query.parse({ since: 412 }), { since: 412 });
  assert.equal(routes.catalogue.query.safeParse({ since: "-1" }).success, false);
  assert.equal(routes.catalogue.query.safeParse({ sinse: "1" }).success, false);
  assert.deepEqual(routes.listEntries.query.parse({ aiGenerated: "false" }), { aiGenerated: false });
  const params = { characterId: "0b6f6c0e-6f0a-4a3e-9d4e-2f1f0c1d2e3f", revision: "7" };
  assert.equal(routes.putBackup.params.parse(params).revision, 7);
});

test("the types of a route follow its schemas", () => {
  const input: RouteInput<typeof routes.catalogue> = {};
  const call: RouteInput<typeof routes.putEntry> = { params: { collection: "zones", id: "a" }, body: { data: {} } };
  const request: RouteRequest<typeof routes.putBackup>["params"]["revision"] = 3;
  const none: RouteResponse<typeof routes.logout> = undefined;
  assert.deepEqual([input, call.params.id, request, none], [{}, "a", 3, undefined]);
});

test("an ETag names a version", () => {
  assert.equal(versionEtag(412), '"412"');
  assert.equal(etagMatches('"412"', 412), true);
  assert.equal(etagMatches('W/"411", "412"', 412), true);
  assert.equal(etagMatches('"41"', 412), false);
  assert.equal(etagMatches(undefined, 412), false);
});

test("mergeCatalogue rebuilds the same catalogue whatever syncs it went through", () => {
  const catalog = loadStarterCatalog();
  const zone = catalog.zones[0]!;
  const changes = COLLECTION_NAMES.flatMap((collection) =>
      catalog[collection].map((item) => ({ collection, id: item.id, version: 1, archived: item.archived, data: item as Record<string, unknown> })),
    );
  const first: CatalogueSync = { version: 1, schemaVersion: 1, changes, settings: { version: 1, data: catalog.settings } };
  const full = mergeCatalogue(undefined, first);
  assert.equal(full.zones.length, catalog.zones.length);
  assert.deepEqual(full.zones.map((item) => item.id), catalog.zones.map((item) => item.id).sort());

  const archived = { collection: "zones" as const, id: zone.id, version: 2, archived: true, data: { ...zone, archived: true } };
  const later = mergeCatalogue(full, { version: 2, schemaVersion: 1, changes: [archived], settings: null });
  assert.equal(later.zones.find((item) => item.id === zone.id)?.archived, true);
  assert.deepEqual(later.settings, full.settings);
  assert.deepEqual(later, mergeCatalogue(undefined, { ...first, version: 2, changes: [...changes, archived] }));

  assert.throws(() => mergeCatalogue(undefined, { version: 0, schemaVersion: 1, changes: [], settings: null }));
});

test("an error carries a known code, and every code has a status", () => {
  const error = apiError("invalidContent", "name.fr is required", { fields: [{ path: "name.fr", message: "Required" }] });
  assert.deepEqual(apiErrorSchema.parse(error), error);
  assert.equal(apiErrorSchema.safeParse({ error: { code: "nope", message: "" } }).success, false);
  for (const status of Object.values(ERROR_STATUS)) assert.ok(status >= 400 && status < 600);
});

test("a bulk patch touches only the fields it names", () => {
  const patch = soundBulkPatchSchema.parse({ ids: ["a"], set: { volume: 0.4, volumeJitter: null } });
  assert.deepEqual(patch.set, { volume: 0.4, volumeJitter: null });
  assert.equal(soundBulkPatchSchema.safeParse({ ids: [], set: {} }).success, false);
  assert.equal(soundBulkPatchSchema.safeParse({ ids: ["a"], set: { file: "x" } }).success, false);
});

test("a generated night and its character fit a report and a backup", () => {
  const catalog = loadStarterCatalog();
  const character = newCharacter("Brann", "m");
  const night = generateNight({ seed: 4821, catalog, character, soundMinutes: 30, durationSeconds: 8 * 3600 });
  const report = {
    characterId: "0b6f6c0e-6f0a-4a3e-9d4e-2f1f0c1d2e3f",
    startedAt: "2026-11-26T22:00:00.000Z",
    endedAt: "2026-11-27T06:00:00.000Z",
    catalogueVersion: 12,
    night: JSON.parse(JSON.stringify(night)),
  };
  assert.equal(nightReportSchema.parse(report).night.seed, 4821);
  assert.equal(nightReportSchema.safeParse({ ...report, night: "x" }).success, false);
  assert.equal(characterBackupSchema.parse({ savedAt: report.endedAt, character }).character.name, "Brann");
});
