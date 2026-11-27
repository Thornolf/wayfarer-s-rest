// The references an item holds, read from the admin metadata of its schema, and the other way
// round: who points to an item ("Utilisée par").

import { COLLECTION_NAMES, COLLECTIONS, adminMeta, type CollectionName } from "@wayfarers-rest/shared";
import type { z } from "zod";
import { formatPath } from "./paths";
import { walk } from "./walk";

export type Reference = { path: string; collection: CollectionName; id: string };

export function referencesIn(schema: z.ZodType, value: unknown): Reference[] {
  const found: Reference[] = [];
  walk(schema, value, (fieldSchema, fieldValue, path) => {
    const collection = adminMeta(fieldSchema)?.ref;
    if (!collection) return;
    for (const id of Array.isArray(fieldValue) ? fieldValue : [fieldValue]) {
      if (typeof id === "string") found.push({ path: formatPath(path), collection, id });
    }
    return "skip";
  });
  return found;
}

export type Item = Record<string, unknown>;
export type ItemsByCollection = Readonly<Record<CollectionName, readonly Item[]>>;
export type User = { collection: CollectionName | "settings"; id: string; path: string };

/** Every item (and the settings) holding a reference to the target, with the field that holds it. */
export function usedBy(
  items: ItemsByCollection,
  settings: { schema: z.ZodType; value: unknown },
  target: { collection: CollectionName; id: string },
): User[] {
  const users: User[] = [];
  const collect = (schema: z.ZodType, value: unknown, owner: Pick<User, "collection" | "id">) => {
    for (const reference of referencesIn(schema, value)) {
      if (reference.collection === target.collection && reference.id === target.id) users.push({ ...owner, path: reference.path });
    }
  };
  for (const collection of COLLECTION_NAMES) {
    for (const item of items[collection]) collect(COLLECTIONS[collection].schema, item, { collection, id: String(item.id) });
  }
  collect(settings.schema, settings.value, { collection: "settings", id: "" });
  return users;
}
