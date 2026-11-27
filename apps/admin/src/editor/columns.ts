// The columns of a collection's list, read from its schema: after the title, the first few fields
// short enough to compare at a glance (a choice, a reference, a number, a yes or no).

import { COLLECTIONS, type CollectionName } from "@wayfarers-rest/shared";
import { formFields, optionsOf, type FormField, type FormWidget } from "./fields";

const SHORT: readonly FormWidget[] = ["select", "multiselect", "ref", "refs", "number", "ratio", "boolean"];
/** Drawn by the list itself: the title, and the badges for the two flags. */
const OWN_COLUMNS = ["id", "archived", "aiGenerated"];
export const MAX_COLUMNS = 4;

export function listColumns(collection: CollectionName): FormField[] {
  const { schema, titleField } = COLLECTIONS[collection];
  return formFields(schema)
    .filter((field) => SHORT.includes(field.widget) && field.key !== titleField && !OWN_COLUMNS.includes(field.key))
    .slice(0, MAX_COLUMNS);
}

export type CellWords = { yes: string; no: string; titleOfRef: (field: FormField, id: string) => string };

/** What a cell shows: the label of a choice, the title of a referenced item, a number as written. */
export function cellText(field: FormField, value: unknown, words: CellWords): string {
  if (value === undefined || value === null) return "";
  const one = (single: unknown): string => {
    if (typeof single === "boolean") return single ? words.yes : words.no;
    if (field.widget === "select" || field.widget === "multiselect") return optionsOf(field.schema)[String(single)] ?? String(single);
    if (field.widget === "ref" || field.widget === "refs") return words.titleOfRef(field, String(single));
    return String(single);
  };
  return Array.isArray(value) ? value.map(one).join(", ") : one(value);
}
