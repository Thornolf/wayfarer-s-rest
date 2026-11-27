// Transitions: the level-up as the event that earned it ends, then the ding of a quest and the door
// of an inn as the next one starts, one after the other.

import type { TimelineEvent } from "../generator/types";
import type { Rng } from "../rng";
import type { World } from "../world";
import { cueFor, type SoundBank } from "./bank";
import type { SoundCue } from "./types";

/** Seconds between two transitions, so that they do not cover each other. */
const STAGGER = 1.5;

export function transitionCues(events: readonly TimelineEvent[], world: World, bank: SoundBank, rng: Rng): SoundCue[] {
  const cues: SoundCue[] = [];
  const levelUp = world.catalog.settings.levelUpTransition;
  const play = (categories: readonly string[], event: TimelineEvent, from: number, stream = String(event.index)) => {
    const draws = rng.fork(stream);
    categories.forEach((category, n) => {
      const variant = bank.pick(category, event.place);
      if (variant) cues.push(cueFor(variant, "transition", { at: from + n * STAGGER }, draws));
    });
  };
  let levelled = false;
  for (const event of events) {
    // The level gained by the event before rings first: its ding never lands on the quest's.
    play([...(levelled && levelUp !== undefined ? [levelUp] : []), ...event.transitions], event, event.at);
    levelled = event.gains?.levelUp === true;
  }
  const last = events[events.length - 1];
  if (last && levelled && levelUp !== undefined) play([levelUp], last, last.at + last.duration, `${last.index}-end`);
  return cues;
}
