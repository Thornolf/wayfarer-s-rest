// `npm run golden --workspace packages/shared`: writes the golden nights again, after a wanted
// change in the generator or in the starter content.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GOLDEN_DIRECTORY, GOLDEN_NIGHTS } from "./golden";

mkdirSync(GOLDEN_DIRECTORY, { recursive: true });
for (const { file, render } of GOLDEN_NIGHTS) {
  writeFileSync(join(GOLDEN_DIRECTORY, file), `${render()}\n`);
  console.log(`golden/${file}`);
}
