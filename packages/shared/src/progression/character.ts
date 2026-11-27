import type { CharacterSnapshot } from "../generator/types";
import type { Gender } from "../schema/common";

/** The character as it is created in the app: level 1, nothing worn, nobody met. */
export function newCharacter(name: string, gender: Gender): CharacterSnapshot {
  return { name, gender, level: 1, xp: 0, gear: {}, knownCompanions: [], pity: { rare: 0, epic: 0 }, servedSentences: {} };
}
