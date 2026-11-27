// Gear: what it is worth, and what to wear among what was found.

import type { Gear, ItemInstance } from "../generator/types";
import { ITEM_SLOTS, type ItemSlot } from "../schema/common";
import type { World } from "../world";

const SLOTS = Object.keys(ITEM_SLOTS) as ItemSlot[];

/** An item's power: what its template gives per level, times the level it dropped at. */
export function itemPower(instance: ItemInstance, world: World): number {
  return (world.byId.items.get(instance.item)?.power ?? 0) * instance.level;
}

/**
 * The gear as one number, comparable to a level: a full set of plain items (power 1 per level)
 * found at level 12 scores 12. An empty slot counts for nothing.
 */
export function gearScore(gear: Gear, world: World): number {
  const total = SLOTS.reduce((sum, slot) => {
    const instance = gear[slot];
    return sum + (instance ? itemPower(instance, world) : 0);
  }, 0);
  return total / SLOTS.length;
}

/** The gear after trying on what was found: an item replaces the one in its slot when it is stronger. */
export function equipBetter(gear: Gear, found: readonly ItemInstance[], world: World): Gear {
  const next: Gear = { ...gear };
  for (const instance of found) {
    const slot = world.byId.items.get(instance.item)?.slot;
    if (slot === undefined) continue;
    const worn = next[slot];
    if (!worn || itemPower(instance, world) > itemPower(worn, world)) next[slot] = instance;
  }
  return next;
}
