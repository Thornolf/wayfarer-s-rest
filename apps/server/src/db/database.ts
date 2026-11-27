// The SQLite database of the server (node:sqlite, WAL), with numbered SQL migrations applied at
// startup. Everything is synchronous: one writer, so a version taken inside a transaction can
// never be committed out of order.

import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";

const MIGRATIONS_DIR = join(import.meta.dirname, "migrations");
export const DATABASE_FILE = "wayfarer.sqlite";

export class Database {
  private readonly statements = new Map<string, StatementSync>();
  private depth = 0;

  constructor(private readonly sqlite: DatabaseSync) {}

  private prepare(sql: string): StatementSync {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.sqlite.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }

  get<Row>(sql: string, ...params: SQLInputValue[]): Row | undefined {
    return this.prepare(sql).get(...params) as Row | undefined;
  }

  all<Row>(sql: string, ...params: SQLInputValue[]): Row[] {
    return this.prepare(sql).all(...params) as Row[];
  }

  /** Runs a write and returns the number of rows it changed. */
  run(sql: string, ...params: SQLInputValue[]): number {
    return Number(this.prepare(sql).run(...params).changes);
  }

  /** All or nothing. A transaction opened inside another one joins it. */
  transaction<T>(work: () => T): T {
    if (this.depth > 0) return work();
    this.sqlite.exec("BEGIN IMMEDIATE");
    this.depth += 1;
    try {
      const result = work();
      this.sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    } finally {
      this.depth -= 1;
    }
  }

  close(): void {
    this.statements.clear();
    this.sqlite.close();
  }
}

function migrate(sqlite: DatabaseSync): void {
  sqlite.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT");
  const applied = new Set(sqlite.prepare("SELECT name FROM schema_migrations").all().map((row) => row.name as string));
  const record = sqlite.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)");
  for (const name of readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith(".sql")).sort()) {
    if (applied.has(name)) continue;
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      sqlite.exec(readFileSync(join(MIGRATIONS_DIR, name), "utf8"));
      record.run(name, new Date().toISOString());
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw new Error(`Migration ${name} failed`, { cause: error });
    }
  }
}

/** Opens (and creates if needed) the database of a data directory, migrated to the latest schema. */
export function openDatabase(dataDir: string): Database {
  mkdirSync(dataDir, { recursive: true });
  const sqlite = new DatabaseSync(join(dataDir, DATABASE_FILE));
  sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(sqlite);
  return new Database(sqlite);
}
