import assert from "node:assert/strict";
import { test } from "node:test";
import { generateStory } from "../generator/story";
import type { CharacterSnapshot, Gear, ItemInstance, PityCounters } from "../generator/types";
import { generateNight } from "../night";
import { createRng } from "../rng";
import { RARITIES, type Rarity } from "../schema/common";
import { loadStarterCatalog } from "../starter";
import { indexCatalog } from "../world";
import { newCharacter } from "./character";
import { lootMultiplier, successChance } from "./fight";
import { equipBetter, gearScore } from "./gear";
import { advancePity, rollLoot } from "./loot";
import { applyNight, nightTotals } from "./totals";
import { addXp, xpToNextLevel } from "./xp";

const catalog = loadStarterCatalog();
const world = indexCatalog(catalog);
const settings = catalog.settings;
const hero: CharacterSnapshot = { ...newCharacter("Aldric", "m"), level: 5 };
const HOUR = 3600;

/** A full set of the best items of a rarity, found at a level. */
function setOf(rarity: Rarity, level: number): Gear {
  const gear: Gear = {};
  for (const item of catalog.items.filter((candidate) => candidate.rarity === rarity)) gear[item.slot] = { item: item.id, rarity, level };
  return gear;
}

test("each level asks for more XP than the one before, and XP can pay for several levels at once", () => {
  const curve = { base: 100, growth: 1.5 };
  assert.deepEqual([1, 2, 3].map((level) => xpToNextLevel(level, curve)), [100, 150, 225]);
  assert.deepEqual(addXp({ level: 1, xp: 0 }, 99, curve), { level: 1, xp: 99 });
  assert.deepEqual(addXp({ level: 1, xp: 99 }, 1, curve), { level: 2, xp: 0 });
  assert.deepEqual(addXp({ level: 1, xp: 50 }, 250, curve), { level: 3, xp: 50 });
  assert.deepEqual(addXp({ level: 4, xp: 10 }, 0, curve), { level: 4, xp: 10 });
});

test("gear is scored like a level, and better gear wins more fights within the bounds", () => {
  assert.equal(gearScore({}, world), 0);
  assert.ok(Math.abs(gearScore(setOf("common", 12), world) - 12) < 2);
  assert.ok(gearScore(setOf("epic", 12), world) > gearScore(setOf("rare", 12), world));

  const fighter = (gear: Gear, inGroup = false) => ({ gearScore: gearScore(gear, world), level: 12, inGroup });
  for (const rank of ["normal", "elite", "boss"] as const) {
    const naked = successChance(rank, fighter({}), settings);
    const geared = successChance(rank, fighter(setOf("epic", 12)), settings);
    assert.ok(geared > naked, rank);
    assert.ok(successChance(rank, fighter({}, true), settings) > naked, `${rank} in a group`);
    for (const chance of [naked, geared, successChance(rank, { gearScore: 999, level: 1, inGroup: true }, settings)]) {
      assert.ok(chance >= settings.successBounds.min && chance <= settings.successBounds.max);
    }
  }
  assert.ok(successChance("normal", fighter({}), settings) > successChance("boss", fighter({}), settings));
  assert.ok(lootMultiplier(fighter(setOf("epic", 12), true), settings) > lootMultiplier(fighter({}), settings));
});

test("what was found is worn when it is stronger than what is worn", () => {
  const sword: ItemInstance = { item: "epee-de-milicien", rarity: "common", level: 5 };
  const better: ItemInstance = { item: "lame-de-brumefer", rarity: "rare", level: 5 };
  const old: ItemInstance = { item: "lame-de-brumefer", rarity: "rare", level: 1 };
  const gear = equipBetter({}, [sword], world);
  assert.deepEqual(gear, { weapon: sword });
  assert.deepEqual(equipBetter(gear, [old, better], world), { weapon: better });
  assert.deepEqual(equipBetter({ weapon: better }, [sword, { item: "disparu", rarity: "epic", level: 9 }], world), { weapon: better });
  assert.deepEqual(gear, { weapon: sword }, "the gear given is left untouched");
});

test("loot: a rarity by the rates, an item of that rarity at the character's level", () => {
  const roll = (seed: number, rates: Record<Rarity, number>, pity: PityCounters = { rare: 0, epic: 0 }) =>
    rollLoot({ rates, multiplier: 1, pity, items: world.active.items, level: 7, rng: createRng(seed) });
  assert.deepEqual(roll(1, settings.lootRates.elite), roll(1, settings.lootRates.elite));

  const counts = Object.fromEntries(Object.keys(RARITIES).map((rarity) => [rarity, 0]));
  for (let seed = 0; seed < 2000; seed++) {
    const { item } = roll(seed, settings.lootRates.elite);
    assert.ok(item);
    assert.equal(item.level, 7);
    assert.equal(world.byId.items.get(item.item)?.rarity, item.rarity);
    counts[item.rarity] = (counts[item.rarity] ?? 0) + 1;
  }
  assert.ok((counts.common ?? 0) > (counts.rare ?? 0) && (counts.rare ?? 0) > (counts.epic ?? 0) && (counts.epic ?? 0) > (counts.legendary ?? 0), JSON.stringify(counts));

  assert.equal(roll(1, { common: 0, rare: 0, epic: 0, legendary: 1 }).item?.rarity, "legendary");
  assert.deepEqual(roll(1, { common: 0, rare: 0, epic: 0, legendary: 0 }), { item: null, pity: { rare: 0, epic: 0 } });
  const noLegend = world.active.items.filter((item) => item.rarity !== "legendary");
  const stepDown = rollLoot({ rates: { common: 0, rare: 0, epic: 0, legendary: 1 }, multiplier: 1, pity: { rare: 3, epic: 3 }, items: noLegend, level: 2, rng: createRng(1) });
  assert.equal(stepDown.item?.rarity, "epic", "no item of the rarity drawn: the next one down");
  assert.deepEqual(rollLoot({ rates: settings.lootRates.boss, multiplier: 1, pity: { rare: 3, epic: 3 }, items: [], level: 2, rng: createRng(1) }), {
    item: null,
    pity: { rare: 3, epic: 3 },
  });
});

test("pity: the counters wait or start over, and an overdue rarity becomes certain", () => {
  assert.deepEqual(advancePity({ rare: 4, epic: 9 }, "common"), { rare: 5, epic: 10 });
  assert.deepEqual(advancePity({ rare: 4, epic: 9 }, "rare"), { rare: 0, epic: 10 });
  assert.deepEqual(advancePity({ rare: 4, epic: 9 }, "legendary"), { rare: 0, epic: 0 });

  const rates = { common: 90, rare: 9, epic: 1, legendary: 0 };
  const rarities = (pity: PityCounters) =>
    Array.from({ length: 300 }, (_, seed) => rollLoot({ rates, multiplier: 1, pity, items: world.active.items, level: 1, rng: createRng(seed) }).item?.rarity);
  // One drop in ten is rare or better: after twenty without one, the next is.
  assert.ok(rarities({ rare: 20, epic: 0 }).every((rarity) => rarity !== "common"));
  assert.ok(rarities({ rare: 0, epic: 200 }).every((rarity) => rarity === "epic"));
  assert.ok(rarities({ rare: 10, epic: 0 }).filter((rarity) => rarity === "common").length > 200, "not overdue yet: the plain odds");
  const halfway = rarities({ rare: 15, epic: 0 }).filter((rarity) => rarity !== "common").length;
  assert.ok(halfway > 100 && halfway < 250, `${halfway} rescued out of 300 halfway to certainty`);
});

test("better gear and company find rarer loot", () => {
  const rare = (multiplier: number) =>
    Array.from({ length: 2000 }, (_, seed) =>
      rollLoot({ rates: settings.lootRates.normal, multiplier, pity: { rare: 0, epic: 0 }, items: world.active.items, level: 1, rng: createRng(seed) }).item?.rarity,
    ).filter((rarity) => rarity !== "common").length;
  assert.ok(rare(2) > 1.5 * rare(1));
});

test("gains: XP for fights won, scenes and quests turned in; nothing for a flight", () => {
  const story = generateStory({ seed: 12, catalog, character: hero, soundMinutes: 30 });
  let progress = { level: hero.level, xp: hero.xp };
  for (const { event } of story) {
    if (event.at > 8 * HOUR) break;
    const scene = world.byId.sceneTemplates.get(event.scene);
    if (event.fight?.result === "flee") assert.ok((event.gains?.xp ?? 0) === 0 || event.questDone, "a flight earns nothing");
    if (event.fight?.result === "win") assert.ok((event.gains?.xp ?? 0) >= settings.fightXp[event.fight.rank]);
    if (!event.fight && !event.questDone) assert.equal(event.gains?.xp ?? 0, scene?.xp ?? 0);
    if (event.gains) {
      const next = addXp(progress, event.gains.xp, settings.xpCurve);
      assert.deepEqual({ level: event.gains.level, xp: event.gains.levelXp }, next);
      assert.equal(event.gains.levelUp, next.level > progress.level);
      for (const item of event.gains.items) assert.equal(item.level, progress.level, "an item takes the level of the moment");
      progress = next;
    }
  }
  assert.ok(progress.level > hero.level);
});

test("the gear of bedtime decides the odds all night: a geared character flees less", () => {
  const flights = (gear: Gear) => {
    let fled = 0;
    for (let seed = 1; seed <= 15; seed++) {
      fled += nightTotals(generateNight({ seed, catalog, character: { ...hero, gear }, soundMinutes: 30, durationSeconds: 4 * HOUR })).fightsFled;
    }
    return fled;
  };
  assert.ok(flights(setOf("epic", 9)) < flights({}));
});

test("totals at a cut add up the events that started before it", () => {
  const night = generateNight({ seed: 4821, catalog, character: hero, soundMinutes: 30, durationSeconds: 7 * HOUR });
  const whole = nightTotals(night);
  const cut = nightTotals(night, 3 * HOUR);
  const before = night.events.filter((event) => event.at < 3 * HOUR);

  assert.equal(cut.xp, before.reduce((sum, event) => sum + (event.gains?.xp ?? 0), 0));
  assert.deepEqual(cut.items, before.flatMap((event) => event.gains?.items ?? []));
  assert.deepEqual({ level: cut.level, xp: cut.levelXp }, addXp({ level: hero.level, xp: hero.xp }, cut.xp, settings.xpCurve));
  assert.equal(cut.levelsGained, cut.level - hero.level);
  assert.equal(cut.fightsWon + cut.fightsFled, before.filter((event) => event.fight).length);
  assert.ok(whole.xp > cut.xp && whole.questsDone > cut.questsDone && cut.questsDone > 0);
  assert.deepEqual(nightTotals(night, 0), { xp: 0, items: [], level: 5, levelXp: 0, levelsGained: 0, questsDone: 0, fightsWon: 0, fightsFled: 0, companions: [] });
  assert.deepEqual(nightTotals(night, Infinity), whole);
});

test("the character that wakes up: level, companions met, pity and served sentences; same gear", () => {
  const start = { ...hero, knownCompanions: ["brann"], gear: setOf("common", 5), pity: { rare: 2, epic: 2 } };
  const night = generateNight({ seed: 4821, catalog, character: start, soundMinutes: 30, durationSeconds: 7 * HOUR });
  const totals = nightTotals(night);
  const awake = applyNight(start, night);

  assert.equal(awake.level, totals.level);
  assert.equal(awake.xp, totals.levelXp);
  assert.deepEqual(awake.gear, start.gear);
  assert.ok(awake.knownCompanions.includes("brann"));
  assert.ok(totals.companions.every((id) => awake.knownCompanions.includes(id)));
  assert.equal(new Set(awake.knownCompanions).size, awake.knownCompanions.length);
  assert.deepEqual(awake.pity, totals.items.reduce((pity, item) => advancePity(pity, item.rarity), start.pity));
  assert.deepEqual(awake.servedSentences, night.summary.served);
  assert.deepEqual(start.pity, { rare: 2, epic: 2 }, "the snapshot given is left untouched");
});
