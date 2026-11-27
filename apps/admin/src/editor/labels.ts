// Where a problem is, in the words of the form: the labels of the fields that lead to it.

import { elementOf } from "@wayfarers-rest/shared";
import type { z } from "zod";
import { formFields } from "./fields";
import { parsePath } from "./paths";

/** "steps[2].scene" becomes ["Étapes", "3", "Scène"]; a part the schema does not know is kept as written. */
export function pathLabels(schema: z.ZodType, path: string): string[] {
  const labels: string[] = [];
  let current: z.ZodType | undefined = schema;
  for (const part of parsePath(path)) {
    if (typeof part === "number") {
      labels.push(String(part + 1));
      current = current && elementOf(current);
      continue;
    }
    const field = current && formFields(current).find((candidate) => candidate.key === part);
    labels.push(field?.label ?? part);
    current = field?.schema;
  }
  return labels;
}
