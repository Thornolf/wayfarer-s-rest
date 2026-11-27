import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ARCHIVED_FILTERS, CHECK_ISSUE_KINDS, ERROR_STATUS, LOCALES, PUBLICATION_CHANGE_KINDS } from "@wayfarers-rest/shared";
import fr from "./locales/fr.json" with { type: "json" };

const SOURCES = join(import.meta.dirname, "..");

function has(key: string): boolean {
  const plural = (path: string) => [path, `${path}_one`, `${path}_other`];
  return plural(key).some((candidate) => {
    let node: unknown = fr;
    for (const part of candidate.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
    return typeof node === "string";
  });
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

test("every text the code asks for is written in French", () => {
  const missing = new Set<string>();
  for (const file of sourceFiles(SOURCES)) {
    const source = readFileSync(file, "utf8");
    for (const [, key] of source.matchAll(/\bt\(\s*"([A-Za-z0-9_.]+)"/g)) if (!has(key as string)) missing.add(key as string);
    for (const [, key] of source.matchAll(/"(validation\.[A-Za-z]+)"/g)) if (!has(key as string)) missing.add(key as string);
  }
  assert.deepEqual([...missing], []);
});

test("every key built from a value of the contract has its text", () => {
  const built = [
    ...[...Object.keys(ERROR_STATUS), "network", "badResponse"].map((code) => `errors.${code}`),
    ...CHECK_ISSUE_KINDS.map((kind) => `check.kind.${kind}`),
    ...PUBLICATION_CHANGE_KINDS.map((kind) => `publication.kind.${kind}`),
    ...ARCHIVED_FILTERS.map((filter) => `list.archived.${filter}`),
    ...LOCALES.map((locale) => `locales.${locale}`),
    ...["min", "max"].map((bound) => `form.${bound}`),
    ...["proper", "isPlural"].map((flag) => `noun.${flag}`),
  ];
  assert.deepEqual(built.filter((key) => !has(key)), []);
});
