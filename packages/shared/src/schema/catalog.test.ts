import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCatalog } from "./catalog";
import { catalogHash, stableStringify } from "./hash";
import { checkReferences } from "./references";
import { tinyCatalogData } from "./testCatalog";

type Data = ReturnType<typeof tinyCatalogData>;

function issuesAfter(change: (data: Data) => void) {
  const data = tinyCatalogData();
  change(data);
  return checkReferences(parseCatalog(data));
}

/** The same value with the keys of every object in reverse order. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, inner]) => [key, reverseKeys(inner)]));
}

test("stableStringify sorts keys, keeps arrays in order and drops undefined", () => {
  assert.equal(stableStringify({ b: 1, a: [3, { d: null, c: "x" }], e: undefined }), '{"a":[3,{"c":"x","d":null}],"b":1}');
  assert.equal(stableStringify({ 10: "a", 9: "b", z: 0.1 }), '{"10":"a","9":"b","z":0.1}');
});

test("the hash is stable: 32 hexadecimal characters, the same on every run", () => {
  const hash = catalogHash(parseCatalog(tinyCatalogData()));
  assert.match(hash, /^[0-9a-f]{32}$/);
  assert.equal(hash, catalogHash(parseCatalog(tinyCatalogData())));
});

test("the hash does not depend on the order of keys", () => {
  const data = tinyCatalogData();
  const reversed = reverseKeys(data);
  assert.notEqual(JSON.stringify(data), JSON.stringify(reversed));
  assert.equal(catalogHash(parseCatalog(reversed)), catalogHash(parseCatalog(data)));
});

test("the hash does not depend on defaults being written or left out", () => {
  const explicit = tinyCatalogData();
  Object.assign(explicit.zones[0]!, { archived: false, aiGenerated: false });
  assert.equal(catalogHash(parseCatalog(explicit)), catalogHash(parseCatalog(tinyCatalogData())));
});

test("the hash changes with any content, and with the order of items", () => {
  const base = catalogHash(parseCatalog(tinyCatalogData()));
  const changed = (change: (data: Data) => void) => {
    const data = tinyCatalogData();
    change(data);
    return catalogHash(parseCatalog(data));
  };
  assert.notEqual(changed((data) => Object.assign(data.eventTables[0]!.rows[0]!, { weight: 2 })), base);
  assert.notEqual(changed((data) => Object.assign(data.zones[0]!, { archived: true })), base);
  assert.notEqual(changed((data) => Object.assign(data.settings.noiseBed, { volume: 0.13 })), base);
  assert.notEqual(changed((data) => data.soundCategories.reverse()), base);
});

test("the tiny catalog has no broken reference", () => {
  assert.deepEqual(issuesAfter(() => {}), []);
});

test("a missing target is reported with where it is and what it points to", () => {
  assert.deepEqual(issuesAfter((data) => Object.assign(data.places[0]!, { zone: "nulle-part" })), [
    { kind: "missingRef", collection: "places", id: "auberge", path: "zone", target: { collection: "zones", id: "nulle-part" } },
  ]);
});

test("references are followed inside lists, nested objects and the settings", () => {
  const paths = (change: (data: Data) => void) => issuesAfter(change).map((issue) => `${issue.collection}/${issue.id}:${issue.path}`);
  assert.deepEqual(paths((data) => data.zones[0]!.monsters.push("dragon")), ["zones/bois:monsters"]);
  assert.deepEqual(paths((data) => Object.assign(data.questTemplates[0]!.steps[1]!, { eventTable: "peche" })), ["questTemplates/chasse:steps[1].eventTable"]);
  assert.deepEqual(paths((data) => Object.assign(data.eventTables[0]!.rows[0]!, { scene: "sieste" })), ["eventTables/chasse:rows[0].scene"]);
  assert.deepEqual(paths((data) => Object.assign(data.ambiences[0]!.layers[1]!, { category: "grele" })), ["ambiences/taverne:layers[1].category"]);
  assert.deepEqual(paths((data) => Object.assign(data.ambiences[0]!.oneShots[0]!, { category: "cloche" })), ["ambiences/taverne:oneShots[0].category"]);
  assert.deepEqual(paths((data) => Object.assign(data.sounds[0]!, { places: ["auberge", "phare"] })), ["sounds/brouhaha-01:places"]);
  assert.deepEqual(paths((data) => Object.assign(data.settings.noiseBed, { category: "souffle" })), ["settings/:noiseBed.category"]);
  assert.deepEqual(paths((data) => Object.assign(data.settings, { levelUpTransition: "fanfare" })), ["settings/:levelUpTransition"]);
});

test("a reference to a sound category of the wrong layer is a mismatch", () => {
  assert.deepEqual(issuesAfter((data) => Object.assign(data.sceneTemplates[0]!, { actionCategory: "voix" })), [
    { kind: "mismatchedRef", collection: "sceneTemplates", id: "combat", path: "actionCategory", target: { collection: "soundCategories", id: "voix" } },
  ]);
  assert.equal(issuesAfter((data) => Object.assign(data.ambiences[0]!.layers[0]!, { category: "combat" }))[0]?.kind, "mismatchedRef");
  assert.equal(issuesAfter((data) => Object.assign(data.places[0]!, { enterTransition: "voix" }))[0]?.kind, "mismatchedRef");
});

test("a live item pointing to an archived one is reported; an archived item may", () => {
  assert.deepEqual(issuesAfter((data) => Object.assign(data.monsters[0]!, { archived: true })), [
    { kind: "archivedRef", collection: "zones", id: "bois", path: "monsters", target: { collection: "monsters", id: "loup" } },
  ]);
  assert.deepEqual(
    issuesAfter((data) => {
      Object.assign(data.monsters[0]!, { archived: true });
      Object.assign(data.zones[0]!, { archived: true });
    }).map((issue) => `${issue.kind}:${issue.collection}/${issue.id}`),
    ["archivedRef:places/auberge", "archivedRef:questTemplates/chasse"],
    "the archived zone is fine; what still points to it is not",
  );
});

test("two items of a collection cannot share an id", () => {
  assert.deepEqual(issuesAfter((data) => data.monsters.push({ ...data.monsters[0]! })), [
    { kind: "duplicateId", collection: "monsters", id: "loup", path: "" },
  ]);
});
