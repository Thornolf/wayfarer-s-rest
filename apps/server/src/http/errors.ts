// The one way a handler refuses a request: it throws an HttpError, and the server answers with the
// error body of the contract and the status of its code.

import { ERROR_STATUS, apiError, type ApiError, type ErrorCode, type FieldError } from "@wayfarers-rest/shared";
import type { z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: ApiError["error"]["details"],
  ) {
    super(message);
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }

  get body(): ApiError {
    return apiError(this.code, this.message, this.details);
  }
}

/** The problems of a Zod error, one per field, with paths written like `steps[2].scene`. */
export function fieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.reduce<string>((path, key) => (typeof key === "number" ? `${path}[${key}]` : path ? `${path}.${String(key)}` : String(key)), ""),
    message: issue.message,
  }));
}
