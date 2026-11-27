// The odds of a fight. Losing is fleeing: nothing is lost, the story just says so.

import type { MonsterRank } from "../schema/common";
import type { Settings } from "../schema/settings";

export type Fighter = {
  /** See `gearScore`. */
  gearScore: number;
  level: number;
  inGroup: boolean;
};

/** The chance to win against a monster of a rank: the base, moved by the gear and by the group, within bounds. */
export function successChance(rank: MonsterRank, fighter: Fighter, settings: Settings): number {
  const chance =
    settings.successBase[rank] +
    settings.gearWeight * (fighter.gearScore - fighter.level) +
    (fighter.inGroup ? settings.groupBonus.success : 0);
  return Math.min(settings.successBounds.max, Math.max(settings.successBounds.min, chance));
}

/** What multiplies the weight of rare, epic and legendary loot: better gear and company find better things. */
export function lootMultiplier(fighter: Fighter, settings: Settings): number {
  const fromGear = Math.min(2, Math.max(0.5, 1 + settings.gearWeight * (fighter.gearScore - fighter.level)));
  return fromGear * (fighter.inGroup ? settings.groupBonus.loot : 1);
}
