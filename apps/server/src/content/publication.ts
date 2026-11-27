// What the "Publier" button shows and does: the changes waiting in the draft, and the publication
// itself, refused while the check finds errors.

import type { PublicationChange, PublicationState } from "@wayfarers-rest/shared";
import { HttpError } from "../http/errors";
import { isArchived } from "./catalog";
import { checkContent, errorsOf } from "./check";
import type { ContentStore, StoredItem } from "./store";

const keyOf = (item: StoredItem): string => `${item.collection}/${item.id}`;

function changeKind(draft: StoredItem, published: StoredItem | undefined): PublicationChange["kind"] {
  if (!published) return "created";
  if (isArchived(draft) === isArchived(published)) return "updated";
  return isArchived(draft) ? "archived" : "unarchived";
}

export function publicationState(store: ContentStore): PublicationState {
  const published = store.publication();
  const live = new Map(store.published().map((item) => [keyOf(item), item]));
  const changes = store.draft(published?.version ?? 0).map((item) => ({
    collection: item.collection,
    id: item.id,
    version: item.version,
    kind: changeKind(item, live.get(keyOf(item))),
  }));
  return { draftVersion: store.draftVersion(), published, changes };
}

/** Publishes the draft the admin was looking at: `draftVersion` is the version it read. */
export function publish(store: ContentStore, draftVersion: number): PublicationState {
  const current = store.draftVersion();
  if (draftVersion !== current) throw new HttpError("versionConflict", `The draft is at version ${current}, not ${draftVersion}`);
  const errors = errorsOf(checkContent(store.draft()));
  if (errors.length > 0) throw new HttpError("publishBlocked", "The draft has errors", { issues: errors });
  store.publish();
  return publicationState(store);
}
