import assert from "node:assert/strict";
import { test } from "node:test";
import type { z } from "zod";
import { COLLECTION_NAMES } from "./admin";
import { COLLECTIONS, catalogSchema, parseCatalog } from "./catalog";
import { adminMeta, elementOf, fieldsOf } from "./fields";
import { settingsSchema } from "./settings";
import { tinyCatalogData } from "./testCatalog";

type Data = ReturnType<typeof tinyCatalogData>;

/** Parses the tiny catalog after a change, and returns the paths of the problems found. */
function problems(change: (data: Data) => void): string[] {
  const data = tinyCatalogData();
  change(data);
  const result = catalogSchema.safeParse(data);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

test("the tiny catalog is valid, and defaults are filled in", () => {
  const catalog = parseCatalog(tinyCatalogData());
  assert.equal(catalog.zones[0]?.archived, false);
  assert.equal(catalog.zones[0]?.aiGenerated, false);
  assert.equal(catalog.sounds[0]?.active, true);
  assert.equal(catalog.sceneTemplates[0]?.group, "any");
  assert.equal(catalog.sceneTemplates[0]?.xp, 0);
  assert.equal(catalog.questTemplates[0]?.steps[0]?.repeat, undefined);
});

test("every collection of the catalog is registered, and the other way round", () => {
  assert.deepEqual(Object.keys(COLLECTIONS), [...COLLECTION_NAMES]);
  assert.deepEqual(Object.keys(catalogSchema.shape), [...COLLECTION_NAMES, "settings"]);
});

test("every item of every collection has id, archived and aiGenerated", () => {
  for (const name of COLLECTION_NAMES) {
    const keys = fieldsOf(COLLECTIONS[name].schema).map((field) => field.key);
    assert.deepEqual(keys.slice(0, 3), ["id", "archived", "aiGenerated"], name);
    assert.ok(keys.includes(COLLECTIONS[name].titleField), `${name}: title field`);
  }
});

test("French is mandatory in every localized text", () => {
  assert.deepEqual(problems((data) => Object.assign(data.sceneTemplates[0]!.name, { fr: "" })), ["sceneTemplates.0.name.fr"]);
  assert.deepEqual(problems((data) => Object.assign(data.zones[0]!.name, { text: { en: "Wood" } })), ["zones.0.name.text.fr"]);
  assert.deepEqual(problems((data) => Object.assign(data.zones[0]!.name, { text: { fr: "Bois", en: "Wood" } })), []);
  assert.deepEqual(problems((data) => Object.assign(data.zones[0]!.name, { text: { fr: "Bois", de: "Wald" } })), ["zones.0.name.text"]);
});

test("ids are slugs", () => {
  for (const id of ["Bois", "bois des murmures", "bois_des_murmures", "-bois", "bois-", ""]) {
    assert.deepEqual(problems((data) => Object.assign(data.zones[0]!, { id })), ["zones.0.id"], id);
  }
  assert.deepEqual(problems((data) => Object.assign(data.zones[0]!, { id: "bois-des-murmures-2" })), []);
});

test("unknown fields and unknown values are refused", () => {
  assert.deepEqual(problems((data) => Object.assign(data.monsters[0]!, { level: 3 })), ["monsters.0"]);
  assert.deepEqual(problems((data) => Object.assign(data.monsters[0]!, { rank: "legend" })), ["monsters.0.rank"]);
  assert.deepEqual(problems((data) => Object.assign(data.places[0]!, { floor: "lava" })), ["places.0.floor"]);
  assert.deepEqual(problems((data) => Object.assign(data, { classes: [] })), [""]);
});

test("numbers stay within their bounds", () => {
  assert.deepEqual(problems((data) => Object.assign(data.sceneTemplates[0]!, { intensity: 1.2 })), ["sceneTemplates.0.intensity"]);
  assert.deepEqual(problems((data) => Object.assign(data.sceneTemplates[0]!, { duration: { min: 90, max: 30 } })), ["sceneTemplates.0.duration"]);
  assert.deepEqual(problems((data) => Object.assign(data.eventTables[0]!.rows[0]!, { weight: -1 })), ["eventTables.0.rows.0.weight"]);
  assert.deepEqual(problems((data) => Object.assign(data.settings.noiseBed, { volume: 2 })), ["settings.noiseBed.volume"]);
});

test("a quest step needs a scene or an event table, not both and not neither", () => {
  assert.deepEqual(problems((data) => Object.assign(data.questTemplates[0]!.steps[0]!, { eventTable: "chasse" })), ["questTemplates.0.steps.0.scene"]);
  assert.deepEqual(problems((data) => Object.assign(data.questTemplates[0]!.steps[0]!, { scene: undefined })), ["questTemplates.0.steps.0.scene"]);
});

test("a quest title is a valid template that only names what a quest has", () => {
  assert.deepEqual(problems((data) => Object.assign(data.questTemplates[0]!, { title: { fr: "Les {monster:pl" } })), ["questTemplates.0.title.fr"]);
  assert.deepEqual(problems((data) => Object.assign(data.questTemplates[0]!, { title: { fr: "Pour {hero}" } })), ["questTemplates.0.title.fr"]);
  assert.deepEqual(problems((data) => Object.assign(data.questTemplates[0]!, { monsterRank: undefined })), ["questTemplates.0.title.fr"]);
});

test("a summary sentence only uses the slots of its highlight", () => {
  const withSentence = (trigger: string, fr: string) => problems((data) => Object.assign(data.summarySentences[0]!, { trigger, text: { fr } }));
  assert.deepEqual(withSentence("boss", "{hero} a vaincu {monster:le} avec {companions}."), []);
  assert.deepEqual(withSentence("opening", "{hero} a vaincu {monster:le}."), ["summarySentences.0.text.fr"]);
  assert.deepEqual(withSentence("levelUp", "Niveau {level:le} !"), ["summarySentences.0.text.fr", "summarySentences.0.text.fr"]);
  assert.deepEqual(withSentence("closing", "{hero} est rentré{hero?|e|s}."), ["summarySentences.0.text.fr", "summarySentences.0.text.fr"]);
});

test("an ambience is made of sub-ambiences with unique ids", () => {
  assert.deepEqual(problems((data) => Object.assign(data.ambiences[0]!, { layers: [] })), ["ambiences.0.layers"]);
  assert.deepEqual(problems((data) => Object.assign(data.ambiences[0]!.layers[1]!, { id: "fond" })), ["ambiences.0.layers"]);
  assert.deepEqual(problems((data) => Object.assign(data.ambiences[0]!.layers[1]!, { when: { weather: ["snow"] } })), ["ambiences.0.layers.1.when.weather.0"]);
});

test("the noise bed needs a category only when it plays a real sound", () => {
  assert.deepEqual(problems((data) => Object.assign(data.settings, { noiseBed: { kind: "sound", volume: 0.1 } })), ["settings.noiseBed.category"]);
  assert.deepEqual(problems((data) => Object.assign(data.settings, { noiseBed: { kind: "pink", volume: 0.1 } })), []);
});

// --- Admin metadata -------------------------------------------------------------------------

/** Widgets that edit their whole value themselves: the admin does not look inside. */
const LEAF_WIDGETS = new Set(["id", "text", "number", "ratio", "boolean", "select", "multiselect", "ref", "refs", "localized", "template", "noun", "range"]);

/** Every field under a schema, with its path, going into groups and lists. */
function allFields(schema: z.ZodType, path: string): { path: string; field: ReturnType<typeof fieldsOf>[number] }[] {
  return fieldsOf(schema).flatMap((field) => {
    const here = `${path}.${field.key}`;
    const element = elementOf(field.schema);
    const inside = element ?? field.schema;
    const isLeaf = (meta: typeof field.meta) => meta !== undefined && LEAF_WIDGETS.has(meta.widget);
    const goesDeeper = !isLeaf(field.meta) && !(element && isLeaf(adminMeta(element)));
    return [{ path: here, field }, ...(goesDeeper ? allFields(inside, element ? `${here}[]` : here) : [])];
  });
}

const everyField = [
  ...COLLECTION_NAMES.flatMap((name) => allFields(COLLECTIONS[name].schema, name)),
  ...allFields(settingsSchema, "settings"),
];

test("every field of every collection has a French label and a widget", () => {
  assert.ok(everyField.length > 120, `only ${everyField.length} fields found`);
  for (const { path, field } of everyField) {
    assert.ok(field.meta, `${path} has no admin metadata`);
    assert.ok(field.meta?.label.trim(), `${path} has an empty label`);
  }
});

test("selects carry a label for each of their values, and references name their collection", () => {
  for (const { path, field } of everyField) {
    const meta = field.meta!;
    if (meta.widget === "select" || meta.widget === "multiselect") {
      const values = (meta.widget === "select" ? field.schema : elementOf(field.schema)) as z.ZodEnum;
      assert.deepEqual(Object.keys(meta.options ?? {}), values.options, path);
    }
    if (meta.widget === "ref" || meta.widget === "refs") assert.ok(COLLECTION_NAMES.includes(meta.ref!), path);
    else assert.equal(meta.ref, undefined, path);
    if (meta.widget === "template") assert.ok((meta.slots ?? []).length > 0, path);
  }
});

test("metadata survives optional, default and list constraints", () => {
  const quest = Object.fromEntries(fieldsOf(COLLECTIONS.questTemplates.schema).map((field) => [field.key, field]));
  assert.deepEqual(
    { label: quest.zones?.meta?.label, widget: quest.zones?.meta?.widget, ref: quest.zones?.meta?.ref, required: quest.zones?.required },
    { label: "Zones", widget: "refs", ref: "zones", required: false },
  );
  assert.equal(quest.steps?.meta?.widget, "list");
  assert.equal(quest.steps?.required, true);
  assert.equal(quest.archived?.required, false);
  const scene = COLLECTIONS.sceneTemplates.schema.shape;
  assert.equal(adminMeta(scene.group)?.label, "Groupe");
  assert.deepEqual(adminMeta(scene.actionCategory)?.refWhere, { layer: "action" });
});
