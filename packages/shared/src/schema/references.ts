// Checks what the schema cannot see by looking at one item: that ids are unique, and that every
// reference points to an item that exists, is not archived and has the fields the reference asks
// for. The references are found through the admin metadata (`ref`, `refWhere`), not listed here.

import { z } from "zod";
import { COLLECTION_NAMES, type CollectionName } from "./admin";
import { COLLECTIONS, type Catalog } from "./catalog";
import { adminMeta, unwrap } from "./fields";
import { settingsSchema } from "./settings";

export type CatalogIssue = {
  kind:
    | "duplicateId" // two items of the collection share this id
    | "missingRef" // the target does not exist
    | "archivedRef" // a live item points to an archived one
    | "mismatchedRef"; // the target exists but lacks what `refWhere` asks (wrong sound layer…)
  /** Where the problem is: a collection and an item id, or the settings (then `id` is empty). */
  collection: CollectionName | "settings";
  id: string;
  /** The field inside the item, e.g. `steps[2].scene`. Empty for a duplicate id. */
  path: string;
  /** The item the reference points to. */
  target?: { collection: CollectionName; id: string };
};

type Item = { id: string; archived: boolean } & Record<string, unknown>;
type Index = Record<CollectionName, Map<string, Item>>;

function indexCatalog(catalog: Catalog): Index {
  const index = {} as Index;
  for (const name of COLLECTION_NAMES) {
    index[name] = new Map((catalog[name] as Item[]).map((item) => [item.id, item]));
  }
  return index;
}

export function checkReferences(catalog: Catalog): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const index = indexCatalog(catalog);

  const visit = (schema: z.ZodType, value: unknown, path: string, owner: Pick<CatalogIssue, "collection" | "id">, ownerArchived: boolean): void => {
    if (value === undefined || value === null) return;
    const meta = adminMeta(schema);
    const inner = unwrap(schema);

    if (meta?.ref) {
      const collection = meta.ref;
      for (const id of (Array.isArray(value) ? value : [value]) as string[]) {
        const target = index[collection].get(id);
        const issue = (kind: CatalogIssue["kind"]) => issues.push({ kind, ...owner, path, target: { collection, id } });
        if (!target) issue("missingRef");
        else if (target.archived && !ownerArchived) issue("archivedRef");
        else if (Object.entries(meta.refWhere ?? {}).some(([key, expected]) => target[key] !== expected)) issue("mismatchedRef");
      }
    } else if (inner instanceof z.ZodObject) {
      for (const [key, fieldSchema] of Object.entries(inner.shape as Record<string, z.ZodType>)) {
        visit(fieldSchema, (value as Record<string, unknown>)[key], path ? `${path}.${key}` : key, owner, ownerArchived);
      }
    } else if (inner instanceof z.ZodArray) {
      (value as unknown[]).forEach((element, i) => visit(inner.element as z.ZodType, element, `${path}[${i}]`, owner, ownerArchived));
    }
  };

  for (const collection of COLLECTION_NAMES) {
    const seen = new Set<string>();
    for (const item of catalog[collection] as Item[]) {
      if (seen.has(item.id)) issues.push({ kind: "duplicateId", collection, id: item.id, path: "" });
      seen.add(item.id);
      visit(COLLECTIONS[collection].schema, item, "", { collection, id: item.id }, item.archived);
    }
  }
  visit(settingsSchema, catalog.settings, "", { collection: "settings", id: "" }, false);
  return issues;
}
