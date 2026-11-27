// The French sentence for a failed call.

import type { TFunction } from "i18next";
import { ApiFailure, isFailure } from "./client";

export function failureText(error: unknown, t: TFunction): string {
  return error instanceof ApiFailure ? t(`errors.${error.code}`) : t("errors.internal");
}

/** The field errors a refused write carries, keyed like the form's own. */
export function serverFieldErrors(error: unknown): Record<string, string> {
  const fields = isFailure(error, "invalidContent") ? (error.details?.fields ?? []) : [];
  return Object.fromEntries(fields.map((field) => [field.path, field.message]));
}
