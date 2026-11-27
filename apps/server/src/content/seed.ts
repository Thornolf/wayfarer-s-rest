// First start: the content is empty, so the starter world of the repository becomes the draft and
// the first publication. After that the database is the only source, and this never runs again.

import { COLLECTION_NAMES } from "@wayfarers-rest/shared";
import { loadStarterCatalog } from "@wayfarers-rest/shared/starter";
import type { Database } from "../db/database";
import { SETTINGS, type ContentStore } from "./store";

/** Returns true when the starter world was written. */
export function seedStarterWorld(db: Database, store: ContentStore): boolean {
  if (store.draftVersion() > 0) return false;
  const catalog = loadStarterCatalog();
  db.transaction(() => {
    for (const name of COLLECTION_NAMES) {
      for (const item of catalog[name]) store.write(name, item.id, item);
    }
    store.write(SETTINGS, "", catalog.settings);
    store.publish();
  });
  return true;
}
