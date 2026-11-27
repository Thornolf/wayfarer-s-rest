// `npm run simulate --workspace packages/shared -- --seed 4821 --sound 30`: a night of the starter
// world, printed. See `--help`.

import { loadStarterCatalog } from "../starter";
import { OptionError } from "./options";
import { run } from "./run";

try {
  console.log(run(process.argv.slice(2), loadStarterCatalog()));
} catch (error) {
  if (!(error instanceof OptionError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
}
