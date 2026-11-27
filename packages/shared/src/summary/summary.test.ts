import assert from "node:assert/strict";
import { test } from "node:test";
import type { CharacterSnapshot, TimelineEvent } from "../generator/types";
import { cutNight, generateNight, type Night } from "../night";
import { newCharacter } from "../progression/character";
import { applyNight } from "../progression/totals";
import { createRng } from "../rng";
import type { Catalog } from "../schema/catalog";
import { HIGHLIGHT_KINDS, type HighlightKind } from "../schema/summary";
import { loadStarterCatalog } from "../starter";
import { indexCatalog } from "../world";
import { MOST_HIGHLIGHTS, selectHighlights, siftHighlights } from "./highlights";
import type { Highlight } from "./types";

const catalog = loadStarterCatalog();
const world = indexCatalog(catalog);
const hero: CharacterSnapshot = { ...newCharacter("Aldric", "m"), level: 5 };
const HOUR = 3600;
const night = (seed: number, character: CharacterSnapshot = hero, from: Catalog = catalog): Night =>
  generateNight({ seed, catalog: from, character, soundMinutes: 30, durationSeconds: 8 * HOUR });
const seeds = Array.from({ length: 30 }, (_, n) => n + 1);
const sift = (played: Night) => siftHighlights(played, world, createRng(played.seed), "fr");

test("the summary opens, closes, and tells a handful of highlights in the order they happened", () => {
  for (const seed of seeds) {
    const { summary } = night(seed);
    const kinds = summary.lines.map((line) => line.highlight.kind);
    assert.equal(kinds[0], "opening");
    assert.equal(kinds.at(-1), "closing");
    assert.ok(summary.lines.length >= 4 && summary.lines.length <= MOST_HIGHLIGHTS + 2, `${summary.lines.length} lines`);
    assert.equal(kinds.filter((kind) => kind === "opening" || kind === "closing").length, 2);
    summary.lines.forEach((line, n) => assert.ok(n === 0 || line.highlight.at >= (summary.lines[n - 1]?.highlight.at ?? 0)));
    for (const kind of new Set(kinds)) assert.ok(kinds.filter((other) => other === kind).length <= 2, `${kind} told too often`);
  }
});

test("it is kept both ways: the text as written, and the highlights as data", () => {
  const { summary, events, zone } = night(4821);
  assert.equal(summary.text, summary.lines.map((line) => line.text).join(" "));
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), summary, "plain data, ready to store");
  for (const line of summary.lines) {
    assert.ok(world.byId.summarySentences.get(line.sentence)?.trigger === line.highlight.kind);
    assert.doesNotMatch(line.text, /[{}[\]|]|undefined|NaN|\?/);
    assert.match(line.text, /^[A-ZÀÉÈÊ«L]/);
    assert.ok(world.byId.places.has(line.highlight.place));
  }
  assert.match(summary.text, /Aldric/);
  assert.equal(summary.lines[0]?.highlight.place, events[0]?.place);
  assert.equal(summary.lines.at(-1)?.highlight.place, events.at(-1)?.place);
  assert.ok(summary.text.includes("Brumefer") || zone !== "collines-de-brumefer");
});

test("sentences agree with the hero's gender", () => {
  const texts = (gender: "m" | "f") => seeds.map((seed) => night(seed, { ...hero, name: "Maëlle", gender }).summary.text).join(" ");
  assert.match(texts("f"), /Maëlle (est partie|s’en est allée|s’est glissée|s’est assise|est passée)/);
  assert.doesNotMatch(texts("m"), /Maëlle (est partie|s’en est allée|s’est glissée|s’est assise|est passée)\b/);
});

test("the sifter notes every kind of highlight, with what its sentences need", () => {
  const seen = new Map<HighlightKind, Highlight>();
  for (const seed of seeds) {
    const played = night(seed);
    const highlights = sift(played);
    const flights = played.events.filter((event) => event.fight?.result === "flee" && event.fight.rank !== "boss").length;
    assert.equal(highlights.filter((highlight) => highlight.kind === "flee").length, flights);
    assert.equal(highlights.filter((highlight) => highlight.kind === "questDone").length, played.events.filter((event) => event.questDone).length);
    assert.equal(highlights.filter((highlight) => highlight.kind === "levelUp").length, played.events.filter((event) => event.gains?.levelUp).length);
    for (const highlight of highlights) seen.set(highlight.kind, highlight);
  }
  assert.deepEqual([...seen.keys()].sort(), Object.keys(HIGHLIGHT_KINDS).sort());
  assert.ok(seen.get("boss")?.monster && seen.get("boss")?.outcome);
  assert.ok(seen.get("epicLoot")?.item?.rarity === "epic" || seen.get("epicLoot")?.item?.rarity === "legendary");
  assert.ok(seen.get("companion")?.companion && seen.get("companion")?.quip);
  assert.ok(seen.get("questDone")?.quest);
  assert.ok((seen.get("levelUp")?.level ?? 0) > hero.level);
  assert.ok((seen.get("closing")?.xp ?? 0) > 0);
});

test("the most salient moments are kept: a boss or an epic find is never dropped for a walk in the rain", () => {
  for (const seed of seeds) {
    const all = sift(night(seed));
    const kept = selectHighlights(all);
    const dropped = all.filter((highlight) => !kept.includes(highlight));
    const leastKept = Math.min(...kept.map((highlight) => highlight.salience));
    for (const highlight of dropped) {
      const ofKind = kept.filter((other) => other.kind === highlight.kind);
      const subject = highlight.monster ?? highlight.item?.item ?? highlight.quest;
      const told = subject !== undefined && ofKind.some((other) => (other.monster ?? other.item?.item ?? other.quest) === subject);
      assert.ok(ofKind.length >= 2 || told || highlight.salience <= leastKept, `${highlight.kind} (${highlight.salience}) dropped below ${leastKept}`);
    }
  }
  const moment = (kind: HighlightKind, at: number, salience: number): Highlight => ({ kind, at, place: "p", weather: "clear", daylight: "day", salience });
  const many = [moment("opening", 0, 100), ...Array.from({ length: 5 }, (_, n) => moment("questDone", 10 + n, 2)), moment("boss", 50, 10), moment("closing", 99, 100)];
  assert.deepEqual(selectHighlights(many).map((highlight) => highlight.at), [0, 10, 11, 50, 99]);
});

test("the same monster fled or the same item found is told once", () => {
  const moment = (kind: HighlightKind, at: number, more: Partial<Highlight>): Highlight => ({ kind, at, place: "p", weather: "clear", daylight: "day", salience: 3, ...more });
  const item = { item: "cloak", rarity: "epic" as const, level: 5 };
  const flights = [moment("flee", 1, { monster: "troll" }), moment("flee", 2, { monster: "troll" }), moment("flee", 3, { monster: "wolf" })];
  const finds = [moment("epicLoot", 4, { item }), moment("epicLoot", 5, { item: { ...item, level: 6 } })];
  assert.deepEqual(selectHighlights([...flights, ...finds]).map((highlight) => highlight.at), [1, 3, 4]);
});

test("a companion is introduced once a night, with one of their own lines", () => {
  for (const seed of seeds) {
    const played = night(seed);
    const joined = sift(played).filter((highlight) => highlight.kind === "companion");
    assert.equal(new Set(joined.map((highlight) => highlight.companion)).size, joined.length);
    assert.deepEqual(joined.map((highlight) => highlight.companion).sort(), [...new Set(played.quests.flatMap((quest) => quest.companions))].sort());
    for (const highlight of joined) {
      const quips = world.byId.companions.get(highlight.companion ?? "")?.quips.map((quip) => quip.fr);
      assert.ok(quips?.includes(highlight.quip ?? ""));
    }
  }
});

test("sentences obey their conditions: the weather that came, the fight's outcome, the company", () => {
  for (const seed of seeds) {
    for (const { highlight, sentence } of night(seed).summary.lines) {
      const when = world.byId.summarySentences.get(sentence)?.when;
      if (when?.weather?.length) assert.ok(when.weather.includes(highlight.weather));
      if (when?.daylight?.length) assert.ok(when.daylight.includes(highlight.daylight));
      if (when?.outcome) assert.equal(when.outcome, highlight.outcome);
      if (when?.companion !== undefined) assert.equal(when.companion, (highlight.companions ?? []).length > 0);
      if (when?.minCount !== undefined) assert.ok((highlight.count ?? 0) >= when.minCount);
    }
  }
});

test("night after night, the sentences already served wait for the others to come out", () => {
  let character = hero;
  const openings: string[] = [];
  const closings: string[] = [];
  for (let seed = 100; seed < 104; seed++) {
    const played = night(seed, character);
    openings.push(played.summary.lines[0]?.sentence ?? "");
    closings.push(played.summary.lines.at(-1)?.sentence ?? "");
    assert.ok((played.summary.served.opening?.remaining.length ?? 0) > 0 || played.summary.served.opening?.last);
    character = applyNight(character, played);
  }
  assert.equal(new Set(openings).size, 4, `openings: ${openings}`);
  assert.equal(new Set(closings).size, 4, `closings: ${closings}`);

  const fresh = night(101, hero).summary.lines[0]?.sentence;
  const afterOne = night(101, applyNight(hero, night(100))).summary.lines[0]?.sentence;
  assert.notEqual(afterOne, night(100).summary.lines[0]?.sentence);
  assert.ok(fresh !== undefined && afterOne !== undefined);
});

test("the same night gives the same summary; within it a sentence is not used twice in a row", () => {
  assert.deepEqual(night(9).summary, night(9).summary);
  for (const seed of seeds) {
    const { lines } = night(seed).summary;
    lines.forEach((line, n) => assert.notEqual(line.sentence, lines[n - 1]?.sentence));
  }
});

test("a night cut short gets the summary of what was played", () => {
  const whole = night(4821);
  const cut = cutNight(whole, 2 * HOUR, { catalog, character: hero });
  const lastPlayed = cut.events.at(-1) as TimelineEvent;
  assert.ok(lastPlayed.at < 2 * HOUR);
  assert.equal(cut.summary.lines.at(-1)?.highlight.kind, "closing");
  assert.equal(cut.summary.lines.at(-1)?.highlight.place, lastPlayed.place);
  assert.ok(cut.summary.lines.every((line) => line.highlight.at <= lastPlayed.at + lastPlayed.duration));
  assert.equal(cut.summary.lines.at(-1)?.highlight.xp, cut.events.reduce((sum, event) => sum + (event.gains?.xp ?? 0), 0));
  assert.deepEqual(cut.summary.lines[0], whole.summary.lines[0], "the opening is the same");
});

test("a kind of highlight with no sentence left is skipped and reported", () => {
  const mute: Catalog = { ...catalog, summarySentences: catalog.summarySentences.map((sentence) => ({ ...sentence, archived: sentence.trigger === "questDone" })) };
  const played = night(4821, hero, mute);
  assert.ok(!played.summary.lines.some((line) => line.highlight.kind === "questDone"));
  assert.ok(played.warnings.some((warning) => warning.kind === "noSentence" && warning.highlight === "questDone"));
  assert.ok(!night(4821).warnings.some((warning) => warning.kind === "noSentence"));
});

test("an old chronicle survives content that was archived since", () => {
  const played = night(4821);
  const later: Catalog = { ...catalog, places: catalog.places.map((place) => ({ ...place, archived: true })), companions: [] };
  const again = cutNight(played, 8 * HOUR, { catalog: later, character: hero });
  assert.equal(again.summary.lines.length, played.summary.lines.length);
  assert.equal(again.summary.lines[0]?.text, played.summary.lines[0]?.text);
});
