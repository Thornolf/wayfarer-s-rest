import assert from "node:assert/strict";
import { test } from "node:test";
import { cutNight, generateNight, type Night, type NightInput } from "./night";
import { newCharacter } from "./progression/character";
import { catalogHash, stableStringify } from "./schema/hash";
import { withSounds } from "./sound/testSounds";
import { loadStarterCatalog } from "./starter";

const catalog = withSounds(loadStarterCatalog());
const hero = { ...newCharacter("Aldric", "m"), level: 5 };
const HOUR = 3600;
const input = (more: Partial<NightInput> = {}): NightInput => ({ seed: 4821, catalog, character: hero, soundMinutes: 30, durationSeconds: 7 * HOUR, ...more });

test("same seed, same catalog, same character: the same night, down to its fingerprint", () => {
  const night = generateNight(input());
  const again = generateNight(input());
  assert.deepEqual(again, night);
  assert.equal(stableStringify(again), stableStringify(night));
  assert.deepEqual(JSON.parse(JSON.stringify(night)), night, "a night is plain data");
});

test("different seeds, different nights", () => {
  const nights = [1, 2, 3].map((seed) => generateNight(input({ seed })));
  assert.equal(new Set(nights.map((night) => JSON.stringify(night.events))).size, 3);
  assert.equal(new Set(nights.map((night) => night.summary.text)).size, 3);
});

test("a night records what it was made from", () => {
  const night = generateNight(input());
  assert.equal(night.seed, 4821);
  assert.equal(night.catalogHash, catalogHash(catalog));
  assert.equal(night.locale, "fr");
  assert.equal(night.soundSeconds, 1800);
  assert.equal(night.duration, 7 * HOUR);
  assert.deepEqual(night.hero, { name: "Aldric", gender: "m", level: 5, xp: 0 });
  assert.ok(catalog.zones.some((zone) => zone.id === night.zone));
  assert.ok(night.events.every((event) => event.at < night.duration && night.quests[event.quest]?.index === event.quest));
  assert.equal(night.quests.length, new Set(night.events.map((event) => event.quest)).size);
  assert.deepEqual(night.warnings, []);
});

test("stable prefix: the night cut at 3 is the beginning of the night that ran until 7", () => {
  const untilSeven = generateNight(input());
  const untilThree = generateNight(input({ durationSeconds: 3 * HOUR }));
  const cut = cutNight(untilSeven, 3 * HOUR, { catalog, character: hero });

  assert.deepEqual(untilSeven.events.slice(0, untilThree.events.length), untilThree.events);
  assert.deepEqual(untilSeven.quests.slice(0, untilThree.quests.length), untilThree.quests);
  assert.deepEqual(untilSeven.cues, untilThree.cues, "the sound does not depend on the wake time");
  assert.deepEqual(cut, untilThree, "cutting gives the very night that would have been generated");
});

test("adding a sound does not change the events, only what is heard", () => {
  const silent = generateNight(input({ catalog: loadStarterCatalog() }));
  const night = generateNight(input());
  assert.deepEqual(night.events, silent.events);
  assert.deepEqual(night.quests, silent.quests);
  assert.deepEqual(night.summary, silent.summary);
  assert.ok(night.cues.length > silent.cues.length);
});

test("cutting keeps what started before the cut, sound included", () => {
  const night = generateNight(input());
  const early = cutNight(night, 600, { catalog, character: hero });
  assert.ok(early.events.length > 0 && early.events.every((event) => event.at < 600));
  assert.ok(early.cues.length > 0 && early.cues.every((cue) => cue.at < 600));
  assert.ok(early.cues.length < night.cues.length);
  assert.equal(early.duration, 600);
  assert.equal(cutNight(night, 99 * HOUR, { catalog, character: hero }).duration, night.duration);
  assert.deepEqual(cutNight(night, 99 * HOUR, { catalog, character: hero }), night);
});

test("the wake time can come before the sound ends", () => {
  const nap: Night = generateNight(input({ durationSeconds: 600 }));
  assert.ok(nap.cues.every((cue) => cue.at + cue.duration <= 600.01));
  assert.ok(nap.events.every((event) => event.at < 600));
});
