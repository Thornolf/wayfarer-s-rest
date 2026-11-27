// What a night brought, as far as it was played, and the character that wakes up from it.

import type { CharacterSnapshot, ItemInstance, QuestRun, TimelineEvent } from "../generator/types";
import type { Summary } from "../summary/types";

export type NightTotals = {
  xp: number;
  items: ItemInstance[];
  /** The level at the cut, and the XP into it. */
  level: number;
  levelXp: number;
  levelsGained: number;
  questsDone: number;
  fightsWon: number;
  fightsFled: number;
  /** Ids of the companions who came along, in order of appearance. */
  companions: string[];
};

/** What the totals are counted from: a night, whole or cut. */
export type CountedNight = {
  hero: { level: number; xp: number };
  events: readonly TimelineEvent[];
  quests: readonly QuestRun[];
};

/**
 * Adds up the events that started before the cut (the whole night when no cut is given). The heard
 * part and the silent part count alike.
 */
export function nightTotals(night: CountedNight, cutAt = Infinity): NightTotals {
  const events = night.events.filter((event) => event.at < cutAt);
  const lastGains = [...events].reverse().find((event) => event.gains)?.gains;
  const fights = events.flatMap((event) => (event.fight ? [event.fight] : []));
  const companions = night.quests.filter((quest) => quest.at < cutAt).flatMap((quest) => quest.companions);
  return {
    xp: events.reduce((sum, event) => sum + (event.gains?.xp ?? 0), 0),
    items: events.flatMap((event) => event.gains?.items ?? []),
    level: lastGains?.level ?? night.hero.level,
    levelXp: lastGains?.levelXp ?? night.hero.xp,
    levelsGained: (lastGains?.level ?? night.hero.level) - night.hero.level,
    questsDone: events.filter((event) => event.questDone).length,
    fightsWon: fights.filter((fight) => fight.result === "win").length,
    fightsFled: fights.filter((fight) => fight.result === "flee").length,
    companions: [...new Set(companions)],
  };
}

/**
 * The character after a night: level, XP, companions met, pity and the sentences already served.
 * Give it the night as it was cut. The gear is left alone: see `equipBetter` for what was found.
 */
export function applyNight(character: CharacterSnapshot, night: CountedNight & { summary: Summary }): CharacterSnapshot {
  const totals = nightTotals(night);
  const lastGains = [...night.events].reverse().find((event) => event.gains)?.gains;
  return {
    ...character,
    level: totals.level,
    xp: totals.levelXp,
    knownCompanions: [...new Set([...character.knownCompanions, ...totals.companions])],
    pity: lastGains?.pity ?? character.pity,
    servedSentences: night.summary.served,
  };
}
