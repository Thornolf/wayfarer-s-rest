// What a form draws for a schema: its fields in order, each with the widget that edits it. The
// widget comes from the admin metadata written in the shared schema; a field without metadata (the
// inside of a noun, the rows of a list) gets one from its type, so nothing is ever left undrawn.

import { adminMeta, fieldsOf, unwrap, type AdminMeta, type Widget } from "@wayfarers-rest/shared";
import { z } from "zod";

/** `json` shows, read-only, a value no widget knows how to edit. */
export type FormWidget = Widget | "json";

export type FormField = {
  key: string;
  /** Without its optional and default wrappers. */
  schema: z.ZodType;
  label: string;
  widget: FormWidget;
  meta: AdminMeta | undefined;
  /** False when the field can be left empty. */
  required: boolean;
  /** The value the schema fills in when the field is left out. */
  fallback: unknown;
};

export function widgetOf(schema: z.ZodType): FormWidget {
  const meta = adminMeta(schema);
  if (meta) return meta.widget;
  const inner = unwrap(schema);
  if (inner instanceof z.ZodObject) return "group";
  if (inner instanceof z.ZodArray) return "list";
  if (inner instanceof z.ZodString) return "text";
  if (inner instanceof z.ZodNumber) return "number";
  if (inner instanceof z.ZodBoolean) return "boolean";
  if (inner instanceof z.ZodEnum) return "select";
  return "json";
}

/** The choices of a select: the labels of the schema, or the raw values when it has none. */
export function optionsOf(schema: z.ZodType): Record<string, string> {
  const options = adminMeta(schema)?.options;
  if (options) return options;
  const inner = unwrap(schema);
  const choices = inner instanceof z.ZodArray ? unwrap(inner.element as z.ZodType) : inner;
  if (!(choices instanceof z.ZodEnum)) return {};
  return Object.fromEntries(choices.options.map((value) => [String(value), String(value)]));
}

function fallbackOf(schema: z.ZodType): unknown {
  let inner = schema;
  for (;;) {
    if (inner instanceof z.ZodDefault) return inner.parse(undefined);
    if (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) inner = inner.unwrap() as z.ZodType;
    else return undefined;
  }
}

export function formFields(schema: z.ZodType): FormField[] {
  const object = unwrap(schema);
  if (!(object instanceof z.ZodObject)) return [];
  const shape = object.shape as Record<string, z.ZodType>;
  return fieldsOf(object).map((field) => ({
    ...field,
    label: field.meta?.label ?? field.key,
    widget: widgetOf(shape[field.key] as z.ZodType),
    fallback: fallbackOf(shape[field.key] as z.ZodType),
  }));
}

/** The keys of a stored value that its schema does not know: shown apart so nothing is lost silently. */
export function unknownKeys(schema: z.ZodType, value: unknown): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  const known = new Set(formFields(schema).map((field) => field.key));
  return Object.keys(value).filter((key) => !known.has(key));
}
