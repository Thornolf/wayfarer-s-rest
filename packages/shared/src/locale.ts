/** Languages the content can be written in. French is required and is the fallback. */
export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

/** A piece of text written in the admin, one value per language; `fr` is always there. */
export type LocalizedText = { fr: string; en?: string | undefined };

/** Picks the text for a language, falling back to French when it has no translation yet. */
export function localize(text: LocalizedText, locale: Locale = DEFAULT_LOCALE): string {
  return text[locale] ?? text.fr;
}
