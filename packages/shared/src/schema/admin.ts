// What the admin needs to draw a form from the content schema: every field of every collection is
// registered here with its French label and the widget that edits it.

import { z } from "zod";

/** The collections of the catalog, in the order the admin lists them. */
export const COLLECTION_NAMES = [
  "zones",
  "places",
  "monsters",
  "questTemplates",
  "sceneTemplates",
  "eventTables",
  "ambiences",
  "soundCategories",
  "sounds",
  "items",
  "companions",
  "summarySentences",
] as const;
export type CollectionName = (typeof COLLECTION_NAMES)[number];

export type Widget =
  | "id"
  | "text"
  | "number"
  | "ratio" // a number between 0 and 1: a probability, a volume
  | "boolean"
  | "select" // one of `options`
  | "multiselect" // several of `options`
  | "ref" // the id of an item of the `ref` collection
  | "refs" // several of them
  | "localized" // one text per language
  | "template" // a localized text with {slots} and [variants], see text/template.ts
  | "noun" // a name and its grammar
  | "range" // { min, max }
  | "list" // an array of objects or of localized texts, each drawn from its own fields
  | "group"; // a nested object, drawn from its own fields

export type AdminMeta = {
  /** French label shown next to the field. */
  label: string;
  widget: Widget;
  /** For `ref` and `refs`: the collection the ids point to. */
  ref?: CollectionName;
  /** For `ref` and `refs`: fields the target must have, e.g. `{ layer: "action" }`. */
  refWhere?: Record<string, string>;
  /** For `select` and `multiselect`: the French label of each value. */
  options?: Record<string, string>;
  /** For `template`: the slots the text may use. */
  slots?: readonly string[];
  /** French help text shown under the field. */
  help?: string;
};

export const adminRegistry = z.registry<AdminMeta>();

/**
 * Registers a field's admin metadata. A registration belongs to one schema instance, so every
 * field needs its own instance: build it in place, never reuse a registered schema elsewhere.
 */
export function field<T extends z.ZodType>(schema: T, meta: AdminMeta): T {
  adminRegistry.add(schema as z.ZodType, meta);
  return schema;
}
