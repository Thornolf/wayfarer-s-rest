// Loot: a rarity is drawn first, then an item of that rarity. Pity keeps long bad luck away: each
// drop that misses a rare or an epic adds the chance it had to what luck owes; once a whole drop is
// owed, the chance of a rescue climbs, and it is certain when two are.

import type { ItemInstance, PityCounters } from "../generator/types";
import type { Rng } from "../rng";
import { RARITIES, type Rarity } from "../schema/common";
import type { Item } from "../schema/character";

const ORDER = Object.keys(RARITIES) as Rarity[];
/** The rarities that have a pity counter, best first. */
const PITY_TIERS = ["epic", "rare"] as const;

const atLeast = (rarity: Rarity, tier: Rarity) => ORDER.indexOf(rarity) >= ORDER.indexOf(tier);

const owed = (value: number) => Math.round(value * 10000) / 10000;

/**
 * The counters after a drop: a tier starts over when the drop reached it; otherwise it is owed the
 * chance this drop had of reaching it. A boss that gives no epic adds a lot, a wolf hardly anything:
 * the counters mean the same whatever the rank of the monster.
 */
export function advancePity(pity: PityCounters, dropped: Rarity, chances: PityCounters): PityCounters {
  return {
    rare: atLeast(dropped, "rare") ? 0 : owed(pity.rare + chances.rare),
    epic: atLeast(dropped, "epic") ? 0 : owed(pity.epic + chances.epic),
  };
}

/** How likely pity is to step in: never before one whole drop is owed, always once two are. */
function pityChance(owedDrops: number): number {
  return Math.min(1, Math.max(0, owedDrops - 1));
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
    const rescued = roll.rng.fork(`pity-${tier}`).chance(pityChance(roll.pity[tier]));
    if (rescued && rarity !== null && !atLeast(rarity, tier)) rarity = tier;
  }
  if (rarity === null) return { item: null, pity: roll.pity };

  // No item of that rarity in the catalog: the next one down.
  for (let position = ORDER.indexOf(rarity); position >= 0; position--) {
    const candidates = roll.items.filter((item) => item.rarity === ORDER[position]);
    if (candidates.length === 0) continue;
    const item = roll.rng.fork("item").pick(candidates);
    const chances = { rare: shareFrom("rare"), epic: shareFrom("epic") };
    return { item: { item: item.id, rarity: item.rarity, level: roll.level }, pity: advancePity(roll.pity, item.rarity, chances) };
  }
  return { item: null, pity: roll.pity };
}
