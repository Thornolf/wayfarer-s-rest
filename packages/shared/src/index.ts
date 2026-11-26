// Code shared by the app, the admin and the server: the content schema, its types and the night
// generator. Empty for now; see docs/DESIGN.md for what goes here.

/** Languages the content can be written in. French is required and is the fallback. */
export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

/** A piece of text written in the admin, one value per language; `fr` is always there. */
export type LocalizedText = { fr: string } & Partial<Record<Locale, string>>;

/** Picks the text for a language, falling back to French when it has no translation yet. */
export function localize(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text.fr;
}
