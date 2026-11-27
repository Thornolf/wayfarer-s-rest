// The check of the draft, the "Publier" button and the export of the whole draft.

import { assembleCatalog } from "../content/catalog";
import { checkContent } from "../content/check";
import { publicationState, publish } from "../content/publication";
import type { Clock } from "../clock";
import type { Api } from "../http/api";
import type { Services } from "../services";

export function publicationRoutes(api: Api, { store }: Services, now: Clock): void {
  api.handle("check", () => ({ draftVersion: store.draftVersion(), issues: checkContent(store.draft()) }));
  api.handle("publication", () => publicationState(store));
  api.handle("publish", ({ body }) => publish(store, body.draftVersion));
  api.handle("exportCatalogue", () => ({
    draftVersion: store.draftVersion(),
    exportedAt: now().toISOString(),
    catalog: assembleCatalog(store.draft()).catalog,
  }));
}
