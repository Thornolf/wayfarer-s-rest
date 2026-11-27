// Admin sessions: a random token in a cookie, valid for thirty days or until the admin signs out.

import type { Clock } from "../clock";
import type { Database } from "../db/database";
import { hashToken, newToken } from "./tokens";

const SESSION_DAYS = 30;

export type Session = { token: string; expiresAt: string };

export class Sessions {
  constructor(
    private readonly db: Database,
    private readonly now: Clock,
  ) {}

  open(): Session {
    const now = this.now();
    const session = { token: newToken(), expiresAt: new Date(now.getTime() + SESSION_DAYS * 86_400_000).toISOString() };
    this.db.transaction(() => {
      this.db.run("DELETE FROM admin_sessions WHERE expires_at <= ?", now.toISOString());
      this.db.run(
        "INSERT INTO admin_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)",
        hashToken(session.token),
        now.toISOString(),
        session.expiresAt,
      );
    });
    return session;
  }

  find(token: string): Session | undefined {
    const row = this.db.get<{ expires_at: string }>(
      "SELECT expires_at FROM admin_sessions WHERE token_hash = ? AND expires_at > ?",
      hashToken(token),
      this.now().toISOString(),
    );
    return row && { token, expiresAt: row.expires_at };
  }

  close(token: string): void {
    this.db.run("DELETE FROM admin_sessions WHERE token_hash = ?", hashToken(token));
  }
}
