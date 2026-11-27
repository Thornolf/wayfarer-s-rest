// The golden nights: a few nights of the starter world whose printed form is kept in `golden/`.
// A change in the generator or in the starter content shows there, line by line. When the change
// is wanted, `npm run golden --workspace packages/shared` writes the files again, and the diff
// is reviewed with the rest of the commit.

import { join } from "node:path";
import { fingerprint } from "../schema/hash";
import { withSounds } from "../sound/testSounds";
import { loadStarterCatalog } from "../starter";
import { parseOptions, type SimulateOptions } from "./options";
import { run, simulate } from "./run";

export const GOLDEN_DIRECTORY = join(import.meta.dirname, "..", "..", "golden");

/** The cues of a night with test sounds in every category: how many per layer, and their fingerprint. */
function soundOf(args: readonly string[]): string {
  const { night } = simulate(parseOptions(args) as SimulateOptions, withSounds(loadStarterCatalog()));
  const layers = [...new Set(night.cues.map((cue) => cue.layer))].sort();
  return [
    `Aventure #${night.seed}, avec trois sons d’essai par catégorie`,
    ...layers.map((layer) => `${layer} : ${night.cues.filter((cue) => cue.layer === layer).length}`),
    `fondu final : ${night.finalFade.at} s, pendant ${night.finalFade.duration} s`,
    `empreinte des lectures : ${fingerprint(night.cues)}`,
    `avertissements : ${night.warnings.length}`,
  ].join("\n");
}

export const GOLDEN_NIGHTS: { file: string; render: () => string }[] = [
  { file: "nuit-4821.txt", render: () => run(["--seed", "4821"], loadStarterCatalog()) },
  {
    file: "debut-7.txt",
    render: () =>
      run(["--seed", "7", "--name", "Lyra", "--gender", "f", "--level", "12", "--sound", "15", "--wake", "00:30", "--zone", "marais-de-noirjonc", "--all"], loadStarterCatalog()),
  },
  { file: "sons-4821.txt", render: () => soundOf(["--seed", "4821"]) },
];
