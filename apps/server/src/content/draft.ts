// The rules of a write to the draft: the item fits the schema of its collection, the version the
// admin read is still the current one, and the write does not add a broken reference. A write that
// changes nothing takes no version, so it shows nothing to publish.

import { COLLECTIONS, settingsSchema, stableStringify, type CheckIssue, type CollectionName, type Settings } from "@wayfarers-rest/shared";
import type { z } from "zod";
import { HttpError, fieldErrors } from "../http/errors";
import { assembleCatalog, isArchived, type StoredEntry } from "./catalog";
import { errorsOf, referenceIssues } from "./check";
import { SETTINGS, type ContentStore, type Slot, type StoredItem } from "./store";

const sameReference = (a: CheckIssue, b: CheckIssue): boolean =>
  a.kind === b.kind && a.target?.collection === b.target?.collection && a.target?.id === b.target?.id;

export class Draft {
  constructor(private readonly store: ContentStore) {}

  /** Creates or replaces an item. `ifMatch` is the version the admin read: 0 for "not there yet". */
  saveEntry(collection: CollectionName, id: string, data: unknown, ifMatch?: number): { item: StoredEntry; created: boolean } {
    const parsed = this.validate(COLLECTIONS[collection].schema, data);
    if (parsed.id !== id) throw new HttpError("badRequest", `The item id "${String(parsed.id)}" is not the id of the path "${id}"`);
    const existing = this.guard(collection, id, ifMatch);
    return { item: this.write(collection, id, parsed, existing) as StoredEntry, created: !existing };
  }

  saveSettings(data: Settings, ifMatch?: number): StoredItem {
    const parsed = this.validate(settingsSchema, data);
    return this.write(SETTINGS, "", parsed, this.guard(SETTINGS, "", ifMatch));
  }

  /** Archives an item or brings it back. Never refused: the check tells what still points to it. */
  setArchived(collection: CollectionName, id: string, archived: boolean): StoredEntry {
    const existing = this.store.find(collection, id);
    if (!existing) throw new HttpError("notFound", `No item "${id}" in ${collection}`);
    if (isArchived(existing) === archived) return existing as StoredEntry;
    return this.store.write(collection, id, { ...existing.data, archived }) as StoredEntry;
  }

  private validate(schema: z.ZodType, data: unknown): Record<string, unknown> {
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new HttpError("invalidContent", "The item does not fit the content schema", { fields: fieldErrors(parsed.error) });
    return parsed.data as Record<string, unknown>;
  }

  private guard(collection: Slot, id: string, ifMatch: number | undefined): StoredItem | undefined {
    const existing = this.store.find(collection, id);
    const current = existing?.version ?? 0;
    if (ifMatch !== undefined && ifMatch !== current) {
      throw new HttpError("versionConflict", `Expected version ${ifMatch} of ${collection}/${id}, found ${current}`);
    }
    return existing;
  }

  private write(collection: Slot, id: string, data: Record<string, unknown>, existing: StoredItem | undefined): StoredItem {
    if (existing && stableStringify(existing.data) === stableStringify(data)) return existing;
    const others = this.store.draft().filter((item) => item.collection !== collection || item.id !== id);
    const errorsWith = (candidate: StoredItem | undefined): CheckIssue[] =>
      errorsOf(referenceIssues(assembleCatalog(candidate ? [...others, candidate] : others).catalog)).filter(
        (issue) => issue.collection === collection && issue.id === id,
      );
    // A reference that was already broken does not block the edit of another field.
    const before = errorsWith(existing);
    const added = errorsWith({ collection, id, version: 0, updatedAt: "", data }).filter((issue) => !before.some((known) => sameReference(known, issue)));
    if (added.length > 0) throw new HttpError("brokenReferences", "The write would add broken references", { issues: added });
    return this.store.write(collection, id, data);
  }
}
