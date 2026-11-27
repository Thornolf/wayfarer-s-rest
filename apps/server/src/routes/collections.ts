// The editors of the admin: the items of a collection and the settings form, all on the draft.

import type { Entry } from "@wayfarers-rest/shared";
import { isEntry, toEntry, toSettingsEntry, type StoredEntry } from "../content/catalog";
import { SETTINGS, type StoredItem } from "../content/store";
import type { Api } from "../http/api";
import { HttpError } from "../http/errors";
import type { Services } from "../services";

/** How many earlier writes of an item the admin is shown. */
const REVISIONS_SHOWN = 50;

/** The version an `If-Match` header names: `"12"`. Absent: the write is not guarded. */
function ifMatchVersion(header: string | undefined): number | undefined {
  if (header === undefined) return undefined;
  const version = /^"(\d+)"$/.exec(header.trim())?.[1];
  if (version === undefined) throw new HttpError("badRequest", `If-Match must be a quoted version, got ${header}`);
  return Number(version);
}

/** Lowercase and without accents, so that "foret" finds "Forêt". */
const folded = (text: string): string => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function textsOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(textsOf);
  return [];
}

export function collectionRoutes(api: Api, { store, draft }: Services): void {
  api.handle("listEntries", ({ params, query }) => {
    const archived = query.archived ?? "exclude";
    const search = query.search ? folded(query.search) : undefined;
    const keeps = (entry: Entry): boolean =>
      (archived === "include" || entry.archived === (archived === "only")) &&
      (query.aiGenerated === undefined || entry.aiGenerated === query.aiGenerated) &&
      (search === undefined || textsOf(entry.data).some((text) => folded(text).includes(search)));
    return { entries: store.list(params.collection).filter(isEntry).map(toEntry).filter(keeps) };
  });

  api.handle("getEntry", ({ params }) => {
    const item = store.find(params.collection, params.id);
    if (!item || !isEntry(item)) throw new HttpError("notFound", `No item "${params.id}" in ${params.collection}`);
    const published = store.findPublished(params.collection, params.id);
    return {
      entry: toEntry(item),
      published: published ? toEntry(published as StoredEntry) : null,
      revisions: store
        .revisions(params.collection, params.id, item.version, REVISIONS_SHOWN)
        .map((revision) => ({ version: revision.version, writtenAt: revision.updatedAt, data: revision.data })),
    };
  });

  api.handle("putEntry", ({ params, headers, body, reply }) => {
    const { item, created } = draft.saveEntry(params.collection, params.id, body.data, ifMatchVersion(headers["if-match"]));
    if (created) reply.code(201);
    return { entry: toEntry(item) };
  });

  api.handle("archiveEntry", ({ params }) => ({ entry: toEntry(draft.setArchived(params.collection, params.id, true)) }));
  api.handle("unarchiveEntry", ({ params }) => ({ entry: toEntry(draft.setArchived(params.collection, params.id, false)) }));

  const settingsDetail = (settings: StoredItem) => {
    const published = store.findPublished(SETTINGS, "");
    return { settings: toSettingsEntry(settings), published: published ? toSettingsEntry(published) : null };
  };

  api.handle("getSettings", () => {
    const settings = store.find(SETTINGS, "");
    if (!settings) throw new HttpError("notFound", "The settings were never written");
    return settingsDetail(settings);
  });

  api.handle("putSettings", ({ headers, body }) => settingsDetail(draft.saveSettings(body.data, ifMatchVersion(headers["if-match"]))));
}
