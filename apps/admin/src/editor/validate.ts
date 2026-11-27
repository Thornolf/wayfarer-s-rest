// Checks a form against its schema, with the same code the server runs, and gives each problem in
// French under the path of its field.

import type { z } from "zod";
import { fr } from "zod/locales";
import { formatPath } from "./paths";

/** The translator of i18next, or anything shaped like it. */
export type Translate = (key: string, values?: Record<string, string>) => string;
/** One message per faulty field, keyed by `formatPath`. */
export type FieldErrors = Record<string, string>;

const french = fr().localeError;

/** The rules the shared schema words itself, in English: each is matched to a sentence of the admin. */
const SCHEMA_RULES: readonly [pattern: RegExp, key: string, names: readonly string[]][] = [
  [/^min must not exceed max$/, "validation.rangeOrder", []],
  [/^A step needs either a scene or an event table, not both$/, "validation.sceneOrTable", []],
  [/^Sub-ambience ids must be unique/, "validation.subAmbienceIds", []],
  [/^A noise bed of kind "sound" needs a category$/, "validation.noiseBedCategory", []],
  [/^\{monster\} needs a monster rank$/, "validation.monsterRank", []],
  [/^Unknown slot \{(\w+)\}/, "validation.unknownSlot", ["slot"]],
  [/^\{(\w+)\} is a \w+: it takes no form or agreement/, "validation.slotWithoutForm", ["slot"]],
  [/^(?:Invalid|Unknown or repeated|Unclosed|Unexpected) .*/, "validation.templateSyntax", []],
];

/** The French sentence for a message the schema wrote; the message itself when it is not known. */
export function translateSchemaMessage(message: string, t: Translate): string {
  for (const [pattern, key, names] of SCHEMA_RULES) {
    const match = pattern.exec(message);
    if (!match) continue;
    const values = Object.fromEntries(names.map((name, index) => [name, match[index + 1] ?? ""]));
    return t(key, { ...values, detail: message });
  }
  return message;
}

export type Checked<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

/** Parses `value`; on failure, the first problem of each field. */
export function validate<S extends z.ZodType>(schema: S, value: unknown, t: Translate): Checked<z.output<S>> {
  const result = schema.safeParse(value, {
    error: (issue) => (issue.input === undefined ? t("validation.required") : french(issue)),
  });
  if (result.success) return { ok: true, data: result.data };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const path = formatPath(issue.path as (string | number)[]);
    errors[path] ??= issue.code === "custom" ? translateSchemaMessage(issue.message, t) : issue.message;
  }
  return { ok: false, errors };
}

/** The error to show on a field: its own, or the first one found under it when `deep` is asked. */
export function errorAt(errors: FieldErrors, path: string, deep = false): string | undefined {
  if (errors[path] !== undefined || !deep) return errors[path];
  const under = Object.keys(errors).find((key) => key.startsWith(`${path}.`) || key.startsWith(`${path}[`));
  return under === undefined ? undefined : errors[under];
}
