// Walks a value along its schema: every field, every row of every list, with its path.

import { unwrap } from "@wayfarers-rest/shared";
import { z } from "zod";
import type { Path } from "./paths";

export type Visit = (schema: z.ZodType, value: unknown, path: Path) => "skip" | void;

/** Calls `visit` on the value and on everything under it; returning "skip" leaves a branch alone. */
export function walk(schema: z.ZodType, value: unknown, visit: Visit, path: Path = []): void {
  if (value === undefined || value === null) return;
  if (visit(schema, value, path) === "skip") return;
  const inner = unwrap(schema);
  if (inner instanceof z.ZodObject && typeof value === "object") {
    for (const [key, field] of Object.entries(inner.shape as Record<string, z.ZodType>)) {
      walk(field, (value as Record<string, unknown>)[key], visit, [...path, key]);
    }
  } else if (inner instanceof z.ZodArray && Array.isArray(value)) {
    value.forEach((element, index) => walk(inner.element as z.ZodType, element, visit, [...path, index]));
  }
}
