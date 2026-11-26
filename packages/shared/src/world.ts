// The catalog as the generator reads it: every item findable by id, and for each collection the
// items that may still come out in a new night (archived ones stay findable, never drawn).

import type { CollectionName } from "./schema/admin";
import { COLLECTION_NAMES } from "./schema/admin";
import type { Catalog, CollectionItem } from "./schema/catalog";
import type { MonsterRank } from "./schema/common";
import type { Monster, Place, Zone } from "./schema/world";

export type World = {
  catalog: Catalog;
  byId: { [K in CollectionName]: Map<string, CollectionItem<K>> };
  active: { [K in CollectionName]: CollectionItem<K>[] };
};

export function indexCatalog(catalog: Catalog): World {
  const byId = {} as Record<CollectionName, Map<string, { id: string }>>;
  const active = {} as Record<CollectionName, { id: string; archived: boolean }[]>;
  for (const name of COLLECTION_NAMES) {
    const items: { id: string; archived: boolean }[] = catalog[name];
    byId[name] = new Map(items.map((item) => [item.id, item]));
    active[name] = items.filter((item) => !item.archived);
  }
  return { catalog, byId, active } as World;
}

/** The places of a zone that are not archived, in catalog order. */
export function placesOf(world: World, zone: Zone): Place[] {
  return world.active.places.filter((place) => place.zone === zone.id);
}

/** The monsters of a rank that live in a zone and are not archived, in the zone's order. */
export function monstersOf(world: World, zone: Zone, rank: MonsterRank): Monster[] {
  return zone.monsters
    .map((id) => world.byId.monsters.get(id))
    .filter((monster): monster is Monster => monster !== undefined && !monster.archived && monster.rank === rank);
}
