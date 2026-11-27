// The memory of the fake server: the draft, its history and the last publication, kept the way the
// contract describes them. One counter stamps every write; publishing only remembers its value.

import {
  COLLECTION_NAMES,
  type Catalog,
  type CollectionName,
  type Entry,
  type Publication,
  type PublicationChange,
  type Revision,
  type SettingsEntry,
} from "@wayfarers-rest/shared";

export type Side = "draft" | "published";
type Data = Record<string, unknown>;
/** The writes of one item, newest first. */
type History = Revision[];

export type Store = ReturnType<typeof createStore>;

export function createStore(now: () => string) {
  const histories = new Map<string, History>();
  let settingsHistory: History = [];
  let counter = 0;
  let published: Publication | null = null;

  const keyOf = (collection: CollectionName, id: string) => `${collection}/${id}`;
  const limitOf = (side: Side) => (side === "draft" ? counter : (published?.version ?? 0));
  const revisionAt = (history: History | undefined, side: Side) => history?.find((revision) => revision.version <= limitOf(side));

  function toEntry(collection: CollectionName, revision: Revision): Entry {
    return {
      collection,
      id: String(revision.data.id),
      version: revision.version,
      archived: revision.data.archived === true,
      aiGenerated: revision.data.aiGenerated === true,
      updatedAt: revision.writtenAt,
      data: revision.data,
    };
  }

  function entry(collection: CollectionName, id: string, side: Side = "draft"): Entry | null {
    const revision = revisionAt(histories.get(keyOf(collection, id)), side);
    return revision ? toEntry(collection, revision) : null;
  }

  function entries(collection: CollectionName, side: Side = "draft"): Entry[] {
    const found: Entry[] = [];
    for (const [key, history] of histories) {
      const revision = key.startsWith(`${collection}/`) ? revisionAt(history, side) : undefined;
      if (revision) found.push(toEntry(collection, revision));
    }
    return found.sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  function settings(side: Side = "draft"): SettingsEntry | null {
    const revision = revisionAt(settingsHistory, side);
    return revision ? { version: revision.version, updatedAt: revision.writtenAt, data: revision.data as SettingsEntry["data"] } : null;
  }

  function changeKind(before: Entry | null, after: Entry): PublicationChange["kind"] {
    if (!before) return "created";
    if (before.archived === after.archived) return "updated";
    return after.archived ? "archived" : "unarchived";
  }

  return {
    draftVersion: () => counter,
    published: () => published,
    entry,
    entries,
    settings,
    /** Earlier writes of an item, newest first, without the current one. */
    revisions: (collection: CollectionName, id: string): Revision[] => (histories.get(keyOf(collection, id)) ?? []).slice(1),

    write(collection: CollectionName, data: Data): Entry {
      const revision = { version: ++counter, writtenAt: now(), data };
      const key = keyOf(collection, String(data.id));
      histories.set(key, [revision, ...(histories.get(key) ?? [])]);
      return toEntry(collection, revision);
    },

    writeSettings(data: Data): SettingsEntry {
      settingsHistory = [{ version: ++counter, writtenAt: now(), data }, ...settingsHistory];
      return settings() as SettingsEntry;
    },

    /** Fills an empty store with a whole catalog as one write, the way a server seeds itself. */
    seed(catalog: Catalog): void {
      const revision = (data: Data) => ({ version: 1, writtenAt: now(), data });
      for (const collection of COLLECTION_NAMES) {
        for (const item of catalog[collection]) histories.set(keyOf(collection, item.id), [revision(item)]);
      }
      settingsHistory = [revision(catalog.settings)];
      counter = 1;
    },

    /** One side as a raw catalog: items sorted by id, settings possibly missing. */
    catalog(side: Side = "draft"): Record<string, unknown> {
      const catalog: Record<string, unknown> = { settings: settings(side)?.data };
      for (const collection of COLLECTION_NAMES) catalog[collection] = entries(collection, side).map((item) => item.data);
      return catalog;
    },

    publish(): Publication {
      published = { version: counter, publishedAt: now() };
      return published;
    },

    /** Everything written since the last publication. */
    changes(): PublicationChange[] {
      const since = published?.version ?? 0;
      const changes: PublicationChange[] = [];
      for (const collection of COLLECTION_NAMES) {
        for (const item of entries(collection)) {
          if (item.version <= since) continue;
          changes.push({ collection, id: item.id, version: item.version, kind: changeKind(entry(collection, item.id, "published"), item) });
        }
      }
      const draftSettings = settings();
      if (draftSettings && draftSettings.version > since) {
        changes.push({ collection: "settings", id: "", version: draftSettings.version, kind: settings("published") ? "updated" : "created" });
      }
      return changes;
    },
  };
}
