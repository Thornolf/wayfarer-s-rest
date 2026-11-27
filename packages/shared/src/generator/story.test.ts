import assert from "node:assert/strict";
import { test } from "node:test";
import { newCharacter } from "../progression/character";
import { createRng } from "../rng";
import { WEATHER_KINDS, type WeatherKind } from "../schema/common";
import { loadStarterCatalog } from "../starter";
import { indexCatalog } from "../world";
import { daylightAt, drawStartHour } from "./daylight";
import { HEARD_END_INTENSITY, intensityAt, sceneFit } from "./intensity";
import { planNight, restReserve } from "./planner";
import { generateStory } from "./story";
import type { StoryBeat, StoryInput } from "./types";
import { WeatherTrack } from "./weather";

const catalog = loadStarterCatalog();
const world = indexCatalog(catalog);
const hero = { ...newCharacter("Aldric", "m"), level: 5 };
const input = (seed: number, more: Partial<StoryInput> = {}): StoryInput => ({ seed, catalog, character: hero, soundMinutes: 30, ...more });
const HOUR = 3600;

/** The beats of a story that start before a time. */
function until(story: StoryInput, seconds: number): StoryBeat[] {
  const beats: StoryBeat[] = [];
  for (const beat of generateStory(story)) {
    if (beat.event.at >= seconds) break;
    beats.push(beat);
  }
  return beats;
}
const eventsOf = (story: StoryInput, seconds: number) => until(story, seconds).map((beat) => beat.event);
const seeds = (count: number) => Array.from({ length: count }, (_, n) => n + 1);

test("same seed, same catalog, same character: the same story", () => {
  assert.deepEqual(until(input(4821), 2 * HOUR), until(input(4821), 2 * HOUR));
});

test("different seeds tell different stories", () => {
  const stories = [4821, 4822, 1].map((seed) => JSON.stringify(eventsOf(input(seed), HOUR)));
  assert.equal(new Set(stories).size, 3);
});

test("stable prefix: the night until 3 is the beginning of the night until 7", () => {
  const short = until(input(4821), 3 * HOUR);
  const long = until(input(4821), 7 * HOUR);
  assert.ok(long.length > short.length);
  assert.deepEqual(long.slice(0, short.length), short);
});

test("events follow each other without gap, from the start of the night", () => {
  const events = eventsOf(input(7), 4 * HOUR);
  assert.equal(events[0]?.at, 0);
  events.forEach((event, n) => {
    assert.equal(event.index, n);
    assert.ok(event.duration >= 1);
    if (n > 0) assert.equal(event.at, (events[n - 1]?.at ?? 0) + (events[n - 1]?.duration ?? 0));
  });
});

test("a night stays in one zone, and every event happens in a place of that zone", () => {
  for (const seed of seeds(10)) {
    const zone = planNight(input(seed), world).zone.id;
    for (const event of eventsOf(input(seed), 2 * HOUR)) assert.equal(world.byId.places.get(event.place)?.zone, zone);
  }
});

test("quests run their steps in order and end at their giver", () => {
  const beats = until(input(11), 6 * HOUR);
  const order = ["accept", "travel", "do", "return", "turnIn"];
  beats.forEach(({ event, quest }, n) => {
    const previous = beats[n - 1];
    if (previous && previous.quest === quest) assert.ok(order.indexOf(event.step) >= order.indexOf(previous.event.step));
    if (event.step === "accept" || event.step === "turnIn") assert.equal(event.place, quest.giver);
    if (event.step === "do") assert.equal(event.place, quest.place);
  });
  assert.ok(beats.some(({ event }) => event.questDone === true));
});

test("adding an item does not change the story or the outcome of fights", () => {
  const item = { ...catalog.items[0], id: "objet-de-plus", rarity: "common" as const };
  const more = { ...catalog, items: [...catalog.items, item] } as typeof catalog;
  const strip = (story: StoryInput) => eventsOf(story, 6 * HOUR).map(({ gains, ...event }) => ({ ...event, xp: gains?.xp ?? 0, drops: gains?.items.length ?? 0 }));
  assert.deepEqual(strip(input(4821, { catalog: more })), strip(input(4821)));
  assert.ok(strip(input(4821)).some((event) => event.fight));
});

test("adding a summary sentence does not change the events", () => {
  const sentence = { ...catalog.summarySentences[0], id: "phrase-de-plus" };
  const more = { ...catalog, summarySentences: [...catalog.summarySentences, sentence] } as typeof catalog;
  assert.deepEqual(eventsOf(input(4821, { catalog: more }), 3 * HOUR), eventsOf(input(4821), 3 * HOUR));
});

test("the intensity falls all along the sound timer, then holds at the silent level", () => {
  const curve = { soundSeconds: 1800, start: 1, silent: 0.8 };
  assert.equal(intensityAt(0, curve), 1);
  assert.ok(Math.abs(intensityAt(1799.99, curve) - HEARD_END_INTENSITY) < 0.001);
  assert.equal(intensityAt(1800, curve), 0.8);
  assert.equal(intensityAt(20000, curve), 0.8);
  assert.equal(sceneFit(0.3, 0.5), 1);
  assert.ok(sceneFit(0.9, 0.2) < sceneFit(0.9, 0.6));
  assert.ok(sceneFit(1, 0) > 0);

  for (const seed of seeds(10)) {
    const heard = eventsOf(input(seed), 1800);
    heard.forEach((event, n) => assert.ok(n === 0 || event.intensity < (heard[n - 1]?.intensity ?? 0), `seed ${seed}, event ${n}`));
    assert.equal(eventsOf(input(seed), 2 * HOUR).at(-1)?.intensity, catalog.settings.silentIntensity);
  }
});

test("fights thin out as the timer runs: more of them in the first third than in the last", () => {
  let early = 0;
  let late = 0;
  for (const seed of seeds(40)) {
    for (const event of eventsOf(input(seed, { soundMinutes: 60 }), HOUR)) {
      if (event.kind !== "fight") continue;
      if (event.at < HOUR / 3) early += 1;
      if (event.at >= (2 * HOUR) / 3) late += 1;
    }
  }
  assert.ok(early > 3 * late, `${early} fights early, ${late} late`);
});

test("the last scene heard is a rest, in a rest quest that began well before the sound ends", () => {
  for (const soundMinutes of [15, 30, 60, 120]) {
    for (const seed of seeds(25)) {
      const beats = until(input(seed, { soundMinutes }), soundMinutes * 60);
      const last = beats.at(-1) as StoryBeat;
      assert.equal(last.event.kind, "rest", `seed ${seed}, ${soundMinutes} min: ${last.event.scene}`);
      assert.equal(last.quest.kind, "rest");
      assert.ok(last.event.at + last.event.duration >= soundMinutes * 60, "the rest carries the final fade");
      const firstRest = beats.find((beat) => beat.quest === last.quest && beat.event.kind === "rest") as StoryBeat;
      assert.ok(soundMinutes * 60 - firstRest.event.at >= 60, `seed ${seed}: the rest starts too late`);
    }
  }
});

test("the way to the final rest fills the wait: the rest itself begins about one reserve before the sound ends", () => {
  const longestScene = Math.max(...catalog.sceneTemplates.map((scene) => scene.duration.max));
  for (const soundMinutes of [15, 30, 60, 120]) {
    const soundSeconds = soundMinutes * 60;
    for (const seed of seeds(25)) {
      const beats = until(input(seed, { soundMinutes }), soundSeconds);
      const final = (beats.at(-1) as StoryBeat).quest;
      const rest = beats.find((beat) => beat.quest === final && beat.event.step === "do") as StoryBeat;
      const earliest = Math.max(final.at, soundSeconds - restReserve(soundSeconds) - longestScene);
      assert.ok(rest.event.at >= earliest, `seed ${seed}, ${soundMinutes} min: the rest begins at ${rest.event.at}, before ${earliest}`);
    }
  }
});

test("the same quest is not given twice in a row, but for the rest that ends the heard part", () => {
  for (const seed of seeds(20)) {
    const quests = [...new Set(until(input(seed), 6 * HOUR).map((beat) => beat.quest))];
    const lastHeard = quests.filter((quest) => quest.at < 1800).at(-1);
    for (const [index, quest] of quests.entries()) {
      if (index === 0 || quest === lastHeard) continue;
      assert.notEqual(quest.template, quests[index - 1]?.template, `seed ${seed}: « ${quest.title} » follows the same quest`);
    }
  }
});

test("a night with no rest quest says so and still goes on", () => {
  const restless = { ...catalog, questTemplates: catalog.questTemplates.filter((quest) => quest.kind !== "rest") };
  const story = input(3, { catalog: restless });
  assert.deepEqual(planNight(story).warnings, [{ kind: "noRestQuest", zone: planNight(story).zone.id }]);
  assert.ok(eventsOf(story, HOUR).length > 10);
  assert.deepEqual(planNight(input(3)).warnings, []);
});

test("the weather changes slowly and only to a neighbour", () => {
  const order = Object.keys(WEATHER_KINDS) as WeatherKind[];
  const minSeconds = 20 * 60;
  for (const zone of catalog.zones) {
    const track = new WeatherTrack(zone.weather, createRng(`weather-${zone.id}`), minSeconds);
    let previous = track.at(0);
    let since = 0;
    const seen = new Set([previous]);
    for (let at = 10; at < 60 * HOUR; at += 10) {
      const now = track.at(at);
      if (now !== previous) {
        assert.equal(Math.abs(order.indexOf(now) - order.indexOf(previous)), 1, `${previous} to ${now}`);
        assert.ok(at - since >= minSeconds, `${previous} lasted ${at - since} s`);
        since = at;
        previous = now;
        seen.add(now);
      }
    }
    assert.ok(seen.size >= 3, `${zone.id} only saw ${[...seen]}`);
  }
  const dry = new WeatherTrack({ clear: 1, cloudy: 0, rain: 0, storm: 0 }, createRng(1), 60);
  assert.deepEqual([dry.at(0), dry.at(5000), dry.at(50000)], ["clear", "clear", "clear"]);
});

test("the world has its own clock, running at the pace of the night", () => {
  assert.equal(daylightAt(6, 0), "dawn");
  assert.equal(daylightAt(6, 2 * HOUR), "day");
  assert.equal(daylightAt(17.5, HOUR), "dusk");
  assert.equal(daylightAt(20, 2 * HOUR), "night");
  assert.equal(daylightAt(23, 3 * HOUR), "night");
  assert.equal(daylightAt(23, 7 * HOUR), "dawn");
  for (const daylight of ["dawn", "day", "dusk", "night"] as const) {
    for (const seed of seeds(20)) {
      const hour = drawStartHour(createRng(seed), daylight);
      assert.ok(hour >= 0 && hour < 24);
      assert.equal(daylightAt(hour, 0), daylight);
    }
  }
});

test("the settings of the Adventure button are obeyed", () => {
  for (const zone of catalog.zones) {
    const story = input(5, { settings: { zone: zone.id, daylight: "dusk", weather: "rain", questKind: "gather", intensity: 0.5 } });
    const [first] = until(story, 60);
    assert.equal(planNight(story).zone.id, zone.id);
    assert.equal(first?.event.daylight, "dusk");
    assert.equal(first?.event.weather, "rain");
    assert.equal(first?.quest.kind, "gather");
    assert.equal(first?.event.intensity, 0.5);
  }
});

test("zones, quests and monsters that are archived never come out", () => {
  const [gone, ...kept] = catalog.zones;
  const archived = {
    ...catalog,
    zones: [{ ...gone, archived: true }, ...kept] as typeof catalog.zones,
    questTemplates: catalog.questTemplates.map((quest) => ({ ...quest, archived: quest.kind === "hunt" })),
  };
  for (const seed of seeds(12)) {
    const story = input(seed, { catalog: archived });
    assert.notEqual(planNight(story).zone.id, gone?.id);
    for (const { quest } of until(story, 2 * HOUR)) assert.notEqual(quest.kind, "hunt");
  }
});

test("group quests bring companions, and those already met come back more often", () => {
  const appearances = (known: string[]) => {
    const counts: Record<string, number> = {};
    for (const seed of seeds(30)) {
      const quests = new Set(until(input(seed, { character: { ...hero, knownCompanions: known } }), 3 * HOUR).map((beat) => beat.quest));
      for (const quest of quests) {
        assert.equal(new Set(quest.companions).size, quest.companions.length);
        if (quest.companions.length > 0) assert.ok(world.byId.questTemplates.get(quest.template)?.group);
        // Whoever joins during the night is known from then on, so only the first group tells.
        if (quest.companions.length > 0 && ![...quests].some((other) => other.index < quest.index && other.companions.length > 0)) {
          for (const id of quest.companions) counts[id] = (counts[id] ?? 0) + 1;
        }
      }
    }
    return counts;
  };
  const strangers = appearances([]);
  const withBrann = appearances(["brann"]);
  assert.ok(Object.keys(strangers).length >= 3);
  assert.ok((withBrann.brann ?? 0) > (strangers.brann ?? 0), `${withBrann.brann} with Brann known, ${strangers.brann} without`);
});

test("in a group the fights are group fights; alone, they are not", () => {
  for (const { event, quest } of until(input(21), 6 * HOUR)) {
    const scene = world.byId.sceneTemplates.get(event.scene);
    if (scene?.group === "group") assert.ok(quest.companions.length > 0);
    if (scene?.group === "solo") assert.equal(quest.companions.length, 0);
  }
});

test("a fight is against the quest's monster when it has the rank, and a decisive flight fails the quest", () => {
  let failed = 0;
  let bosses = 0;
  for (const seed of seeds(60)) {
    const beats = until(input(seed), 4 * HOUR);
    for (const { event, quest } of beats) {
      if (!event.fight) continue;
      const monster = world.byId.monsters.get(event.fight.monster);
      assert.equal(monster?.rank, event.fight.rank);
      assert.ok(planNight(input(seed), world).zone.monsters.includes(event.fight.monster));
      const target = quest.monster === undefined ? undefined : world.byId.monsters.get(quest.monster);
      if (target?.rank === event.fight.rank) assert.equal(event.fight.monster, quest.monster);
      if (event.fight.rank === "boss") bosses += 1;
    }
    for (const { event, quest } of beats.filter((beat) => beat.event.questDone === false)) {
      failed += 1;
      const fights = beats.filter((beat) => beat.quest === quest && beat.event.fight?.monster === quest.monster);
      assert.ok(fights.length > 0 && fights.every((beat) => beat.event.fight?.result === "flee"));
      assert.equal(event.gains, undefined);
      assert.ok(!event.transitions.includes("turnin"));
    }
  }
  assert.ok(bosses > 0, "no boss fight in 60 nights");
  assert.ok(failed > 0, "no failed quest in 60 nights");
});
