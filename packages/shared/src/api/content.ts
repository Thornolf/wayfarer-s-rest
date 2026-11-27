// Content as the server stores it: entries with a version, the catalogue sync, and the draft that
// the admin edits until it is published.
//
// One counter rules everything. Every write to the draft (an item, the settings) takes the next
// value and stamps the entry with it. Publishing writes nothing: it records the counter value of
// that moment, and the published catalogue is every entry as it stood at that value. So an entry
// has unpublished changes exactly when its version is above the published version.

import { z } from "zod";
import type { CollectionName } from "../schema/admin";
import { catalogSchema, parseCatalog, type Catalog, type CollectionItem } from "../schema/catalog";
import { COLLECTION_NAMES } from "../schema/admin";
import { settingsSchema } from "../schema/settings";
import { checkIssueSchema, collectionNameSchema, contentIdSchema, textFlag, textInt, timestampSchema, versionSchema } from "./common";

/**
 * The version of the content schema. The server sends it with the catalogue; an app that knows an
 * older one keeps its catalogue and asks to be updated instead of applying what it cannot read.
 */
export const CATALOGUE_SCHEMA_VERSION = 1;

/** The fields of an item, validated by the server against the schema of its collection. */
const itemDataSchema = z.record(z.string(), z.unknown());

export const entrySchema = z.object({
  collection: collectionNameSchema,
  id: contentIdSchema,
  /** The counter value of the last write to this entry. */
  version: versionSchema,
  archived: z.boolean(),
  aiGenerated: z.boolean(),
  updatedAt: timestampSchema,
  data: itemDataSchema,
});
export type Entry = z.infer<typeof entrySchema>;
/** An entry whose collection is known: `EntryOf<"zones">` holds a `Zone`. */
export type EntryOf<K extends CollectionName> = Omit<Entry, "collection" | "data"> & { collection: K; data: CollectionItem<K> };

export const revisionSchema = z.object({ version: versionSchema, writtenAt: timestampSchema, data: itemDataSchema });
export type Revision = z.infer<typeof revisionSchema>;

export const settingsEntrySchema = z.object({ version: versionSchema, updatedAt: timestampSchema, data: settingsSchema });
export type SettingsEntry = z.infer<typeof settingsEntrySchema>;

// --- Catalogue sync ------------------------------------------------------------------------------

export const catalogueQuerySchema = z.strictObject({
  /** The version the client already holds; 0 or absent asks for everything. */
  since: textInt.optional(),
});
export const catalogueHeadersSchema = z.object({ "if-none-match": z.string().optional() });

export const catalogueChangeSchema = entrySchema.pick({ collection: true, id: true, version: true, archived: true, data: true });
export type CatalogueChange = z.infer<typeof catalogueChangeSchema>;

/**
 * What changed after `since`, archived items included (archiving is how an item leaves). The
 * response carries `ETag: "<version>"`; the same value in `If-None-Match` gets a 304.
 */
export const catalogueSyncSchema = z.object({
  /** The version to store and to send back as `since`. */
  version: versionSchema,
  schemaVersion: z.number().int().min(1),
  changes: z.array(catalogueChangeSchema),
  /** The settings when they changed after `since`, otherwise null. */
  settings: z.object({ version: versionSchema, data: settingsSchema }).nullable(),
});
export type CatalogueSync = z.infer<typeof catalogueSyncSchema>;

/** The ETag of a version, also the value `If-Match` takes. */
export const versionEtag = (version: number): string => `"${version}"`;
/** True when an `If-None-Match` header names this version: answer 304. */
export function etagMatches(header: string | undefined, version: number): boolean {
  if (header === undefined) return false;
  return header.split(",").some((tag) => tag.trim().replace(/^W\//, "") === versionEtag(version));
}

/**
 * Applies a sync to the catalogue a client holds (none on the first sync) and validates the
 * result. Items are kept sorted by id, so every client builds the same catalogue, with the same
 * `catalogHash`, whatever syncs it went through.
 */
export function mergeCatalogue(held: Catalog | undefined, sync: CatalogueSync): Catalog {
  const merged: Record<string, unknown> = { settings: sync.settings?.data ?? held?.settings };
  for (const name of COLLECTION_NAMES) {
    const items = new Map<string, unknown>((held?.[name] ?? []).map((item) => [item.id, item]));
    for (const change of sync.changes) if (change.collection === name) items.set(change.id, change.data);
    merged[name] = [...items.keys()].sort().map((id) => items.get(id));
  }
  return parseCatalog(merged);
}

// --- Editing the draft ---------------------------------------------------------------------------

export const collectionParamsSchema = z.strictObject({ collection: collectionNameSchema });
export const entryParamsSchema = z.strictObject({ collection: collectionNameSchema, id: contentIdSchema });

export const ARCHIVED_FILTERS = ["exclude", "include", "only"] as const;
export const entryListQuerySchema = z.strictObject({
  /** Archived items are left out unless asked for. */
  archived: z.enum(ARCHIVED_FILTERS).optional(),
  aiGenerated: textFlag.optional(),
  /** Matched against the id and the texts of the item. */
  search: z.string().optional(),
});
export const entryListSchema = z.object({ entries: z.array(entrySchema) });

export const entryDetailSchema = z.object({
  entry: entrySchema,
  /** The item as the phone has it, null when it was never published. */
  published: entrySchema.nullable(),
  /** Earlier writes, newest first. */
  revisions: z.array(revisionSchema),
});
export type EntryDetail = z.infer<typeof entryDetailSchema>;

/**
 * Creates or replaces an item; `data.id` must be the id of the path. `If-Match: "<version>"`
 * refuses the write when the entry moved since it was read, `If-Match: "0"` when it already exists.
 */
export const entryWriteSchema = z.strictObject({ data: itemDataSchema });
export const writeHeadersSchema = z.object({ "if-match": z.string().optional() });
export const entryResultSchema = z.object({ entry: entrySchema });

export const settingsDetailSchema = z.object({ settings: settingsEntrySchema, published: settingsEntrySchema.nullable() });
export const settingsWriteSchema = z.strictObject({ data: settingsSchema });

// --- Check, publication, export ------------------------------------------------------------------

/** The check of the draft: reference problems, categories without sound, failed conversions. */
export const checkResultSchema = z.object({ draftVersion: versionSchema, issues: z.array(checkIssueSchema) });
export type CheckResult = z.infer<typeof checkResultSchema>;

export const publicationSchema = z.object({ version: versionSchema, publishedAt: timestampSchema });
export type Publication = z.infer<typeof publicationSchema>;

export const PUBLICATION_CHANGE_KINDS = ["created", "updated", "archived", "unarchived"] as const;
export const publicationChangeSchema = z.object({
  collection: z.union([collectionNameSchema, z.literal("settings")]),
  /** Empty for the settings. */
  id: z.string(),
  version: versionSchema,
  /** How the draft differs from what is published; the detail is in the entry itself. */
  kind: z.enum(PUBLICATION_CHANGE_KINDS),
});
export type PublicationChange = z.infer<typeof publicationChangeSchema>;

export const publicationStateSchema = z.object({
  /** The current counter value: the version a publication made now would take. */
  draftVersion: versionSchema,
  /** The last publication, null while nothing was ever published. */
  published: publicationSchema.nullable(),
  /** Every entry written since the last publication. Empty: the phone is up to date. */
  changes: z.array(publicationChangeSchema),
});
export type PublicationState = z.infer<typeof publicationStateSchema>;

/**
 * Publishes the draft as it stands at `draftVersion`. Refused with `versionConflict` when the
 * draft moved since the admin read it, and with `publishBlocked` when the check has errors.
 */
export const publishRequestSchema = z.strictObject({ draftVersion: versionSchema });

/** The whole draft as one catalog, for a readable backup and the way back to the repository. */
export const exportSchema = z.object({ draftVersion: versionSchema, exportedAt: timestampSchema, catalog: catalogSchema });
