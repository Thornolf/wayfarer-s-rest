// Storage of the content: the draft, its revisions and the publications. No validation here: the
// rules of a write live in draft.ts.
//
// One counter stamps every write. A publication records the counter value of its moment, and the
// published content is every item at its last revision at or below that value.

import type { CollectionName, Publication } from "@wayfarers-rest/shared";
import type { Clock } from "../clock";
import type { Database } from "../db/database";

/** The settings are stored like an item, under this collection and an empty id. */
export const SETTINGS = "settings";
export type Slot = CollectionName | typeof SETTINGS;

export type StoredItem = {
  collection: Slot;
  id: string;
  version: number;
  updatedAt: string;
  data: Record<string, unknown>;
};

type Row = { collection: Slot; id: string; version: number; updated_at: string; data: string };

const toItem = (row: Row): StoredItem => ({
  collection: row.collection,
  id: row.id,
  version: row.version,
  updatedAt: row.updated_at,
  data: JSON.parse(row.data) as Record<string, unknown>,
});

const DRAFT_COLUMNS = "collection, id, version, updated_at, data";
/** The revision of each item that a reader allowed up to version ?1 sees. */
const PUBLISHED = `
  SELECT r.collection, r.id, r.version, r.written_at AS updated_at, r.data
  FROM content_revisions r
  WHERE r.version = (
    SELECT MAX(version) FROM content_revisions WHERE collection = r.collection AND id = r.id AND version <= ?1
  )`;

export class ContentStore {
  constructor(
    private readonly db: Database,
    private readonly now: Clock,
  ) {}

  /** The current value of the counter: 0 before the first write. */
  draftVersion(): number {
    return this.db.get<{ version: number }>("SELECT version FROM content_counter WHERE id = 1")!.version;
  }

  find(collection: Slot, id: string): StoredItem | undefined {
    const row = this.db.get<Row>(`SELECT ${DRAFT_COLUMNS} FROM content_entries WHERE collection = ? AND id = ?`, collection, id);
    return row && toItem(row);
  }

  /** The draft items written after `since`, the settings included, sorted by collection and id. */
  draft(since = 0): StoredItem[] {
    return this.db.all<Row>(`SELECT ${DRAFT_COLUMNS} FROM content_entries WHERE version > ? ORDER BY collection, id`, since).map(toItem);
  }

  /** The draft items of one collection, sorted by id. */
  list(collection: Slot): StoredItem[] {
    return this.db.all<Row>(`SELECT ${DRAFT_COLUMNS} FROM content_entries WHERE collection = ? ORDER BY id`, collection).map(toItem);
  }

  /** Writes an item: takes the next counter value, replaces the draft row and keeps a revision. */
  write(collection: Slot, id: string, data: Record<string, unknown>): StoredItem {
    return this.db.transaction(() => {
      this.db.run("UPDATE content_counter SET version = version + 1 WHERE id = 1");
      const item: StoredItem = { collection, id, version: this.draftVersion(), updatedAt: this.now().toISOString(), data };
      const json = JSON.stringify(data);
      this.db.run(
        `INSERT INTO content_entries (collection, id, version, updated_at, data) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (collection, id) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at, data = excluded.data`,
        collection,
        id,
        item.version,
        item.updatedAt,
        json,
      );
      this.db.run(
        "INSERT INTO content_revisions (collection, id, version, written_at, data) VALUES (?, ?, ?, ?, ?)",
        collection,
        id,
        item.version,
        item.updatedAt,
        json,
      );
      return item;
    });
  }

  /** The writes of an item older than `below`, newest first. */
  revisions(collection: Slot, id: string, below: number, limit: number): StoredItem[] {
    return this.db
      .all<Row>(
        `SELECT collection, id, version, written_at AS updated_at, data FROM content_revisions
         WHERE collection = ? AND id = ? AND version < ? ORDER BY version DESC LIMIT ?`,
        collection,
        id,
        below,
        limit,
      )
      .map(toItem);
  }

  /** The last publication, null while nothing was ever published. */
  publication(): Publication | null {
    const row = this.db.get<{ version: number; published_at: string }>(
      "SELECT version, published_at FROM publications ORDER BY version DESC LIMIT 1",
    );
    return row ? { version: row.version, publishedAt: row.published_at } : null;
  }

  /** The published items written after `since`, the settings included, sorted by collection and id. */
  published(since = 0): StoredItem[] {
    const publication = this.publication();
    if (!publication) return [];
    return this.db.all<Row>(`${PUBLISHED} AND r.version > ?2 ORDER BY r.collection, r.id`, publication.version, since).map(toItem);
  }

  findPublished(collection: Slot, id: string): StoredItem | undefined {
    const publication = this.publication();
    if (!publication) return undefined;
    const row = this.db.get<Row>(`${PUBLISHED} AND r.collection = ?2 AND r.id = ?3`, publication.version, collection, id);
    return row && toItem(row);
  }

  /** Makes the draft as it stands what the phone receives. Publishing twice in a row changes nothing. */
  publish(): Publication {
    return this.db.transaction(() => {
      this.db.run("INSERT OR IGNORE INTO publications (version, published_at) VALUES (?, ?)", this.draftVersion(), this.now().toISOString());
      return this.publication()!;
    });
  }
}
