// What differs between the draft of an item and what the phone has: the fields to look at before
// publishing.

import { stableStringify } from "@wayfarers-rest/shared";
import type { z } from "zod";
import { formFields, type FormField } from "./fields";

/** The top-level fields whose value is not the same on both sides. */
export function changedFields(schema: z.ZodType, before: Record<string, unknown>, after: Record<string, unknown>): FormField[] {
  return formFields(schema).filter((field) => stableStringify(before[field.key] ?? null) !== stableStringify(after[field.key] ?? null));
}
