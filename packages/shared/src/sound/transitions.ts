// Transitions: the ding of a quest, the door of an inn as an event starts, the level-up as it ends.

import type { TimelineEvent } from "../generator/types";
import type { Rng } from "../rng";
import type { World } from "../world";
import { cueFor, type SoundBank } from "./bank";
import type { SoundCue } from "./types";

/** Seconds between two transitions of the same event, so that they do not cover each other. */
const STAGGER = 1.5;

export function transitionCues(events: readonly TimelineEvent[], world: World, bank: SoundBank, rng: Rng): SoundCue[] {
  const cues: SoundCue[] = [];
  const levelUp = world.catalog.settings.levelUpTransition;
  for (const event of events) {
    const draws = rng.fork(String(event.index));
    const wanted = event.transitions.map((category, n) => ({ category, at: event.at + n * STAGGER }));
    if (event.gains?.levelUp && levelUp !== undefined) wanted.push({ category: levelUp, at: event.at + event.duration });
    for (const { category, at } of wanted) {
      const variant = bank.pick(category, event.place);
      if (variant) cues.push(cueFor(variant, "transition", { at }, draws));
    }
  }
  return cues;
}
