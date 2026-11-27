import assert from "node:assert/strict";
import { test } from "node:test";
import type { TimelineEvent } from "../generator/types";
import { generateNight, type Night } from "../night";
import { newCharacter } from "../progression/character";
import { createRng } from "../rng";
import type { Catalog } from "../schema/catalog";
import { loadStarterCatalog } from "../starter";
import { indexCatalog } from "../world";
import { SoundBank } from "./bank";
import { holds } from "./conditions";
import { finalFadeOf, planSound } from "./plan";
import { withSounds } from "./testSounds";
import type { SoundCue } from "./types";

const starter = loadStarterCatalog();
const sounding = withSounds(starter);
const hero = { ...newCharacter("Aldric", "m"), level: 5 };
const HOUR = 3600;
const night = (seed: number, catalog: Catalog = sounding, soundMinutes = 60): Night =>
  generateNight({ seed, catalog, character: hero, soundMinutes, durationSeconds: 3 * HOUR });
const soundOf = (cue: SoundCue) => ("sound" in cue.source ? cue.source.sound : null);
const endOf = (cue: SoundCue) => cue.at + cue.duration;
const seeds = [1, 2, 3, 4, 5, 6];
const eventAt = (events: TimelineEvent[], at: number) => [...events].reverse().find((event) => event.at <= at) as TimelineEvent;

test("cues come sorted, on every layer, and none plays past the sound timer", () => {
  const { cues, soundSeconds } = night(4821);
  assert.equal(soundSeconds, HOUR);
  for (const layer of ["noiseBed", "ambience", "action", "oneShot", "transition"]) {
    assert.ok(cues.some((cue) => cue.layer === layer), `no ${layer} cue`);
  }
  cues.forEach((cue, n) => {
    assert.ok(n === 0 || cue.at >= (cues[n - 1]?.at ?? 0), "sorted by start");
    assert.ok(cue.at >= 0 && cue.at < soundSeconds && cue.duration > 0);
    assert.ok(endOf(cue) <= soundSeconds + 0.01, `${cue.category} ends at ${endOf(cue)}`);
    assert.ok(cue.fadeIn >= 0 && cue.fadeOut >= 0 && cue.fadeIn <= cue.duration + 0.01 && cue.fadeOut <= cue.duration + 0.01);
  });
});

test("the same night gives the same cues", () => {
  assert.deepEqual(night(7).cues, night(7).cues);
  assert.notDeepEqual(night(7).cues, night(8).cues);
});

test("a continuous noise bed plays from the first second to the last, and fades with the sound", () => {
  const { cues, soundSeconds } = night(4821);
  const beds = cues.filter((cue) => cue.layer === "noiseBed");
  assert.equal(beds.length, 1);
  assert.deepEqual(beds[0], {
    at: 0,
    duration: soundSeconds,
    layer: "noiseBed",
    category: null,
    source: { noise: "brown" },
    loop: true,
    offset: 0,
    volume: starter.settings.noiseBed.volume,
    rate: 1,
    fadeIn: 4,
    fadeOut: 0,
  });

  const fromCategory: Catalog = { ...sounding, settings: { ...sounding.settings, noiseBed: { kind: "sound", volume: 0.1, category: "vent" } } };
  const bed = night(4821, fromCategory).cues.find((cue) => cue.layer === "noiseBed");
  assert.equal(bed?.category, "vent");
  assert.equal(bed?.volume, 0.1);
  assert.equal(bed?.loop, true);
  assert.equal(bed?.duration, soundSeconds);
});

test("the noise bed is never missing: a real sound that cannot play leaves its place to generated noise", () => {
  const bedOf = (catalog: Catalog) => {
    const played = night(4821, { ...catalog, settings: { ...catalog.settings, noiseBed: { kind: "sound", volume: 0.1, category: "vent" } } });
    const beds = played.cues.filter((cue) => cue.layer === "noiseBed");
    assert.equal(beds.length, 1);
    assert.equal(beds[0]?.at, 0);
    assert.equal(beds[0]?.duration, played.soundSeconds);
    return { bed: beds[0] as SoundCue, warned: played.warnings.some((warning) => warning.kind === "noNoiseBedSound" && warning.category === "vent") };
  };
  const generated = { source: { noise: "brown" }, category: null, volume: 0.1, loop: true };
  const pick = ({ source, category, volume, loop }: SoundCue) => ({ source, category, volume, loop });

  // No file in the category yet, or the category archived.
  for (const catalog of [withSounds(starter, { empty: ["vent"] }), { ...sounding, soundCategories: sounding.soundCategories.map((category) => (category.id === "vent" ? { ...category, archived: true } : category)) }]) {
    const { bed, warned } = bedOf(catalog);
    assert.deepEqual(pick(bed), generated);
    assert.ok(warned);
  }

  // A wind limited to a place the night never visits still makes the bed: the bed has no place.
  const elsewhere = sounding.sounds.map((sound) => (sound.category === "vent" ? { ...sound, places: ["nulle-part"] } : sound));
  const { bed, warned } = bedOf({ ...sounding, sounds: elsewhere });
  assert.equal(bed.category, "vent");
  assert.ok(!warned);
});

test("the sound ends in one fade of everything, over a rest, with an ambience still playing", () => {
  for (const seed of seeds) {
    const { cues, soundSeconds, events, finalFade } = night(seed, sounding, 30);
    assert.deepEqual(finalFade, { at: soundSeconds - 120, duration: 120 });
    const atTheEnd = cues.filter((cue) => endOf(cue) >= soundSeconds - 0.01);
    assert.ok(atTheEnd.some((cue) => cue.layer === "ambience"), "an ambience plays until the end");
    assert.ok(atTheEnd.some((cue) => cue.layer === "noiseBed"));
    assert.equal(eventAt(events, finalFade.at).kind, "rest");
    assert.equal(eventAt(events, soundSeconds - 1).kind, "rest");
  }
  assert.deepEqual([15, 30, 60, 120].map((minutes) => finalFadeOf(minutes * 60).duration), [90, 120, 120, 120]);
  assert.deepEqual(finalFadeOf(120), { at: 90, duration: 30 });
});

test("the ambience is the place's: its sub-ambiences obey their conditions and cross-fade when the place changes", () => {
  const world = indexCatalog(sounding);
  let conditional = 0;
  for (const seed of seeds) {
    const { cues, events } = night(seed, sounding, 120);
    for (const cue of cues.filter((candidate) => candidate.layer === "ambience")) {
      const event = eventAt(events, cue.at);
      const ambience = world.byId.ambiences.get(world.byId.places.get(event.place)?.ambience ?? "");
      const layers = ambience?.layers.filter((layer) => layer.category === cue.category) ?? [];
      assert.ok(layers.length > 0, `${cue.category} is no sub-ambience of ${ambience?.id}`);
      assert.ok(layers.some((layer) => holds(layer.when, event)), `${cue.category} started in the wrong weather or light`);
      if (layers.some((layer) => layer.when)) conditional += 1;
      assert.ok(cue.loop && cue.offset >= 0 && cue.offset < 60);
      assert.ok(cue.fadeIn >= 3, "a sub-ambience never pops in");
    }
    // The base of the place's ambience is always there: the first sub-ambience has probability 1.
    for (const event of events.filter((candidate) => candidate.at + candidate.duration < 2 * HOUR)) {
      const ambience = world.byId.ambiences.get(world.byId.places.get(event.place)?.ambience ?? "");
      const base = ambience?.layers[0];
      const middle = event.at + event.duration / 2;
      assert.ok(cues.some((cue) => cue.layer === "ambience" && cue.category === base?.category && cue.at <= middle && endOf(cue) >= middle), `no ${base?.category} at ${middle}`);
    }
  }
  assert.ok(conditional > 0, "no conditional sub-ambience in six nights");
});

test("sub-ambiences come and go and drift within the category's maximum", () => {
  const world = indexCatalog(sounding);
  const cues = seeds.flatMap((seed) => night(seed, sounding, 120).cues).filter((cue) => cue.layer === "ambience");
  const drifting = cues.filter((cue) => cue.drift && cue.drift.length > 2);
  assert.ok(drifting.length > 10);
  for (const cue of drifting) {
    const max = world.byId.soundCategories.get(cue.category ?? "")?.maxVolume ?? 0;
    const points = cue.drift ?? [];
    assert.ok(points.every((point, n) => point.volume >= 0 && point.volume <= max && point.at >= cue.at && (n === 0 || point.at > (points[n - 1]?.at ?? 0))));
    assert.ok(new Set(points.map((point) => point.volume)).size > 1);
  }
  assert.ok(cues.some((cue) => cue.category === "vent" && cue.fadeIn >= 8), "the wind never rose slowly in the middle of an ambience");
});

test("volume and speed vary at each play, within the ranges of the category", () => {
  const world = indexCatalog(sounding);
  const cues = night(4821).cues.filter((cue) => cue.layer !== "noiseBed");
  for (const cue of cues) {
    const category = world.byId.soundCategories.get(cue.category ?? "");
    assert.ok(category);
    assert.ok(cue.volume >= 0 && cue.volume <= category.maxVolume);
    assert.ok(Math.abs(cue.rate - 1) <= category.rateJitter + 0.001);
  }
  const steps = cues.filter((cue) => cue.layer === "action");
  assert.ok(new Set(steps.map((cue) => cue.rate)).size > steps.length / 2);
  assert.ok(new Set(steps.map((cue) => cue.volume)).size > 5);
});

test("a variant never plays twice in a row in a category", () => {
  const world = indexCatalog(sounding);
  for (const seed of seeds) {
    const last = new Map<string, string>();
    let plays = 0;
    for (const cue of night(seed).cues) {
      const sound = soundOf(cue);
      if (sound === null) continue;
      const category = world.byId.sounds.get(sound)?.category as string;
      assert.notEqual(sound, last.get(category), `${sound} twice in a row at ${cue.at}`);
      last.set(category, sound);
      plays += 1;
    }
    assert.ok(plays > 100);
  }
});

test("the bank honours the places of a sound, and repeats only when a single sound is allowed", () => {
  const sound = (id: string, places?: string[]) => ({ ...(sounding.sounds[0] as Catalog["sounds"][number]), id, category: "oiseau", ...(places ? { places } : {}) });
  const catalog: Catalog = { ...starter, sounds: [sound("partout-1"), sound("partout-2"), sound("auberge", ["chope-fendue"]), sound("camp", ["camp-des-bucherons"])] };
  const bank = new SoundBank(indexCatalog(catalog), createRng("bank"));
  const played = Array.from({ length: 200 }, (_, n) => bank.pick("oiseau", n % 3 === 0 ? "chope-fendue" : "relais-de-hautval")?.sound.id);
  played.forEach((id, n) => {
    assert.notEqual(id, "camp");
    if (n % 3 !== 0) assert.notEqual(id, "auberge");
    assert.notEqual(id, played[n - 1]);
  });
  assert.ok(played.includes("auberge") && played.includes("partout-1") && played.includes("partout-2"));

  const single = new SoundBank(indexCatalog({ ...starter, sounds: [sound("seul")] }), createRng("bank"));
  assert.deepEqual([1, 2, 3].map(() => single.pick("oiseau", "relais-de-hautval")?.sound.id), ["seul", "seul", "seul"]);
  assert.deepEqual(single.warnings, []);
});

test("an empty category borrows from its fallback, and the hole is reported once", () => {
  const holed = withSounds(starter, { empty: ["marche-herbe", "marche-pierre", "combat-groupe", "hibou", "feu"] });
  const world = indexCatalog(holed);
  const all = seeds.map((seed) => night(seed, holed, 120));
  const cues = all.flatMap(({ cues }) => cues);
  const warnings = all.flatMap(({ warnings }) => warnings);

  const steps = cues.filter((cue) => cue.category === "marche-herbe" || cue.category === "marche-pierre");
  assert.ok(steps.length > 0);
  for (const cue of steps) assert.equal(world.byId.sounds.get(soundOf(cue) ?? "")?.category, "marche");
  assert.ok(!cues.some((cue) => cue.category === "hibou" || cue.category === "feu"), "no fallback: the ambience alone");
  assert.ok(warnings.some((warning) => warning.kind === "emptyCategory" && warning.category === "marche-herbe" && warning.fallback === "marche"));
  assert.ok(warnings.some((warning) => warning.kind === "emptyCategory" && warning.category === "feu" && warning.fallback === undefined));
  assert.ok(warnings.every((warning) => warning.kind !== "emptyCategory" || !["marche", "marche-bois", "foret"].includes(warning.category)));
  for (const { warnings: own } of all) assert.equal(new Set(own.map((warning) => JSON.stringify(warning))).size, own.length, "each hole once");
});

test("without any sound file the night still plays its noise bed, and lists every hole", () => {
  const { cues, warnings } = night(4821, starter);
  assert.deepEqual(cues.map((cue) => cue.layer), ["noiseBed"]);
  const holes = warnings.filter((warning) => warning.kind === "emptyCategory").map((warning) => warning.category);
  assert.ok(holes.length > 10);
  assert.ok(holes.includes("accept") && holes.includes("porte"));
});

test("sounds that are archived, inactive or weightless never play", () => {
  const muted = sounding.sounds.map((sound, n) => ({ ...sound, archived: n % 3 === 0, active: n % 3 !== 1, weight: n % 3 === 2 && sound.category === "combat" ? 0 : sound.weight }));
  const allowed = new Set(muted.filter((sound) => !sound.archived && sound.active && sound.weight > 0).map(({ id }) => id));
  const cues = night(4821, { ...sounding, sounds: muted }).cues;
  assert.ok(cues.length > 50);
  for (const cue of cues) assert.ok(soundOf(cue) === null || allowed.has(soundOf(cue) as string));
  assert.ok(!cues.some((cue) => cue.category === "combat"));
});

test("an archived category is silent, nothing borrows from it, and an archived ambience no longer plays", () => {
  const archiving = (ids: readonly string[]): Catalog => ({
    ...sounding,
    soundCategories: sounding.soundCategories.map((category) => (ids.includes(category.id) ? { ...category, archived: true } : category)),
  });
  const before = seeds.flatMap((seed) => night(seed).cues);
  const silenced = ["porte", "accept", "marche-pierre", "oiseau", "feu"];
  for (const id of silenced) assert.ok(before.some((cue) => cue.category === id), `${id} never plays in the first place`);
  const after = seeds.map((seed) => night(seed, archiving(silenced)));
  assert.ok(!after.some(({ cues }) => cues.some((cue) => silenced.includes(cue.category ?? ""))));
  assert.ok(!after.some(({ warnings }) => warnings.some((warning) => warning.kind === "emptyCategory")), "silence that was asked for is no hole");

  // An archived fallback lends nothing: the category that counted on it is a hole.
  const world = indexCatalog({ ...archiving(["marche"]), sounds: sounding.sounds.filter((sound) => sound.category !== "marche-herbe") });
  const bank = new SoundBank(world, createRng("bank"));
  assert.equal(bank.pick("marche-herbe", "relais-de-hautval"), null);
  assert.deepEqual(bank.warnings, [{ kind: "emptyCategory", category: "marche-herbe" }]);

  const noAmbience: Catalog = { ...sounding, ambiences: sounding.ambiences.map((ambience) => ({ ...ambience, archived: true })) };
  const layers = new Set(seeds.flatMap((seed) => night(seed, noAmbience).cues).map((cue) => cue.layer));
  assert.deepEqual([...layers].sort(), ["action", "noiseBed", "transition"]);

  // Leaving for a place whose ambience is archived fades the one before.
  const taverns = sounding.ambiences.filter((ambience) => sounding.places.some((place) => place.kind === "inn" && place.ambience === ambience.id)).map(({ id }) => id);
  const noTavern: Catalog = { ...sounding, ambiences: sounding.ambiences.map((ambience) => (taverns.includes(ambience.id) ? { ...ambience, archived: true } : ambience)) };
  const inns = new Set(sounding.places.filter((place) => place.kind === "inn").map(({ id }) => id));
  let checked = 0;
  for (const seed of seeds) {
    const { cues, events, soundSeconds } = night(seed, noTavern);
    for (const event of events.filter((candidate) => inns.has(candidate.place) && candidate.duration > 20 && candidate.at + candidate.duration < soundSeconds)) {
      const middle = event.at + event.duration - 1;
      assert.ok(!cues.some((cue) => cue.layer === "ambience" && cue.at <= middle && endOf(cue) > middle), `an ambience still plays at the inn at ${middle}`);
      checked += 1;
    }
  }
  assert.ok(checked > 0);
});

test("a fade-in and a fade-out never overlap, even when a sub-ambience is cut short while it comes in", () => {
  let short = 0;
  for (let seed = 1; seed <= 60; seed++) {
    for (const cue of night(seed, sounding, 60).cues) {
      assert.ok(cue.fadeIn + cue.fadeOut <= cue.duration + 0.011, `seed ${seed}: ${cue.category} at ${cue.at} fades ${cue.fadeIn} + ${cue.fadeOut} in ${cue.duration} s`);
      if (cue.layer === "ambience" && cue.duration < 30) short += 1;
    }
  }
  assert.ok(short > 0, "no short sub-ambience in sixty nights");
});

test("one-shots keep the silence of their category between two sounds, or come in bursts", () => {
  const world = indexCatalog(sounding);
  let bursts = 0;
  for (const seed of seeds) {
    const cues = night(seed, sounding, 120).cues.filter((cue) => cue.layer === "oneShot");
    assert.ok(cues.length > 10);
    const previous = new Map<string, SoundCue>();
    for (const cue of cues) {
      const category = world.byId.soundCategories.get(cue.category ?? "");
      const before = previous.get(cue.category ?? "");
      previous.set(cue.category ?? "", cue);
      if (!before || !category?.minGap) continue;
      const silence = cue.at - endOf(before);
      const inBurst = category.burst !== undefined && silence <= 2.01;
      if (inBurst) bursts += 1;
      else assert.ok(silence >= category.minGap.min - 0.02, `${cue.category}: ${silence} s of silence`);
      assert.ok(silence >= 0.29, "two one-shots of a category never overlap");
    }
  }
  assert.ok(bursts > 0, "no burst in six nights");
});

test("one-shots obey the conditions of the ambience: an owl at night, thunder in a storm", () => {
  const world = indexCatalog(sounding);
  for (const seed of seeds) {
    const { cues, events } = night(seed, sounding, 120);
    for (const cue of cues.filter((candidate) => candidate.layer === "oneShot")) {
      const event = eventAt(events, cue.at);
      const ambience = world.byId.ambiences.get(world.byId.places.get(event.place)?.ambience ?? "");
      const entries = ambience?.oneShots.filter((entry) => entry.category === cue.category) ?? [];
      assert.ok(entries.some((entry) => holds(entry.when, event)), `${cue.category} at ${cue.at} in ${ambience?.id}`);
    }
  }
});

test("the action of each scene plays during the scene; transitions ding at its start, the level-up at its end and before the next ding", () => {
  const world = indexCatalog(sounding);
  const { cues, events, soundSeconds } = night(4821);
  const heard = events.filter((event) => event.at < soundSeconds);
  for (const event of heard) {
    const category = world.byId.sceneTemplates.get(event.scene)?.actionCategory;
    const mine = cues.filter((cue) => cue.layer === "action" && cue.at >= event.at && cue.at < event.at + event.duration);
    assert.equal(mine.length > 0, category !== undefined, `${event.scene} at ${event.at}`);
    for (const cue of mine) assert.equal(cue.category, category);
    for (const cue of mine.filter((candidate) => candidate.loop)) assert.ok(endOf(cue) <= event.at + event.duration + 0.01);
    const afterLevelUp = heard[event.index - 1]?.gains?.levelUp ? 1 : 0;
    event.transitions.forEach((transition, n) => {
      const at = event.at + (n + afterLevelUp) * 1.5;
      assert.ok(cues.some((cue) => cue.layer === "transition" && cue.category === transition && cue.at === at), `${transition} at ${at}`);
    });
    if (event.gains?.levelUp && event.at + event.duration < soundSeconds) {
      assert.ok(cues.some((cue) => cue.category === "levelup" && cue.at === event.at + event.duration));
    }
  }
  assert.ok(heard.some((event) => event.transitions.length > 0));

  // A level is often gained as a quest is turned in: its ding never lands on the next quest's.
  const beginner = { ...hero, level: 1 };
  let levelUps = 0;
  for (const seed of seeds) {
    const transitions = generateNight({ seed, catalog: sounding, character: beginner, soundMinutes: 120, durationSeconds: 3 * HOUR }).cues.filter((cue) => cue.layer === "transition");
    levelUps += transitions.filter((cue) => cue.category === "levelup").length;
    transitions.forEach((cue, n) => assert.ok(n === 0 || cue.at - (transitions[n - 1]?.at ?? 0) >= 1.49, `seed ${seed}: two transitions at ${cue.at}`));
  }
  assert.ok(levelUps > 5, `${levelUps} level-ups heard`);
  assert.ok(cues.filter((cue) => cue.layer === "action" && !cue.loop).length > 10, "short action sounds follow each other");
});

test("a change in one category leaves the cues of the other layers alone", () => {
  const more: Catalog = { ...sounding, sounds: [...sounding.sounds, { ...(sounding.sounds.find((sound) => sound.category === "oiseau") as Catalog["sounds"][number]), id: "oiseau-de-plus" }] };
  const others = (catalog: Catalog) => night(4821, catalog).cues.filter((cue) => cue.category !== "oiseau");
  assert.deepEqual(others(more), others(sounding));
  assert.deepEqual(night(4821, more).events, night(4821, sounding).events);
});

test("no sound timer, no cue", () => {
  const world = indexCatalog(sounding);
  assert.deepEqual(planSound({ seed: 1, world, events: night(1).events, soundSeconds: 0 }), { cues: [], finalFade: { at: 0, duration: 0 }, warnings: [] });
});
