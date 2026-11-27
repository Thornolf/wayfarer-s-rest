// The name an item goes by in lists, in reference pickers and in links.

import { COLLECTIONS, DEFAULT_LOCALE, type CollectionName, type Locale } from "@wayfarers-rest/shared";

function localized(value: object, locale: Locale): string | undefined {
  const texts = value as Record<string, unknown>;
  const text = texts[locale] ?? texts[DEFAULT_LOCALE];
  return typeof text === "string" && text !== "" ? text : undefined;
}

/** The text of a plain string, of a text per language, or of a noun; undefined for anything else. */
export function textOf(value: unknown, locale: Locale = DEFAULT_LOCALE): string | undefined {
  if (typeof value === "string") return value === "" ? undefined : value;
  if (value === null || typeof value !== "object") return undefined;
  if ("text" in value && value.text !== null && typeof value.text === "object") return localized(value.text, locale);
  return localized(value, locale);
}

/** The title of an item: its title field, or its id while that field is empty. */
export function titleOf(collection: CollectionName, data: Record<string, unknown>, locale: Locale = DEFAULT_LOCALE): string {
  return textOf(data[COLLECTIONS[collection].titleField], locale) ?? String(data.id ?? "");
}
