// XP and levels. The XP a level asks for grows by a fixed factor at each level.

import type { Settings } from "../schema/settings";

export type Progress = { level: number; xp: number };

/** The XP needed to go from `level` to the next one. */
export function xpToNextLevel(level: number, curve: Settings["xpCurve"]): number {
  return Math.max(1, Math.round(curve.base * curve.growth ** (level - 1)));
}

/** Adds XP and climbs as many levels as it pays for. */
export function addXp(progress: Progress, amount: number, curve: Settings["xpCurve"]): Progress {
  let { level, xp } = progress;
  xp += amount;
  for (let needed = xpToNextLevel(level, curve); xp >= needed; needed = xpToNextLevel(level, curve)) {
    xp -= needed;
    level += 1;
  }
  return { level, xp };
}
