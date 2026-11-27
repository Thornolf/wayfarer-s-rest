import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { GOLDEN_DIRECTORY, GOLDEN_NIGHTS } from "./golden";

const HOW_TO_UPDATE = "if the change is wanted, run `npm run golden --workspace packages/shared` and review the diff";

for (const { file, render } of GOLDEN_NIGHTS) {
  test(`golden night ${file}: the generator and the starter world still give the night on record`, () => {
    const path = join(GOLDEN_DIRECTORY, file);
    assert.ok(existsSync(path), `golden/${file} is missing: ${HOW_TO_UPDATE}`);
    assert.equal(`${render()}\n`, readFileSync(path, "utf8"), `golden/${file} changed: ${HOW_TO_UPDATE}`);
  });
}
