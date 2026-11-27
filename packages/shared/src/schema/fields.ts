// Reading a schema back: which fields an object has, and what the admin knows about each.

import { z } from "zod";
import { adminRegistry, type AdminMeta } from "./admin";

type Wrapper = z.ZodOptional | z.ZodDefault | z.ZodNullable;

function isWrapper(schema: z.ZodType): schema is Wrapper {
  return schema instanceof z.ZodOptional || schema instanceof z.ZodDefault || schema instanceof z.ZodNullable;
}

/** The schema under `.optional()`, `.default()` and `.nullable()`. */
export function unwrap(schema: z.ZodType): z.ZodType {
  let inner = schema;
  while (isWrapper(inner)) inner = inner.unwrap() as z.ZodType;
  return inner;
}

/** A field's admin metadata, wherever it was registered: on the field or under its wrappers. */
export function adminMeta(schema: z.ZodType): AdminMeta | undefined {
  let inner = schema;
  for (;;) {
    const meta = adminRegistry.get(inner);
    if (meta || !isWrapper(inner)) return meta;
    inner = inner.unwrap() as z.ZodType;
  }
}

export type FieldInfo = {
  key: string;
  /** The field's schema without its optional or default wrappers. */
  schema: z.ZodType;
  meta: AdminMeta | undefined;
  /** False when the field can be left out (optional, or filled by a default). */
  required: boolean;
};

/** The fields of an object schema, in the order they were declared: what a form draws. */
export function fieldsOf(schema: z.ZodType): FieldInfo[] {
  const object = unwrap(schema);
  if (!(object instanceof z.ZodObject)) return [];
  return Object.entries(object.shape as Record<string, z.ZodType>).map(([key, fieldSchema]) => ({
    key,
    schema: unwrap(fieldSchema),
    meta: adminMeta(fieldSchema),
    required: !(fieldSchema instanceof z.ZodOptional || fieldSchema instanceof z.ZodDefault),
  }));
}

/** The schema of a list's elements, or undefined when the schema is not a list. */
export function elementOf(schema: z.ZodType): z.ZodType | undefined {
  const inner = unwrap(schema);
  return inner instanceof z.ZodArray ? (inner.element as z.ZodType) : undefined;
}
