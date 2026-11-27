// What is not content: health, the admin session, device tokens, and what the phone sends back
// (night reports and character backups).

import { z } from "zod";
import type { CharacterSnapshot } from "../generator/types";
import type { Night } from "../night";
import { opaqueObject, textInt, timestampSchema, versionSchema } from "./common";

export const healthSchema = z.object({
  status: z.literal("ok"),
  /** The commit or the version of the server code. */
  codeVersion: z.string(),
  schemaVersion: z.number().int().min(1),
  /** The published version, the one `GET /api/catalogue` serves. */
  catalogueVersion: versionSchema,
});
export type Health = z.infer<typeof healthSchema>;

// --- Access --------------------------------------------------------------------------------------

/** The cookie of an admin session: HttpOnly, Secure, SameSite=Strict, set by the login route. */
export const SESSION_COOKIE = "wr_session";
/** The value of the `Authorization` header the app sends with its device token. */
export const deviceAuthorization = (token: string): string => `Bearer ${token}`;

export const loginSchema = z.strictObject({ password: z.string().min(1) });
export const sessionSchema = z.object({ expiresAt: timestampSchema });

export const deviceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  createdAt: timestampSchema,
  lastSeenAt: timestampSchema.nullable(),
  revokedAt: timestampSchema.nullable(),
});
export type Device = z.infer<typeof deviceSchema>;
export const deviceListSchema = z.object({ devices: z.array(deviceSchema) });
export const deviceCreateSchema = z.strictObject({ name: z.string().min(1).max(80) });
/** The token is shown once, here, and never again: the server keeps only its hash. */
export const deviceCreatedSchema = z.object({ device: deviceSchema, token: z.string().min(1) });
export const deviceParamsSchema = z.strictObject({ deviceId: z.string().min(1) });

// --- Night reports -------------------------------------------------------------------------------

/**
 * A settled night. The phone chooses the id (a UUID made when the night starts), so sending it
 * again is harmless: first PUT 201, same body again 200, same id with another body 409 `conflict`.
 * The server compares the `stableStringify` of the two bodies.
 */
export const nightReportSchema = z.strictObject({
  characterId: z.uuid(),
  startedAt: timestampSchema,
  /** The wake time, or earlier when the app was reopened during the night. */
  endedAt: timestampSchema,
  /** The published catalogue version the night was generated from. */
  catalogueVersion: versionSchema,
  /** The night as `cutNight` left it, with its summary. */
  night: opaqueObject<Night>(),
});
export type NightReport = z.infer<typeof nightReportSchema>;

export const reportParamsSchema = z.strictObject({ reportId: z.uuid() });
export const reportReceiptSchema = z.object({ id: z.uuid(), receivedAt: timestampSchema });

export const storedReportSchema = z.object({ id: z.uuid(), receivedAt: timestampSchema, ...nightReportSchema.shape });
export type StoredReport = z.infer<typeof storedReportSchema>;

export const REPORT_PAGE_MAX = 100;
export const reportListQuerySchema = z.strictObject({
  characterId: z.uuid().optional(),
  /** Only the nights started before this instant: the `nextBefore` of the previous page. */
  before: timestampSchema.optional(),
  /** 30 when absent, `REPORT_PAGE_MAX` at most. */
  limit: textInt.optional(),
});
export const reportListSchema = z.object({
  /** Newest first. */
  reports: z.array(storedReportSchema),
  /** Null on the last page. */
  nextBefore: timestampSchema.nullable(),
});

// --- Character backups ---------------------------------------------------------------------------

/**
 * The character after a night. `revision` grows by one at each backup; the PUT is idempotent the
 * same way a report is. The phone is the source of truth: the server keeps a history, merges nothing.
 */
export const characterBackupSchema = z.strictObject({
  savedAt: timestampSchema,
  character: opaqueObject<CharacterSnapshot>(),
  /** Whatever else the app wants back on a new phone (bag, settings); the server does not read it. */
  appState: z.record(z.string(), z.unknown()).optional(),
});
export type CharacterBackup = z.infer<typeof characterBackupSchema>;

export const backupParamsSchema = z.strictObject({ characterId: z.uuid(), revision: textInt });
export const characterParamsSchema = z.strictObject({ characterId: z.uuid() });
export const backupReceiptSchema = z.object({ characterId: z.uuid(), revision: z.number().int().min(0), receivedAt: timestampSchema });
export const storedBackupSchema = z.object({
  characterId: z.uuid(),
  revision: z.number().int().min(0),
  receivedAt: timestampSchema,
  ...characterBackupSchema.shape,
});
export type StoredBackup = z.infer<typeof storedBackupSchema>;
