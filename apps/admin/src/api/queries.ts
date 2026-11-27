// What the screens read from the server, as TanStack Query options. Everything that depends on the
// content sits under the "content" key: one invalidation after any write refreshes it all.

import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CollectionName } from "@wayfarers-rest/shared";
import { api } from "./index";
import { draftOf } from "./draft";

const CONTENT = "content";

export const sessionQuery = queryOptions({ queryKey: ["session"], queryFn: () => api.call("session"), retry: false, staleTime: 60_000 });

/** The whole draft: what reference pickers, titles and counts are read from. */
export const draftQuery = queryOptions({ queryKey: [CONTENT, "draft"], queryFn: async () => draftOf(await api.call("draftCatalogue")) });

export const publicationQuery = queryOptions({ queryKey: [CONTENT, "publication"], queryFn: () => api.call("publication") });

export type EntryFilters = { archived?: "exclude" | "include" | "only"; aiGenerated?: boolean; search?: string };

export const entriesQuery = (collection: CollectionName, filters: EntryFilters) =>
  queryOptions({
    queryKey: [CONTENT, "entries", collection, filters],
    queryFn: async () => (await api.call("listEntries", { params: { collection }, query: filters })).entries,
    placeholderData: (previous) => previous,
  });

export const entryQuery = (collection: CollectionName, id: string) =>
  queryOptions({ queryKey: [CONTENT, "entry", collection, id], queryFn: () => api.call("getEntry", { params: { collection, id } }) });

export const settingsQuery = queryOptions({ queryKey: [CONTENT, "settings"], queryFn: () => api.call("getSettings") });

/** A write to the content: once it is done, everything read from the content is fetched again. */
export function useContentMutation<Input, Output>(write: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: write, onSuccess: () => queryClient.invalidateQueries({ queryKey: [CONTENT] }) });
}
