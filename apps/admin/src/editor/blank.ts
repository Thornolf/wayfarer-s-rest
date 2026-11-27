// The value a form starts from: a new item, a new row of a list, an optional block just switched on.

import { elementOf } from "@wayfarers-rest/shared";
import type { z } from "zod";
import { formFields, widgetOf, type FormWidget } from "./fields";

const EMPTY: Partial<Record<FormWidget, () => unknown>> = {
  boolean: () => false,
  multiselect: () => [],
  refs: () => [],
  list: () => [],
  localized: () => ({ fr: "" }),
  template: () => ({ fr: "" }),
  noun: () => ({ text: { fr: "" }, gender: "m" }),
  range: () => ({}),
};

/**
 * What an empty form holds for a schema. Required blocks are opened and their defaults filled in;
 * what is optional is left out, and what the user must type or pick stays undefined.
 */
export function blankValue(schema: z.ZodType): unknown {
  const widget = widgetOf(schema);
  if (widget !== "group") return EMPTY[widget]?.();
  const value: Record<string, unknown> = {};
  for (const field of formFields(schema)) {
    const start = field.fallback !== undefined ? field.fallback : field.required ? blankValue(field.schema) : undefined;
    if (start !== undefined) value[field.key] = start;
  }
  return value;
}

/** The value a new row of a list starts from. */
export function blankElement(listSchema: z.ZodType): unknown {
  const element = elementOf(listSchema);
  return element ? blankValue(element) : undefined;
}
