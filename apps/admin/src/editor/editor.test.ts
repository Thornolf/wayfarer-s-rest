import assert from "node:assert/strict";
import { test } from "node:test";
import { COLLECTION_NAMES, COLLECTIONS, settingsSchema } from "@wayfarers-rest/shared";
import { loadStarterCatalog } from "@wayfarers-rest/shared/starter";
import { blankElement, blankValue } from "./blank";
import { cellText, listColumns, MAX_COLUMNS } from "./columns";
import { changedFields } from "./diff";
import { formFields, optionsOf, unknownKeys, widgetOf } from "./fields";
import { pathLabels } from "./labels";
import { formatPath, getAt, parsePath, setAt } from "./paths";
import { prune } from "./prune";
import { referencesIn, usedBy } from "./references";
import { slugify } from "./slug";
import { textOf, titleOf } from "./titles";
import { missingTranslations } from "./translation";
import { errorAt, translateSchemaMessage, validate, type Translate } from "./validate";
import { weightShares } from "./weights";

const t: Translate = (key, values) => (values?.slot ? `${key}:${values.slot}` : key);
const starter = loadStarterCatalog();
const field = (collection: keyof typeof COLLECTIONS, key: string) => {
  const found = formFields(COLLECTIONS[collection].schema).find((candidate) => candidate.key === key);
  assert.ok(found, `${collection}.${key}`);
  return found;
};

test("paths are written the way the server writes them, and read back", () => {
  assert.equal(formatPath(["steps", 2, "scene"]), "steps[2].scene");
  assert.equal(formatPath([]), "");
  assert.deepEqual(parsePath("layers[0].when.weather"), ["layers", 0, "when", "weather"]);
  assert.deepEqual(parsePath(""), []);
});

test("setAt copies, creates missing parents and removes a key set to undefined", () => {
  const before = { name: { fr: "Bois" }, rows: [{ weight: 1 }] };
  const after = setAt(before, ["rows", 0, "weight"], 3) as typeof before;
  assert.equal(after.rows[0]?.weight, 3);
  assert.equal(before.rows[0]?.weight, 1);
  assert.equal(after.name, before.name);
  assert.deepEqual(setAt({}, ["when", "weather"], ["rain"]), { when: { weather: ["rain"] } });
  assert.deepEqual(setAt({ a: 1, b: 2 }, ["b"], undefined), { a: 1 });
  assert.equal(getAt(after, ["rows", 0, "weight"]), 3);
  assert.equal(getAt(after, ["rows", 4, "weight"]), undefined);
});

test("every field of every collection and of the settings has a widget and a label", () => {
  const seen = new Set<string>();
  const visit = (schema: Parameters<typeof formFields>[0], trail: string) => {
    for (const formField of formFields(schema)) {
      assert.notEqual(formField.widget, "json", `${trail}.${formField.key}`);
      assert.notEqual(formField.label, "", `${trail}.${formField.key}`);
      seen.add(formField.widget);
      if (formField.widget === "group") visit(formField.schema, `${trail}.${formField.key}`);
    }
  };
  for (const name of COLLECTION_NAMES) visit(COLLECTIONS[name].schema, name);
  visit(settingsSchema, "settings");
  for (const widget of ["id", "text", "number", "ratio", "boolean", "select", "multiselect", "ref", "refs", "localized", "template", "noun", "range", "list", "group"]) {
    assert.ok(seen.has(widget), `no field uses ${widget}`);
  }
});

test("fields without metadata get their widget from their type", () => {
  const noun = field("monsters", "name");
  const inside = Object.fromEntries(formFields(noun.schema).map((formField) => [formField.key, formField.widget]));
  assert.deepEqual(inside, { text: "group", gender: "select", elided: "boolean", plural: "group", isPlural: "boolean", proper: "boolean" });
  const gender = formFields(noun.schema).find((formField) => formField.key === "gender");
  assert.deepEqual(optionsOf(gender!.schema), { m: "m", f: "f" });
  assert.equal(widgetOf(field("eventTables", "rows").schema), "list");
});

test("a field knows whether it can be left out and what the schema fills in", () => {
  assert.equal(field("sceneTemplates", "group").required, false);
  assert.equal(field("sceneTemplates", "group").fallback, "any");
  assert.equal(field("sceneTemplates", "actionCategory").required, false);
  assert.equal(field("sceneTemplates", "actionCategory").fallback, undefined);
  assert.equal(field("sceneTemplates", "kind").required, true);
});

test("a blank item opens what is required and fills the defaults", () => {
  assert.deepEqual(blankValue(COLLECTIONS.sceneTemplates.schema), {
    archived: false,
    aiGenerated: false,
    name: { fr: "" },
    duration: {},
    group: "any",
    xp: 0,
  });
  assert.deepEqual(blankValue(COLLECTIONS.monsters.schema), { archived: false, aiGenerated: false, name: { text: { fr: "" }, gender: "m" } });
  assert.deepEqual(blankElement(field("eventTables", "rows").schema), { outcome: "nothing" });
  assert.deepEqual(blankElement(field("companions", "quips").schema), { fr: "" });
  assert.deepEqual(blankValue(field("questTemplates", "group").schema), { size: {} });
});

test("pruning removes what a half-filled form leaves behind, and keeps list rows in place", () => {
  assert.deepEqual(prune({ id: "a", name: { fr: "Bois", en: " " }, when: { weather: undefined }, minGap: {}, zones: [], rows: [{ scene: "" }, { scene: "x" }], xp: 0, loop: false }), {
    id: "a",
    name: { fr: "Bois" },
    zones: [],
    rows: [{}, { scene: "x" }],
    xp: 0,
    loop: false,
  });
  assert.deepEqual(prune({ places: ["a", "b"] }), { places: ["a", "b"] });
});

test("a pruned starter item is still valid: the form does not damage what it loads", () => {
  for (const name of COLLECTION_NAMES) {
    for (const item of starter[name]) {
      const checked = validate(COLLECTIONS[name].schema, prune(item), t);
      assert.ok(checked.ok, `${name}/${item.id}`);
      assert.deepEqual(checked.data, item);
    }
  }
  assert.ok(validate(settingsSchema, prune(starter.settings), t).ok);
});

test("validation gives one French message per faulty field, under the server's path", () => {
  const blank = prune({ ...(blankValue(COLLECTIONS.eventTables.schema) as object), id: "Pas Un Slug", rows: [{ weight: -1 }] });
  const checked = validate(COLLECTIONS.eventTables.schema, blank, t);
  assert.ok(!checked.ok);
  assert.deepEqual(Object.keys(checked.errors).sort(), ["id", "name", "rows[0].scene", "rows[0].weight"]);
  assert.equal(checked.errors.name, "validation.required");
  assert.equal(checked.errors["rows[0].scene"], "validation.required");
  assert.match(checked.errors["rows[0].weight"] ?? "", /Trop petit/);
  assert.equal(errorAt(checked.errors, "rows", true), "validation.required");
  assert.equal(errorAt(checked.errors, "rows"), undefined);
});

test("the rules the schema words in English are turned into the admin's sentences", () => {
  const scene = { ...starter.sceneTemplates[0], duration: { min: 9, max: 3 } };
  const checked = validate(COLLECTIONS.sceneTemplates.schema, scene, t);
  assert.ok(!checked.ok);
  assert.equal(checked.errors.duration, "validation.rangeOrder");

  const quest = { ...starter.questTemplates[0], title: { fr: "Vers {nowhere}" } };
  const refused = validate(COLLECTIONS.questTemplates.schema, quest, t);
  assert.ok(!refused.ok);
  assert.equal(refused.errors["title.fr"], "validation.unknownSlot:nowhere");
  assert.equal(translateSchemaMessage("Unclosed [", t), "validation.templateSyntax");
  assert.equal(translateSchemaMessage("Something new", t), "Something new");
});

test("texts still waiting for a language are found wherever they are", () => {
  const ambience = {
    id: "foret",
    name: { fr: "Forêt", en: "Forest" },
    layers: [{ id: "fond", name: { fr: "Feuillages" } }, { id: "vent", name: { fr: "Vent", en: "Wind" } }],
    oneShots: [],
  };
  assert.deepEqual(missingTranslations(COLLECTIONS.ambiences.schema, ambience, "en"), ["layers[0].name"]);
  assert.deepEqual(missingTranslations(COLLECTIONS.ambiences.schema, ambience, "fr"), []);
  const monster = { id: "loup", name: { text: { fr: "loup" }, gender: "m", plural: { fr: "loups gris" } }, rank: "normal" };
  assert.deepEqual(missingTranslations(COLLECTIONS.monsters.schema, monster, "en"), ["name.text", "name.plural"]);
});

test("references are read from the schema, and followed backwards", () => {
  const place = starter.places[0]!;
  const references = referencesIn(COLLECTIONS.places.schema, place);
  assert.ok(references.some((reference) => reference.path === "zone" && reference.collection === "zones" && reference.id === place.zone));
  assert.ok(references.some((reference) => reference.path === "ambience" && reference.collection === "ambiences"));

  const users = usedBy(starter, { schema: settingsSchema, value: starter.settings }, { collection: "zones", id: place.zone });
  assert.ok(users.some((user) => user.collection === "places" && user.id === place.id && user.path === "zone"));
  const levelUp = starter.settings.levelUpTransition!;
  const categoryUsers = usedBy(starter, { schema: settingsSchema, value: starter.settings }, { collection: "soundCategories", id: levelUp });
  assert.ok(categoryUsers.some((user) => user.collection === "settings" && user.path === "levelUpTransition"));
});

test("an item is named by its title field, whatever its shape", () => {
  assert.equal(textOf({ fr: "Forêt", en: "Forest" }, "en"), "Forest");
  assert.equal(textOf({ fr: "Forêt" }, "en"), "Forêt");
  assert.equal(textOf({ text: { fr: "loup gris" }, gender: "m" }), "loup gris");
  assert.equal(textOf(12), undefined);
  assert.equal(titleOf("monsters", { id: "loup", name: { text: { fr: "loup gris" }, gender: "m" } }), "loup gris");
  assert.equal(titleOf("monsters", { id: "loup" }), "loup");
  assert.equal(titleOf("sounds", { id: "s1", file: "abc" }), "abc");
});

test("list columns are the short fields of the schema, and cells show labels", () => {
  for (const name of COLLECTION_NAMES) {
    const columns = listColumns(name);
    assert.ok(columns.length <= MAX_COLUMNS);
    assert.ok(columns.every((column) => column.key !== COLLECTIONS[name].titleField && column.key !== "archived"));
  }
  assert.deepEqual(listColumns("places").map((column) => column.key), ["zone", "kind", "floor", "ambience"]);
  const words = { yes: "Oui", no: "Non", titleOfRef: (_: unknown, id: string) => `→${id}` };
  assert.equal(cellText(field("places", "kind"), "inn", words), "Auberge");
  assert.equal(cellText(field("places", "zone"), "elwynn", words), "→elwynn");
  assert.equal(cellText(field("sounds", "loop"), true, words), "Oui");
  assert.equal(cellText(field("questTemplates", "placeKinds"), ["wild", "cave"], words), "Lieu sauvage, Grotte ou mine");
  assert.equal(cellText(field("places", "enterTransition"), undefined, words), "");
});

test("the fields that differ between two versions of an item", () => {
  const before = starter.places[0]!;
  const after = { ...before, floor: before.floor === "mud" ? "grass" : "mud", name: { ...before.name, proper: !before.name.proper } };
  assert.deepEqual(changedFields(COLLECTIONS.places.schema, before, after).map((changed) => changed.key), ["name", "floor"]);
  assert.deepEqual(changedFields(COLLECTIONS.places.schema, before, { ...before }), []);
});

test("keys the schema does not know are listed apart", () => {
  assert.deepEqual(unknownKeys(COLLECTIONS.monsters.schema, { id: "loup", rank: "normal", level: 3 }), ["level"]);
});

test("each weighted row gets its share of the total", () => {
  assert.deepEqual(weightShares([{ weight: 1 }, { weight: 3 }, {}]), [0.25, 0.75, undefined]);
  assert.deepEqual(weightShares([{ weight: 0 }]), [undefined]);
});

test("a path is told with the labels of the form", () => {
  assert.deepEqual(pathLabels(COLLECTIONS.questTemplates.schema, "steps[2].scene"), ["Étapes", "3", "Scène"]);
  assert.deepEqual(pathLabels(COLLECTIONS.ambiences.schema, "layers[0].when.weather"), ["Sous-ambiances", "1", "Conditions", "Météo"]);
  assert.deepEqual(pathLabels(settingsSchema, "noiseBed.category"), ["Fond sonore continu", "Catégorie du son"]);
  assert.deepEqual(pathLabels(COLLECTIONS.monsters.schema, "old.thing"), ["old", "thing"]);
  assert.deepEqual(pathLabels(COLLECTIONS.monsters.schema, ""), []);
});

test("an id is proposed from a title", () => {
  assert.equal(slugify("Forêt d’Elwynn"), "foret-d-elwynn");
  assert.equal(slugify("  Alpha Grisecroc !"), "alpha-grisecroc");
  assert.equal(slugify("œil"), "il");
});
