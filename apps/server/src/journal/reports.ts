// The journal of the nights ("Chroniques"): every report the phone sent, stored whole.

import { REPORT_PAGE_MAX, type NightReport, type StoredReport } from "@wayfarers-rest/shared";
import type { Clock } from "../clock";
import type { Database } from "../db/database";
import { payloadHash, replay, type Receipt } from "./idempotent";

const DEFAULT_PAGE = 30;

type Row = { id: string; started_at: string; payload: string; received_at: string };
type Stamp = { payload_sha256: string; received_at: string };

/** Timestamps are compared as text: they are all rewritten the way `toISOString` writes them. */
const normalized = (timestamp: string): string => new Date(timestamp).toISOString();

export class Reports {
  constructor(
    private readonly db: Database,
    private readonly now: Clock,
  ) {}

  put(id: string, report: NightReport): Receipt {
    const hash = payloadHash(report);
    return this.db.transaction(() => {
      const stored = this.db.get<Stamp>("SELECT payload_sha256, received_at FROM night_reports WHERE id = ?", id);
      const receipt = replay(stored, hash, `Report ${id}`) ?? { receivedAt: this.now().toISOString(), created: true };
      if (receipt.created) {
        this.db.run(
          "INSERT INTO night_reports (id, character_id, started_at, payload, payload_sha256, received_at) VALUES (?, ?, ?, ?, ?, ?)",
          id,
          report.characterId,
          normalized(report.startedAt),
          JSON.stringify(report),
          hash,
          receipt.receivedAt,
        );
      }
      return receipt;
    });
  }

  /** One page, newest night first; `nextBefore` asks for the following one, null on the last page. */
  list(query: { characterId?: string; before?: string; limit?: number }): { reports: StoredReport[]; nextBefore: string | null } {
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_PAGE, 1), REPORT_PAGE_MAX);
    const rows = this.db.all<Row>(
      `SELECT id, started_at, payload, received_at FROM night_reports
       WHERE (?1 IS NULL OR character_id = ?1) AND (?2 IS NULL OR started_at < ?2)
       ORDER BY started_at DESC, id LIMIT ?3`,
      query.characterId ?? null,
      query.before === undefined ? null : normalized(query.before),
      limit + 1,
    );
    const page = rows.slice(0, limit);
    return {
      reports: page.map((row) => ({ id: row.id, receivedAt: row.received_at, ...(JSON.parse(row.payload) as NightReport) })),
      nextBefore: rows.length > limit ? page[page.length - 1].started_at : null,
    };
  }
}
