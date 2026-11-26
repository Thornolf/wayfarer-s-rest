// Story sifting: read the night that was played and note the moments that make a story.

import type { QuestRun, TimelineEvent } from "../generator/types";
import { localize, type Locale } from "../locale";
import type { Rng } from "../rng";
import type { HighlightKind } from "../schema/summary";
import type { World } from "../world";
import type { Highlight } from "./types";

/** How many highlights are told between the opening and the closing. */
export const MOST_HIGHLIGHTS = 6;
/** How many of the same kind are told at most. */
const MOST_OF_A_KIND = 2;

const SALIENCE = {
  /** The opening and the closing are always told. */
  framing: 100,
  boss: 10,
  legendaryLoot: 9,
  epicLoot: 8,
  /** The last level gained in the night; the ones before it hardly count. */
  levelUp: 5,
  earlierLevelUp: 1,
  companion: 4,
  eliteFlee: 4,
  flee: 3,
  restAt: 3,
  storm: 3,
  weatherChange: 2,
  groupQuestDone: 3,
  questDone: 2,
};

export type PlayedNight = { events: readonly TimelineEvent[]; quests: readonly QuestRun[] };

/** Every moment worth telling, in the order it happened, opening and closing included. */
export function siftHighlights(night: PlayedNight, world: World, rng: Rng, locale: Locale): Highlight[] {
  const { events, quests } = night;
  const first = events[0];
  const last = events[events.length - 1];
  if (!first || !last) return [];

  const moment = (kind: HighlightKind, event: TimelineEvent, salience: number): Highlight => ({
    kind,
    at: event.at,
    place: event.place,
    weather: event.weather,
    daylight: event.daylight,
    salience,
  });
  const questsDone = events.filter((event) => event.questDone).length;
  const flights = events.filter((event) => event.fight?.result === "flee" && event.fight.rank !== "boss").length;
  const lastLevelUp = [...events].reverse().find((event) => event.gains?.levelUp);
  const met = new Set<string>();
  const rested = new Set<number>();
  const highlights: Highlight[] = [moment("opening", first, SALIENCE.framing)];
  let previous = first;

  for (const event of events) {
    const quest = quests[event.quest];
    const companions = quest?.companions ?? [];

    if (event === first || event.quest !== previous.quest) {
      for (const id of companions.filter((companion) => !met.has(companion))) {
        met.add(id);
        const quips = world.byId.companions.get(id)?.quips ?? [];
        const quip = quips.length > 0 ? localize(rng.fork(`quip-${event.index}-${id}`).pick(quips), locale) : "";
        highlights.push({ ...moment("companion", event, SALIENCE.companion), companion: id, quip });
      }
    }
    if (event.weather !== previous.weather) {
      highlights.push(moment("weatherChange", event, event.weather === "storm" ? SALIENCE.storm : SALIENCE.weatherChange));
    }
    if (event.fight?.rank === "boss") {
      highlights.push({ ...moment("boss", event, SALIENCE.boss), monster: event.fight.monster, outcome: event.fight.result, companions });
    } else if (event.fight?.result === "flee") {
      const salience = event.fight.rank === "elite" ? SALIENCE.eliteFlee : SALIENCE.flee;
      highlights.push({ ...moment("flee", event, salience), monster: event.fight.monster, count: flights });
    }
    for (const item of event.gains?.items ?? []) {
      if (item.rarity === "epic") highlights.push({ ...moment("epicLoot", event, SALIENCE.epicLoot), item });
      if (item.rarity === "legendary") highlights.push({ ...moment("epicLoot", event, SALIENCE.legendaryLoot), item });
    }
    if (event.gains?.levelUp) {
      const salience = event === lastLevelUp ? SALIENCE.levelUp : SALIENCE.earlierLevelUp;
      highlights.push({ ...moment("levelUp", event, salience), level: event.gains.level });
    }
    if (event.questDone && quest) {
      const salience = companions.length > 0 ? SALIENCE.groupQuestDone : SALIENCE.questDone;
      highlights.push({ ...moment("questDone", event, salience), quest: quest.title, count: questsDone });
    }
    if (event.kind === "rest" && quest?.kind === "rest" && !rested.has(quest.index)) {
      rested.add(quest.index);
      highlights.push(moment("restAt", event, SALIENCE.restAt));
    }
    previous = event;
  }

  const lastGains = [...events].reverse().find((event) => event.gains)?.gains;
  highlights.push({
    ...moment("closing", last, SALIENCE.framing),
    at: last.at + last.duration,
    ...(lastGains ? { level: lastGains.level } : {}),
    xp: events.reduce((sum, event) => sum + (event.gains?.xp ?? 0), 0),
    count: questsDone,
  });
  return highlights;
}

/**
 * The highlights that get a sentence: the opening, the closing, and between them the most salient
 * ones (the earliest first among equals, and no more than two of a kind), told in order.
 */
export function selectHighlights(highlights: readonly Highlight[]): Highlight[] {
  const framing = ({ kind }: Highlight) => kind === "opening" || kind === "closing";
  const ranked = highlights.filter((highlight) => !framing(highlight)).sort((a, b) => b.salience - a.salience || a.at - b.at);
  const kept = new Set(highlights.filter(framing));
  const taken = new Map<HighlightKind, number>();
  let told = 0;
  for (const highlight of ranked) {
    const ofKind = taken.get(highlight.kind) ?? 0;
    if (told >= MOST_HIGHLIGHTS || ofKind >= MOST_OF_A_KIND) continue;
    kept.add(highlight);
    taken.set(highlight.kind, ofKind + 1);
    told += 1;
  }
  return highlights.filter((highlight) => kept.has(highlight));
}
