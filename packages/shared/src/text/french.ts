// French grammar for the names of the content: articles, elision and contractions. The name carries
// its grammar (gender, plural, proper noun…), so a sentence only says which form it wants.

import { DEFAULT_LOCALE, localize, type Locale } from "../locale";
import type { Gender, Noun } from "../schema/common";

/** The typographic apostrophe used wherever a word is elided. Content must use the same one. */
export const APOSTROPHE = "’";

/**
 * How a name enters a sentence:
 * - `bare`: the name alone ("loup gris") ;
 * - `le`: definite article ("le loup gris", "l’auberge", "les collines") ;
 * - `un`: indefinite article ("un loup gris", "une auberge", "des collines") ;
 * - `de`: "de" + definite article ("du loup gris", "de l’auberge", "des collines", "de Hautval") ;
 * - `a`: "à" + definite article ("au loup gris", "à l’auberge", "aux collines", "à Hautval") ;
 * - `d`: "de" without article ("de loup gris", "d’araignée") ;
 * - `ce`: demonstrative ("ce loup gris", "cet ours", "cette auberge", "ces collines").
 */
export const NOUN_FORMS = ["bare", "le", "un", "de", "a", "d", "ce"] as const;
export type NounForm = (typeof NOUN_FORMS)[number];

export type NounPhraseOptions = { plural?: boolean; locale?: Locale };

const VOWELS = "aàâäeéèêëiîïoôöuùûüœæ";

/** A name written in the app rather than in the admin, like the hero's. */
export function properNoun(name: string, gender: Gender): Noun {
  return { text: { fr: name }, gender, proper: true };
}

/** The plural of a name: the one written in the admin, or a guess that suits single words. */
export function pluralOf(noun: Noun, locale: Locale = DEFAULT_LOCALE): string {
  const singular = localize(noun.text, locale);
  if (noun.isPlural) return singular;
  if (noun.plural) return localize(noun.plural, locale);
  if (/[sxz]$/.test(singular)) return singular;
  if (/(?:eau|au|eu)$/.test(singular)) return `${singular}x`;
  if (/al$/.test(singular)) return `${singular.slice(0, -2)}aux`;
  return `${singular}s`;
}

/**
 * Whether the word before the name loses its vowel ("l’auberge", "d’Elwyn"). The admin can force
 * it either way; otherwise a leading vowel elides and a leading h does not (h aspiré by default).
 */
function elides(noun: Noun, text: string): boolean {
  return noun.elided ?? VOWELS.includes(text.charAt(0).toLowerCase());
}

/** The name with the article, preposition or demonstrative the form asks for. */
export function nounPhrase(noun: Noun, form: NounForm = "bare", options: NounPhraseOptions = {}): string {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const plural = options.plural === true || noun.isPlural === true;
  const text = options.plural ? pluralOf(noun, locale) : localize(noun.text, locale);
  const elided = elides(noun, text);
  const masculine = noun.gender === "m";
  const short = (word: string) => (elided ? `${word}${APOSTROPHE}${text}` : `${word}e ${text}`);

  switch (form) {
    case "bare":
      return text;
    case "d":
      return short("d");
    case "le":
      if (noun.proper) return text;
      if (plural) return `les ${text}`;
      if (elided) return `l${APOSTROPHE}${text}`;
      return `${masculine ? "le" : "la"} ${text}`;
    case "un":
      if (noun.proper) return text;
      if (plural) return `des ${text}`;
      return `${masculine ? "un" : "une"} ${text}`;
    case "de":
      if (noun.proper) return short("d");
      if (plural) return `des ${text}`;
      if (elided) return `de l${APOSTROPHE}${text}`;
      return `${masculine ? "du" : "de la"} ${text}`;
    case "a":
      if (noun.proper) return `à ${text}`;
      if (plural) return `aux ${text}`;
      if (elided) return `à l${APOSTROPHE}${text}`;
      return `${masculine ? "au" : "à la"} ${text}`;
    case "ce":
      if (noun.proper) return text;
      if (plural) return `ces ${text}`;
      if (!masculine) return `cette ${text}`;
      return `${elided ? "cet" : "ce"} ${text}`;
  }
}

/** "Brann", "Brann et Mira", "Brann, Mira et Kaelen". */
export function joinList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}`;
}

/** A whole number as French writes it, thousands set apart by a narrow no-break space: "6 448". */
export function wholeNumber(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+$)/g, "\u202f");
}
