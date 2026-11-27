import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { openDatabase } from "./database";

function tempDir(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "wayfarer-db-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("a new database is migrated, in WAL mode, and migrations run only once", (t) => {
  const dir = tempDir(t);
  const first = openDatabase(join(dir, "nested"));
  assert.equal(first.get<{ journal_mode: string }>("PRAGMA journal_mode")?.journal_mode, "wal");
  assert.equal(first.get<{ version: number }>("SELECT version FROM content_counter")?.version, 0);
  first.run("UPDATE content_counter SET version = 7");
  const applied = first.all<{ name: string }>("SELECT name FROM schema_migrations");
  first.close();

  const second = openDatabase(join(dir, "nested"));
  t.after(() => second.close());
  assert.equal(second.get<{ version: number }>("SELECT version FROM content_counter")?.version, 7);
  assert.deepEqual(second.all<{ name: string }>("SELECT name FROM schema_migrations"), applied);
  assert.ok(applied.length >= 1);
});

test("a transaction that throws leaves nothing behind, nested ones included", (t) => {
  const db = openDatabase(tempDir(t));
  t.after(() => db.close());
  assert.throws(() =>
    db.transaction(() => {
      db.transaction(() => db.run("UPDATE content_counter SET version = 3"));
      throw new Error("boom");
    }),
  );
  assert.equal(db.get<{ version: number }>("SELECT version FROM content_counter")?.version, 0);
  db.transaction(() => db.run("UPDATE content_counter SET version = 4"));
  assert.equal(db.get<{ version: number }>("SELECT version FROM content_counter")?.version, 4);
});
