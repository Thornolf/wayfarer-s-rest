// What every input of a form shares: where to write, what is wrong, the draft that reference
// pickers read, the language being written.

import type { Locale } from "@wayfarers-rest/shared";
import { createContext, useContext } from "react";
import type { Draft } from "../../api/draft";
import type { Path } from "../../editor/paths";
import type { FieldErrors } from "../../editor/validate";

export type FormContextValue = {
  change: (path: Path, next: unknown) => void;
  errors: FieldErrors;
  draft: Draft | undefined;
  locale: Locale;
  /** True once the item exists: its id can no longer change. */
  idLocked: boolean;
};

export const FormContext = createContext<FormContextValue | undefined>(undefined);

export function useFormContext(): FormContextValue {
  const context = useContext(FormContext);
  if (!context) throw new Error("A form input was drawn outside a form");
  return context;
}
