// The rule of the PUTs the phone may send twice: the first one creates, the same body again is
// accepted, another body under the same id is a conflict.

import { createHash } from "node:crypto";
import { stableStringify } from "@wayfarers-rest/shared";
import { HttpError } from "../http/errors";

export const payloadHash = (body: unknown): string => createHash("sha256").update(stableStringify(body)).digest("hex");

export type Receipt = { receivedAt: string; created: boolean };

/** The receipt of a replay, or undefined when nothing is stored yet under this id. */
export function replay(stored: { payload_sha256: string; received_at: string } | undefined, hash: string, what: string): Receipt | undefined {
  if (!stored) return undefined;
  if (stored.payload_sha256 !== hash) throw new HttpError("conflict", `${what} was already received with another content`);
  return { receivedAt: stored.received_at, created: false };
}
