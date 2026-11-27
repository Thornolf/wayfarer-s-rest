// Device tokens: what the app sends in `Authorization: Bearer`. A token is shown once, when it is
// created; revoking it keeps the device in the list.

import { randomUUID } from "node:crypto";
import type { Device } from "@wayfarers-rest/shared";
import type { Clock } from "../clock";
import type { Database } from "../db/database";
import { hashToken, newToken } from "./tokens";

/** `lastSeenAt` moves at most this often, so that downloading a pack is not a write per file. */
const LAST_SEEN_STEP_MS = 60_000;

type Row = { id: string; name: string; created_at: string; last_seen_at: string | null; revoked_at: string | null };
const COLUMNS = "id, name, created_at, last_seen_at, revoked_at";

const toDevice = (row: Row): Device => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at,
  revokedAt: row.revoked_at,
});

export class Devices {
  constructor(
    private readonly db: Database,
    private readonly now: Clock,
  ) {}

  list(): Device[] {
    return this.db.all<Row>(`SELECT ${COLUMNS} FROM devices ORDER BY created_at, id`).map(toDevice);
  }

  create(name: string): { device: Device; token: string } {
    const token = newToken();
    const device: Device = { id: randomUUID(), name, createdAt: this.now().toISOString(), lastSeenAt: null, revokedAt: null };
    this.db.run("INSERT INTO devices (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)", device.id, name, hashToken(token), device.createdAt);
    return { device, token };
  }

  /** False when there is no such device. Revoking twice keeps the first date. */
  revoke(id: string): boolean {
    this.db.run("UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", this.now().toISOString(), id);
    return this.db.get("SELECT 1 FROM devices WHERE id = ?", id) !== undefined;
  }

  /** The device a token belongs to, unless it was revoked; notes that it was seen. */
  authenticate(token: string): Device | undefined {
    const row = this.db.get<Row>(`SELECT ${COLUMNS} FROM devices WHERE token_hash = ? AND revoked_at IS NULL`, hashToken(token));
    if (!row) return undefined;
    const now = this.now();
    if (row.last_seen_at === null || now.getTime() - Date.parse(row.last_seen_at) >= LAST_SEEN_STEP_MS) {
      row.last_seen_at = now.toISOString();
      this.db.run("UPDATE devices SET last_seen_at = ? WHERE id = ?", row.last_seen_at, row.id);
    }
    return toDevice(row);
  }
}
