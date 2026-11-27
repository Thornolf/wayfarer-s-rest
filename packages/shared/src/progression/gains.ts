// What one event earns: XP for the fight won, the scene and the quest turned in, and the loot.

import type { Fight, ItemInstance, PityCounters } from "../generator/types";
import type { Rng } from "../rng";
import type { RowOutcome } from "../schema/common";
import type { World } from "../world";
import { rollLoot } from "./loot";

export type Earning = {
  world: World;
  /** XP the scene gives outside fights. */
  sceneXp: number;
  outcome: RowOutcome;
  fight?: Fight | undefined;
  /** XP of the quest, when this event turns it in. */
  questXp: number;
  lootMultiplier: number;
  pity: PityCounters;
  /** The character's level as the event starts. */
  level: number;
  /** The loot stream of this event. */
  rng: Rng;
};

export function earn(earning: Earning): { xp: number; items: ItemInstance[]; pity: PityCounters } {
  const { world, fight, rng } = earning;
  const settings = world.catalog.settings;
  const won = fight?.result === "win";
  const xp = earning.questXp + (fight ? (won ? settings.fightXp[fight.rank] : 0) : earning.sceneXp);

  // The drop draw is made for every event, so that loot never depends on how the scene was told.
  const dropRoll = rng.fork("drop").float();
  const drops = earning.outcome === "find" || (won && fight !== undefined && dropRoll < settings.dropChance[fight.rank]);
  if (!drops) return { xp, items: [], pity: earning.pity };

  const { item, pity } = rollLoot({
    rates: settings.lootRates[fight?.rank ?? "normal"],
    multiplier: earning.lootMultiplier,
    pity: earning.pity,
    items: world.active.items,
    level: earning.level,
    rng,
  });
  return { xp, items: item ? [item] : [], pity };
}
