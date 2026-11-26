// Loot: a rarity is drawn first, then an item of that rarity. Pity keeps long bad luck away: once
// a rare or an epic is overdue, its chance climbs until it is certain at twice the expected wait.

import type { ItemInstance, PityCounters } from "../generator/types";
import type { Rng } from "../rng";
import { RARITIES, type Rarity } from "../schema/common";
import type { Item } from "../schema/character";

const ORDER = Object.keys(RARITIES) as Rarity[];
/** The rarities that have a pity counter, best first. */
const PITY_TIERS = ["epic", "rare"] as const;

const atLeast = (rarity: Rarity, tier: Rarity) => ORDER.indexOf(rarity) >= ORDER.indexOf(tier);

/** The counters after a drop: a tier starts over when the drop reached it, and waits one more otherwise. */
export function advancePity(pity: PityCounters, dropped: Rarity): PityCounters {
  return {
    rare: atLeast(dropped, "rare") ? 0 : pity.rare + 1,
    epic: atLeast(dropped, "epic") ? 0 : pity.epic + 1,
  };
}

/** How likely pity is to step in, given the drops waited and the plain chance of the tier. */
function pityChance(waited: number, chance: number): number {
  if (chance <= 0) return 0;
  const expected = 1 / chance;
  return Math.min(1, Math.max(0, (waited - expected) / expected));
}

export type LootRoll = {
  /** The weight of each rarity for this drop. */
  rates: Readonly<Record<Rarity, number>>;
  /** Multiplies the weight of everything above common. */
  multiplier: number;
  pity: PityCounters;
  /** The items that can drop. */
  items: readonly Item[];
  /** The level the item takes. */
  level: number;
  rng: Rng;
};

/**
 * One drop. The same draws are made whatever the catalog holds, so that one drop never shifts the
 * next. Gives no item, and leaves pity alone, when the rates are all zero or no item exists.
 */
export function rollLoot(roll: LootRoll): { item: ItemInstance | null; pity: PityCounters } {
  const weights = ORDER.map((rarity) => ({ value: rarity, weight: roll.rates[rarity] * (rarity === "common" ? 1 : roll.multiplier) }));
  const total = weights.reduce((sum, { weight }) => sum + Math.max(0, weight), 0);
  const shareFrom = (tier: Rarity) =>
    total <= 0 ? 0 : weights.reduce((sum, { value, weight }) => sum + (atLeast(value, tier) ? Math.max(0, weight) : 0), 0) / total;

  const rarityRoll = roll.rng.fork("rarity");
  let rarity = total > 0 ? rarityRoll.weighted(weights) : null;
  for (const tier of PITY_TIERS) {
    const rescued = roll.rng.fork(`pity-${tier}`).chance(pityChance(roll.pity[tier], shareFrom(tier)));
    if (rescued && rarity !== null && !atLeast(rarity, tier)) rarity = tier;
  }
  if (rarity === null) return { item: null, pity: roll.pity };

  // No item of that rarity in the catalog: the next one down.
  for (let position = ORDER.indexOf(rarity); position >= 0; position--) {
    const candidates = roll.items.filter((item) => item.rarity === ORDER[position]);
    if (candidates.length === 0) continue;
    const item = roll.rng.fork("item").pick(candidates);
    return { item: { item: item.id, rarity: item.rarity, level: roll.level }, pity: advancePity(roll.pity, item.rarity) };
  }
  return { item: null, pity: roll.pity };
}
