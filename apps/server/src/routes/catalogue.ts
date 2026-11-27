// The catalogue as a list of changes after a version: the publication for the app, the draft for
// the admin. The version is the ETag, so asking again when nothing moved costs a 304.

import { CATALOGUE_SCHEMA_VERSION, etagMatches, versionEtag, type CatalogueSync, type Routes, type Settings } from "@wayfarers-rest/shared";
import { isArchived, isEntry } from "../content/catalog";
import type { StoredItem } from "../content/store";
import { NOT_MODIFIED, type Api, type Call } from "../http/api";
import type { Services } from "../services";

function toSync(version: number, items: StoredItem[]): CatalogueSync {
  const settings = items.find((item) => !isEntry(item));
  return {
    version,
    schemaVersion: CATALOGUE_SCHEMA_VERSION,
    changes: items.filter(isEntry).map((item) => ({
      collection: item.collection,
      id: item.id,
      version: item.version,
      archived: isArchived(item),
      data: item.data,
    })),
    settings: settings ? { version: settings.version, data: settings.data as Settings } : null,
  };
}

export function catalogueRoutes(api: Api, { store }: Services): void {
  const answer = (call: Call<Routes["catalogue"]>, version: number, changedSince: (since: number) => StoredItem[]) => {
    call.reply.header("etag", versionEtag(version));
    if (etagMatches(call.headers["if-none-match"], version)) return NOT_MODIFIED;
    return toSync(version, changedSince(call.query.since ?? 0));
  };

  api.handle("catalogue", (call) => answer(call, store.publication()?.version ?? 0, (since) => store.published(since)));
  api.handle("draftCatalogue", (call) => answer(call, store.draftVersion(), (since) => store.draft(since)));
}
