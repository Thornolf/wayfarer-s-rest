// From stored items to the shapes of the contract: an entry, and a whole catalog.

import {
  COLLECTIONS,
  COLLECTION_NAMES,
  settingsSchema,
  type Catalog,
  type CheckIssue,
  type CollectionName,
  type Entry,
  type SettingsEntry,
} from "@wayfarers-rest/shared";
import type { z } from "zod";
import { fieldErrors } from "../http/errors";
import { SETTINGS, type StoredItem } from "./store";

export type StoredEntry = StoredItem & { collection: CollectionName };

export const isEntry = (item: StoredItem): item is StoredEntry => item.collection !== SETTINGS;
export const isArchived = (item: StoredItem): boolean => item.data.archived === true;

export function toEntry(item: StoredEntry): Entry {
  return {
    collection: item.collection,
    id: item.id,
    version: item.version,
    archived: isArchived(item),
    aiGenerated: item.data.aiGenerated === true,
    updatedAt: item.updatedAt,
    data: item.data,
  };
}

export function toSettingsEntry(item: StoredItem): SettingsEntry {
  return { version: item.version, updatedAt: item.updatedAt, data: item.data as SettingsEntry["data"] };
}

function invalidItem(item: StoredItem, error: z.ZodError): CheckIssue {
  const [first] = fieldErrors(error);
  return { severity: "error", kind: "invalidItem", collection: item.collection, id: item.id, path: first?.path ?? "", detail: first?.message };
}

/**
 * The catalog made of a set of stored items (a draft, or a publication), sorted by id like
 * `mergeCatalogue` does. Every item was valid when it was written, but the schema may have moved
 * since: an item that no longer fits is left out of the catalog and reported in `invalid`.
 */
export function assembleCatalog(items: StoredItem[]): { catalog: Catalog; invalid: CheckIssue[] } {
  const invalid: CheckIssue[] = [];
  const catalog: Record<string, unknown> = Object.fromEntries(COLLECTION_NAMES.map((name) => [name, []]));
  for (const item of [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const schema: z.ZodType = isEntry(item) ? COLLECTIONS[item.collection].schema : settingsSchema;
    const parsed = schema.safeParse(item.data);
    if (!parsed.success) invalid.push(invalidItem(item, parsed.error));
    else if (isEntry(item)) (catalog[item.collection] as unknown[]).push(parsed.data);
    else catalog.settings = parsed.data;
  }
  return { catalog: catalog as Catalog, invalid };
}
