// The state of a form: the value being edited, whether it differs from what was loaded, and what
// the schema says of it.

import { stableStringify } from "@wayfarers-rest/shared";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { setAt, type Path } from "../../editor/paths";
import { prune } from "../../editor/prune";
import { validate, type Checked, type Translate } from "../../editor/validate";

export type FormDraft<S extends z.ZodType> = {
  value: Record<string, unknown>;
  change: (path: Path, next: unknown) => void;
  /** True when something was edited since the form was loaded. */
  dirty: boolean;
  /** The value checked against the schema, as it would be sent. */
  checked: Checked<z.output<S>>;
};

export function useFormDraft<S extends z.ZodType>(schema: S, initial: Record<string, unknown>): FormDraft<S> {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  const change = useCallback((path: Path, next: unknown) => setValue((current) => setAt(current, path, next) as Record<string, unknown>), []);
  const pruned = useMemo(() => prune(value), [value]);
  const dirty = useMemo(() => stableStringify(pruned) !== stableStringify(prune(initial)), [pruned, initial]);
  const checked = useMemo(() => {
    const translate: Translate = (key, values) => t(key, values ?? {});
    return validate(schema, pruned, translate);
  }, [schema, pruned, t]);
  return { value, change, dirty, checked };
}
