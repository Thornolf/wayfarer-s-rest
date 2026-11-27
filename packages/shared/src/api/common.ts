// The small schemas every part of the API contract is made of, and the shape of an error.

import { z } from "zod";
import { COLLECTION_NAMES } from "../schema/admin";
import { ID_PATTERN } from "../schema/common";

/** An instant, as an ISO 8601 string in UTC ("2026-11-27T06:30:00.000Z"). */
export const timestampSchema = z.iso.datetime();
export const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
export const md5Schema = z.string().regex(/^[0-9a-f]{32}$/);
/** The id of a content item: a stable slug, never changed once created. */
export const contentIdSchema = z.string().regex(ID_PATTERN);
export const collectionNameSchema = z.enum(COLLECTION_NAMES);
/** A value of the global content counter: 0 before the first write. */
export const versionSchema = z.number().int().min(0);

/** A whole number that arrives as text in a path or a query string; a client may pass a number. */
export const textInt = z
  .union([z.number(), z.string().regex(/^\d+$/).transform(Number)])
  .pipe(z.number().int().min(0));
/** A boolean that arrives as "true" or "false" in a query string; a client may pass a boolean. */
export const textFlag = z.union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")]);

/** A JSON object the server stores whole without looking inside; the phone is its source of truth. */
export const opaqueObject = <T extends object>() =>
  z.custom<T>((value) => typeof value === "object" && value !== null && !Array.isArray(value));

// --- Errors --------------------------------------------------------------------------------------

/** Every error code and the HTTP status it travels with. The admin and the app translate the code. */
export const ERROR_STATUS = {
  badRequest: 400, // params, query or body do not fit the contract
  unauthorized: 401, // no session, no device token, or a wrong password
  forbidden: 403, // signed in, but not for this route
  notFound: 404,
  conflict: 409, // an idempotent PUT replayed with another payload
  publishBlocked: 409, // the draft has errors: see `details.issues`
  versionConflict: 412, // If-Match or `draftVersion` no longer matches
  payloadTooLarge: 413,
  unsupportedMedia: 415, // an imported file has no audio track
  invalidContent: 422, // the item does not fit the content schema: see `details.fields`
  brokenReferences: 422, // the write would add broken references: see `details.issues`
  rateLimited: 429,
  internal: 500,
} as const;
export type ErrorCode = keyof typeof ERROR_STATUS;
export const errorCodeSchema = z.enum(Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]]);

/** One problem the content check found. The first four kinds are those of `checkReferences`. */
export const CHECK_ISSUE_KINDS = [
  "duplicateId",
  "missingRef",
  "archivedRef",
  "mismatchedRef",
  "invalidItem", // a stored item no longer fits the schema
  "emptyCategory", // a sound category without any active, converted sound
  "unclassifiedSound", // an imported sound whose file name could not be mapped
  "conversionPending",
  "conversionFailed",
  "dynamicNormalization", // the loudness pass had to compress the sound
] as const;
export const checkIssueSchema = z.object({
  /** An error blocks publishing; a warning is only shown. */
  severity: z.enum(["error", "warning"]),
  kind: z.enum(CHECK_ISSUE_KINDS),
  collection: z.union([collectionNameSchema, z.literal("settings")]),
  /** Empty for the settings. */
  id: z.string(),
  /** The field inside the item, e.g. `steps[2].scene`; empty when the whole item is concerned. */
  path: z.string(),
  target: z.object({ collection: collectionNameSchema, id: z.string() }).optional(),
  /** Technical detail in English (a schema message, an ffmpeg error), never shown as the main text. */
  detail: z.string().optional(),
});
export type CheckIssue = z.infer<typeof checkIssueSchema>;

export const fieldErrorSchema = z.object({ path: z.string(), message: z.string() });
export type FieldError = z.infer<typeof fieldErrorSchema>;

/** The body of every response that is not a success. `message` is English, for the logs. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.object({ fields: z.array(fieldErrorSchema).optional(), issues: z.array(checkIssueSchema).optional() }).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export function apiError(code: ErrorCode, message: string, details?: ApiError["error"]["details"]): ApiError {
  return { error: { code, message, ...(details ? { details } : {}) } };
}
