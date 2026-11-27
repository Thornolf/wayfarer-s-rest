// The draft as the admin holds it: every item of every collection, read from the catalogue sync.
// It is kept as the server sent it, unparsed, so that one faulty item never hides the others.

import { COLLECTION_NAMES, type CatalogueSync, type CollectionName } from "@wayfarers-rest/shared";
import type { Item, ItemsByCollection } from "../editor/references";

export type Draft = {
  version: number;
  /** Sorted by id, archived items included. */
  items: ItemsByCollection;
  byId: Readonly<Record<CollectionName, ReadonlyMap<string, Item>>>;
  /** Undefined until settings were written once. */
  settings: Record<string, unknown> | undefined;
};

/** Builds the draft from a full sync (`since` 0). */
export function draftOf(sync: CatalogueSync): Draft {
  const items = {} as Record<CollectionName, Item[]>;
  const byId = {} as Record<CollectionName, Map<string, Item>>;
  for (const name of COLLECTION_NAMES) {
    const changes = sync.changes.filter((change) => change.collection === name).sort((a, b) => (a.id < b.id ? -1 : 1));
    items[name] = changes.map((change) => change.data);
    byId[name] = new Map(changes.map((change) => [change.id, change.data]));
  }
  return { version: sync.version, items, byId, settings: sync.settings?.data };
}
