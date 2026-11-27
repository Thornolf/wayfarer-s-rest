// Backups of the character. The phone is the source of truth: the server keeps the last revisions
// and gives the newest back to a new phone.

import type { CharacterBackup, StoredBackup } from "@wayfarers-rest/shared";
import type { Clock } from "../clock";
import type { Database } from "../db/database";
import { payloadHash, replay, type Receipt } from "./idempotent";

/** How many revisions are kept for each character. */
export const BACKUPS_KEPT = 30;

type Row = { revision: number; payload: string; received_at: string };
type Stamp = { payload_sha256: string; received_at: string };

export class Backups {
  constructor(
    private readonly db: Database,
    private readonly now: Clock,
  ) {}

  put(characterId: string, revision: number, backup: CharacterBackup): Receipt {
    const hash = payloadHash(backup);
    return this.db.transaction(() => {
      const stored = this.db.get<Stamp>(
        "SELECT payload_sha256, received_at FROM character_backups WHERE character_id = ? AND revision = ?",
        characterId,
        revision,
      );
      const receipt = replay(stored, hash, `Backup ${revision} of character ${characterId}`) ?? { receivedAt: this.now().toISOString(), created: true };
      if (receipt.created) {
        this.db.run(
          "INSERT INTO character_backups (character_id, revision, payload, payload_sha256, received_at) VALUES (?, ?, ?, ?, ?)",
          characterId,
          revision,
          JSON.stringify(backup),
          hash,
          receipt.receivedAt,
        );
        this.db.run(
          `DELETE FROM character_backups WHERE character_id = ?1 AND revision NOT IN (
             SELECT revision FROM character_backups WHERE character_id = ?1 ORDER BY revision DESC LIMIT ?2
           )`,
          characterId,
          BACKUPS_KEPT,
        );
      }
      return receipt;
    });
  }

  /** The highest revision of a character. */
  latest(characterId: string): StoredBackup | undefined {
    const row = this.db.get<Row>(
      "SELECT revision, payload, received_at FROM character_backups WHERE character_id = ? ORDER BY revision DESC LIMIT 1",
      characterId,
    );
    return row && { characterId, revision: row.revision, receivedAt: row.received_at, ...(JSON.parse(row.payload) as CharacterBackup) };
  }
}
