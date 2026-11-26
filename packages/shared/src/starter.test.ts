import assert from "node:assert/strict";
import { test } from "node:test";
import { localize } from "./locale";
import { createRng } from "./rng";
import {
  COLLECTION_NAMES,
  FLOORS,
  HIGHLIGHT_KINDS,
  HIGHLIGHT_SLOTS,
  ITEM_SLOTS,
  MONSTER_RANKS,
  QUEST_KINDS,
  WEATHER_KINDS,
  catalogHash,
  checkReferences,
  type Catalog,
  type EventTable,
  type HighlightKind,
  type Place,
  type SceneTemplate,
  type SoundCategory,
} from "./schema";
import { loadStarterCatalog } from "./starter";
import { properNoun } from "./text/french";
import { renderTemplate, type SlotValue } from "./text/template";

const catalog = loadStarterCatalog();
const keys = <K extends string>(labels: Record<K, string>) => Object.keys(labels) as K[];
const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((item) => [item.id, item]));
const scenes = byId(catalog.sceneTemplates);
const categories = byId(catalog.soundCategories);
const placesOf = (zone: string) => catalog.places.filter((place) => place.zone === zone);

/** Every French text of the catalog, with where it is. */
function frenchTexts(value: unknown, path: string): { path: string; text: string }[] {
  if (Array.isArray(value)) return value.flatMap((element, i) => frenchTexts(element, `${path}[${i}]`));
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, inner]) =>
    key === "fr" && typeof inner === "string" ? [{ path, text: inner }] : frenchTexts(inner, `${path}.${key}`),
  );
}

test("the starter world passes the schema and has no broken reference", () => {
  assert.deepEqual(checkReferences(catalog), []);
  assert.match(catalogHash(catalog), /^[0-9a-f]{32}$/);
});

test("everything is marked as written by an AI, and nothing is archived", () => {
  for (const name of COLLECTION_NAMES) {
    for (const item of catalog[name]) {
      assert.equal(item.aiGenerated, true, `${name}/${item.id}`);
      assert.equal(item.archived, false, `${name}/${item.id}`);
    }
  }
});

test("no sound file yet: only categories", () => {
  assert.equal(catalog.sounds.length, 0);
});

test("three zones, each with a town, an inn, two wild places, a cave and a camp", () => {
  assert.equal(catalog.zones.length, 3);
  for (const zone of catalog.zones) {
    const kinds = placesOf(zone.id).map((place) => place.kind).sort();
    assert.deepEqual(kinds, ["camp", "cave", "inn", "town", "wild", "wild"], zone.id);
    assert.ok(Object.values(zone.weather).some((weight) => weight > 0), `${zone.id}: weather`);
  }
});

test("fifteen monsters: each lives in one zone, each zone has every rank and a single boss", () => {
  assert.equal(catalog.monsters.length, 15);
  const monsters = byId(catalog.monsters);
  const housed = catalog.zones.flatMap((zone) => zone.monsters);
  assert.deepEqual([...housed].sort(), [...monsters.keys()].sort());
  for (const zone of catalog.zones) {
    const ranks = zone.monsters.map((id) => monsters.get(id)?.rank);
    for (const rank of keys(MONSTER_RANKS)) assert.ok(ranks.includes(rank), `${zone.id}: no ${rank}`);
    assert.equal(ranks.filter((rank) => rank === "boss").length, 1, `${zone.id}: bosses`);
  }
});

test("quests of every kind, a group quest against an elite and a zone boss", () => {
  assert.ok(catalog.questTemplates.length >= 8);
  for (const kind of keys(QUEST_KINDS)) {
    assert.ok(catalog.questTemplates.some((quest) => quest.kind === kind), `no ${kind} quest`);
  }
  for (const rank of ["elite", "boss"] as const) {
    assert.ok(catalog.questTemplates.some((quest) => quest.monsterRank === rank && quest.group), `no group quest against a ${rank}`);
  }
});

test("every quest can take place in some zone", () => {
  for (const quest of catalog.questTemplates) {
    const zones = quest.zones?.length ? quest.zones : catalog.zones.map((zone) => zone.id);
    const fits = zones.some((zone) => placesOf(zone).some((place) => quest.placeKinds.includes(place.kind)));
    assert.ok(fits, `${quest.id} has nowhere to happen`);
  }
});

function fits(scene: SceneTemplate, place: Place, inGroup: boolean): boolean {
  if (scene.floors?.length && !scene.floors.includes(place.floor)) return false;
  if (scene.placeKinds?.length && !scene.placeKinds.includes(place.kind)) return false;
  return scene.group === "any" || scene.group === (inGroup ? "group" : "solo");
}

function hasRowFor(table: EventTable, place: Place, inGroup: boolean): boolean {
  return table.rows.some((row) => row.weight > 0 && fits(scenes.get(row.scene) as SceneTemplate, place, inGroup));
}

test("an event table always has a scene to offer, wherever a quest uses it, alone or in a group", () => {
  const tables = byId(catalog.eventTables);
  const used = new Set<string>();
  for (const quest of catalog.questTemplates) {
    const zones = quest.zones?.length ? quest.zones : catalog.zones.map((zone) => zone.id);
    const everywhere = zones.flatMap(placesOf);
    for (const step of quest.steps) {
      if (!step.eventTable) continue;
      used.add(step.eventTable);
      const table = tables.get(step.eventTable) as EventTable;
      const places = step.action === "do" ? everywhere.filter((place) => quest.placeKinds.includes(place.kind)) : everywhere;
      for (const place of places) {
        for (const inGroup of quest.group ? [false, true] : [false]) {
          assert.ok(hasRowFor(table, place, inGroup), `${quest.id}: table ${table.id} has nothing for ${place.id} (group: ${inGroup})`);
        }
      }
    }
  }
  assert.deepEqual([...used].sort(), [...tables.keys()].sort(), "every table is used by a quest");
});

test("scenes: one way of walking per floor, and every scene sits in some table", () => {
  assert.ok(catalog.sceneTemplates.length >= 14);
  for (const floor of keys(FLOORS)) {
    assert.ok(catalog.sceneTemplates.some((scene) => scene.kind === "walk" && scene.floors?.includes(floor)), `no walk on ${floor}`);
  }
  const inTables = new Set(catalog.eventTables.flatMap((table) => table.rows.map((row) => row.scene)));
  for (const scene of catalog.sceneTemplates) assert.ok(inTables.has(scene.id), `${scene.id} is in no table`);
  for (const scene of catalog.sceneTemplates) assert.ok(scene.duration.min >= 10 && scene.duration.max <= 600, scene.id);
});

test("about thirty items: every slot has common, rare and epic gear, and legends exist", () => {
  assert.ok(catalog.items.length >= 30);
  for (const slot of keys(ITEM_SLOTS)) {
    const rarities = catalog.items.filter((item) => item.slot === slot).map((item) => item.rarity);
    for (const rarity of ["common", "rare", "epic"] as const) assert.ok(rarities.includes(rarity), `${slot}: no ${rarity}`);
  }
  assert.ok(catalog.items.some((item) => item.rarity === "legendary"));
  const power = (rarity: string) => catalog.items.filter((item) => item.rarity === rarity).map((item) => item.power);
  assert.ok(Math.max(...power("common")) < Math.min(...power("rare")));
  assert.ok(Math.max(...power("rare")) < Math.min(...power("epic")));
  assert.ok(Math.max(...power("epic")) < Math.min(...power("legendary")));
});

test("four companions, three quips each, every role covered", () => {
  assert.equal(catalog.companions.length, 4);
  for (const companion of catalog.companions) assert.equal(companion.quips.length, 3, companion.id);
  assert.deepEqual([...new Set(catalog.companions.map((companion) => companion.role))].sort(), ["damage", "healer", "tank"]);
});

test("the sound categories of the plan are there, each used somewhere", () => {
  const planned = [
    ...["foret", "taverne", "grotte", "marais", "pluie", "vent"],
    ...["marche-herbe", "marche-bois", "marche-pierre", "combat", "minage", "monture"],
    ...["oiseau", "hibou", "loup", "tonnerre", "voix"],
    ...["accept", "turnin", "levelup", "porte"],
  ];
  for (const id of planned) assert.ok(categories.has(id), `missing category ${id}`);

  const used = new Set<string | undefined>([
    ...catalog.ambiences.flatMap((ambience) => [...ambience.layers, ...ambience.oneShots].map((entry) => entry.category)),
    ...catalog.sceneTemplates.map((scene) => scene.actionCategory),
    ...catalog.places.map((place) => place.enterTransition),
    ...catalog.questTemplates.flatMap((quest) => quest.steps.map((step) => step.transition)),
    ...catalog.soundCategories.map((category) => category.fallback),
    catalog.settings.levelUpTransition,
    catalog.settings.noiseBed.category,
  ]);
  for (const category of catalog.soundCategories) assert.ok(used.has(category.id), `${category.id} is used nowhere`);
});

test("one-shots have a gap; fallbacks stay in their layer and never loop", () => {
  for (const category of catalog.soundCategories) {
    if (category.layer === "oneShot") assert.ok(category.minGap && category.minGap.min >= 10, `${category.id}: gap`);
    const seen = new Set([category.id]);
    for (let next = category.fallback; next !== undefined; ) {
      const fallback = categories.get(next) as SoundCategory;
      assert.equal(fallback.layer, category.layer, `${category.id} falls back to another layer`);
      assert.ok(!seen.has(next), `${category.id}: fallback loop`);
      seen.add(next);
      next = fallback.fallback;
    }
  }
});

test("ambiences are layered: a constant base, layers that come and go, every ambience used", () => {
  const used = new Set(catalog.places.map((place) => place.ambience));
  for (const ambience of catalog.ambiences) {
    assert.ok(used.has(ambience.id), `${ambience.id} is used by no place`);
    assert.ok(ambience.layers.length >= 3, `${ambience.id}: layers`);
    const base = ambience.layers[0];
    assert.ok(base && base.probability === 1 && base.when === undefined, `${ambience.id}: the first layer is always there`);
  }
  const conditions = catalog.ambiences.flatMap((ambience) => ambience.layers.map((layer) => layer.when));
  assert.ok(conditions.some((when) => when?.weather?.length), "some layer depends on the weather");
  assert.ok(conditions.some((when) => when?.daylight?.length), "some layer depends on the time of day");
});

test("settings: a soft noise bed, rarer loot from weaker monsters", () => {
  const { noiseBed, lootRates, successBase, successBounds } = catalog.settings;
  assert.ok(noiseBed.volume > 0 && noiseBed.volume <= 0.2);
  const rareShare = (rank: "normal" | "elite" | "boss") => {
    const rates = lootRates[rank];
    return (rates.rare + rates.epic + rates.legendary) / (rates.common + rates.rare + rates.epic + rates.legendary);
  };
  assert.ok(rareShare("normal") < rareShare("elite") && rareShare("elite") < rareShare("boss"));
  assert.ok(successBase.normal > successBase.elite && successBase.elite > successBase.boss);
  assert.ok(successBounds.min <= successBase.boss && successBase.normal <= successBounds.max);
});

// --- The prose ------------------------------------------------------------------------------

const sentencesOf = (trigger: HighlightKind) => catalog.summarySentences.filter((sentence) => sentence.trigger === trigger);

test("about sixty summary sentences, five to eight for each highlight", () => {
  assert.ok(catalog.summarySentences.length >= 60);
  for (const trigger of keys(HIGHLIGHT_KINDS)) {
    const count = sentencesOf(trigger).length;
    assert.ok(count >= 5 && count <= 8, `${trigger}: ${count} sentences`);
  }
  const texts = catalog.summarySentences.map((sentence) => sentence.text.fr);
  assert.equal(new Set(texts).size, texts.length, "no sentence is written twice");
});

test("whatever the night, some sentence fits each highlight", () => {
  for (const trigger of ["opening", "questDone", "levelUp", "epicLoot", "flee", "companion", "restAt", "closing"] as const) {
    assert.ok(sentencesOf(trigger).filter((sentence) => sentence.when === undefined).length >= 3, `${trigger}: unconditional sentences`);
  }
  for (const weather of keys(WEATHER_KINDS)) {
    assert.ok(sentencesOf("weatherChange").filter((sentence) => sentence.when?.weather?.includes(weather)).length >= 2, `weather ${weather}`);
  }
  for (const outcome of ["win", "flee"] as const) {
    const anyGroup = sentencesOf("boss").filter((sentence) => sentence.when?.outcome === outcome && sentence.when.companion === undefined);
    assert.ok(anyGroup.length >= 2, `boss ${outcome}: sentences that fit alone or in a group`);
  }
  for (const sentence of catalog.summarySentences) {
    if (sentence.text.fr.includes("{companions}")) assert.equal(sentence.when?.companion, true, `${sentence.id} names companions`);
    if (sentence.text.fr.includes("{count}")) assert.ok((sentence.when?.minCount ?? 0) >= 2, `${sentence.id} counts in the plural`);
  }
});

test("French typography: curly apostrophes and non-breaking spaces", () => {
  for (const { path, text } of frenchTexts(catalog, "catalog")) {
    assert.doesNotMatch(text, /'/, `${path}: straight apostrophe in « ${text} »`);
    assert.doesNotMatch(text, /[ ][;!?]|[^  {a-z][:;!?]/, `${path}: missing non-breaking space in « ${text} »`);
    assert.doesNotMatch(text, /«[^ ]|[^ ]»/, `${path}: missing non-breaking space inside « » in « ${text} »`);
    assert.doesNotMatch(text, / {2}|^ | $/, `${path}: stray space in « ${text} »`);
  }
});

test("no sentence writes an article or « de », « que » by hand before a name", () => {
  const templates = [...catalog.summarySentences.map((sentence) => sentence.text.fr), ...catalog.questTemplates.map((quest) => quest.title.fr)];
  for (const template of templates) {
    assert.doesNotMatch(template, /(?<!\p{L})(?:que|de|du|des|le|la|les|au|aux|à|un|une) \{(?:hero|place|zone|monster|item|companion)[}:]/iu, template);
  }
});

const SAMPLE_SLOTS = (hero: SlotValue, pick: <T>(items: readonly T[]) => T): Record<string, SlotValue> => ({
  hero,
  place: pick(catalog.places).name,
  zone: pick(catalog.zones).name,
  monster: pick(catalog.monsters).name,
  item: pick(catalog.items).name,
  companion: pick(catalog.companions).name,
  companions: "Brann et Mira",
  quip: localize(pick(pick(catalog.companions).quips)),
  quest: "Sus aux loups gris",
  level: 7,
  xp: 1840,
  count: 4,
});

test("every sentence renders for a hero and for a heroine, with every name of the world", () => {
  const rng = createRng("starter-sentences");
  for (const sentence of catalog.summarySentences) {
    const allowed = Object.keys(HIGHLIGHT_SLOTS[sentence.trigger]);
    for (let i = 0; i < 40; i++) {
      const hero = i % 2 ? properNoun("Aldric", "m") : properNoun("Maëlle", "f");
      const all = SAMPLE_SLOTS(hero, (items) => rng.pick(items));
      const slots = Object.fromEntries(allowed.map((slot) => [slot, all[slot] as SlotValue]));
      const text = renderTemplate(sentence.text.fr, slots, { rng });
      assert.doesNotMatch(text, /[{}[\]|]/, `${sentence.id}: ${text}`);
      assert.match(text, /^[«\p{Lu}\d]/u, `${sentence.id} starts without a capital: ${text}`);
      assert.match(text, /[.!?»]$/, `${sentence.id} does not end a sentence: ${text}`);
      assert.doesNotMatch(text, /(?<!\p{L})(?:de le|de les|à le|à les|le [aeiouéèê]|la [aeiouéèê]|de [aeiouéèê])/iu, `${sentence.id}: ${text}`);
    }
  }
});

test("every quest title renders with every place and monster it can name", () => {
  const rng = createRng("starter-titles");
  const monsters = byId(catalog.monsters);
  for (const quest of catalog.questTemplates) {
    const zones = catalog.zones.filter((zone) => !quest.zones?.length || quest.zones.includes(zone.id));
    for (const zone of zones) {
      const foes = zone.monsters.map((id) => monsters.get(id)).filter((monster) => monster?.rank === quest.monsterRank);
      for (const place of placesOf(zone.id).filter((candidate) => quest.placeKinds.includes(candidate.kind))) {
        for (const monster of foes.length ? foes : [undefined]) {
          for (let i = 0; i < 6; i++) {
            const title = renderTemplate(quest.title.fr, { place: place.name, zone: zone.name, ...(monster ? { monster: monster.name } : {}) }, { rng });
            assert.doesNotMatch(title, /[{}[\]|]/, `${quest.id}: ${title}`);
            assert.match(title, /^\p{Lu}/u, `${quest.id}: ${title}`);
            assert.doesNotMatch(title, /(?<!\p{L})(?:de le|de les|à le|à les|de [aeiouéèê])/iu, `${quest.id}: ${title}`);
          }
        }
      }
    }
  }
});

test("names carry the grammar the sentences need", () => {
  const named: { id: string; name: Catalog["zones"][number]["name"] }[] = [
    ...catalog.zones, ...catalog.places, ...catalog.monsters, ...catalog.items, ...catalog.companions,
  ];
  for (const { id, name } of named) {
    assert.doesNotMatch(name.text.fr, /^(?:le|la|les|l’|un|une|des) /i, `${id}: the name must not carry its article`);
  }
  for (const monster of catalog.monsters) {
    if (monster.rank !== "boss") assert.ok(monster.name.plural, `${monster.id} needs a written plural`);
  }
  for (const companion of catalog.companions) assert.equal(companion.name.proper, true, companion.id);
});
