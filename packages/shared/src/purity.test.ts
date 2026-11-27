import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

// The package runs in Expo Go, in a browser and in Node, and a night must replay the same from its
// seed: outside the tests and the command line, no Node API, no clock and no unseeded randomness.
const FORBIDDEN: [RegExp, string][] = [
  [/from\s+["']node:/, "a node: import"],
  [/\brequire\s*\(/, "require()"],
  [/\bprocess\./, "process"],
  [/\bBuffer\b/, "Buffer"],
  [/\bMath\.random\b/, "Math.random"],
  [/\bDate\b/, "Date"],
];

const root = import.meta.dirname;
const sources = readdirSync(root, { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.startsWith("cli"))
  .map((file) => join(root, file));

test("shared code is pure: no Node API, no clock, no unseeded randomness", () => {
  assert.ok(sources.length >= 15, `only ${sources.length} source files found`);
  for (const part of ["generator", "progression", "sound", "summary"]) {
    assert.ok(sources.some((file) => relative(root, file).startsWith(part)), `no source found in src/${part}`);
  }
  for (const file of sources) {
    const code = readFileSync(file, "utf8");
    for (const [pattern, name] of FORBIDDEN) {
      assert.doesNotMatch(code, pattern, `${relative(root, file)} uses ${name}`);
    }
  }
});
