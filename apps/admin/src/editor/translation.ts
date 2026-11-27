// Which texts of an item still wait for a language. French is always there; another language is
// filled in over time, and the form flags what is left.

import { LOCALES, unwrap, type Locale } from "@wayfarers-rest/shared";
import { z } from "zod";
import { formatPath } from "./paths";
import { walk } from "./walk";

/** True for the schema of a text written once per language. */
export function isLocalizedSchema(schema: z.ZodType): boolean {
  const inner = unwrap(schema);
  if (!(inner instanceof z.ZodObject)) return false;
  const keys = Object.keys(inner.shape);
  return keys.includes("fr") && keys.every((key) => (LOCALES as readonly string[]).includes(key));
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/** The paths of the texts written in French that have nothing yet in `locale`. */
export function missingTranslations(schema: z.ZodType, value: unknown, locale: Locale): string[] {
  const missing: string[] = [];
  walk(schema, value, (fieldSchema, fieldValue, path) => {
    if (!isLocalizedSchema(fieldSchema)) return;
    const text = fieldValue as Record<string, unknown>;
    if (hasText(text.fr) && !hasText(text[locale])) missing.push(formatPath(path));
    return "skip";
  });
  return missing;
}
