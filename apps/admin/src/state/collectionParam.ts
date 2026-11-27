import { notFound } from "@tanstack/react-router";
import { collectionNameSchema, type CollectionName } from "@wayfarers-rest/shared";

/** Reads the `$collection` part of a path; an unknown collection is a page that does not exist. */
export function parseCollectionParam<P extends { collection: string }>(params: P): Omit<P, "collection"> & { collection: CollectionName } {
  const parsed = collectionNameSchema.safeParse(params.collection);
  if (!parsed.success) throw notFound();
  return { ...params, collection: parsed.data };
}
