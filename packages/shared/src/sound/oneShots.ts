// The one-shot layer: birds, thunder, voices… at random, with a silence drawn between two sounds
// of a category, and sometimes a burst: three birds at once, then nothing.

import type { TimelineEvent } from "../generator/types";
import type { Rng } from "../rng";
import type { SoundCategory } from "../schema/sound";
import type { World } from "../world";
import { ambienceOf } from "./ambience";
import { cueFor, type SoundBank } from "./bank";
import { holds } from "./conditions";
import type { SoundCue } from "./types";

/** The silence between two sounds of a category that does not set its own, in seconds. */
const DEFAULT_GAP = { min: 30, max: 120 };
/** Seconds between two sounds of a burst, on top of the sound itself. */
const BURST_SPACING = { min: 0.3, max: 2 };

export function oneShotCues(events: readonly TimelineEvent[], world: World, bank: SoundBank, rng: Rng): SoundCue[] {
  const cues: SoundCue[] = [];
  /** Per category: when its next sound is due. */
  const due = new Map<string, number>();
  const streams = new Map<string, Rng>();

  for (const event of events) {
    const ambience = ambienceOf(world, event.place);
    const end = event.at + event.duration;
    const categories = new Set((ambience?.oneShots ?? []).filter((entry) => holds(entry.when, event)).map((entry) => entry.category));

    for (const id of categories) {
      const category = world.byId.soundCategories.get(id);
      if (!category) continue;
      const draws = streams.get(id) ?? rng.fork(id);
      streams.set(id, draws);
      const gap = () => draws.float(category.minGap?.min ?? DEFAULT_GAP.min, category.minGap?.max ?? DEFAULT_GAP.max);

      // A category that was out of season starts a fresh silence rather than firing at once.
      let next = due.get(id);
      if (next === undefined || next < event.at) next = event.at + gap();
      while (next < end) {
        const played = burst(category, next, end, event.place, bank, draws);
        if (played.length === 0) break;
        cues.push(...played);
        const lastOne = played[played.length - 1] as SoundCue;
        next = lastOne.at + lastOne.duration + gap();
      }
      due.set(id, Math.max(next, end));
    }
  }
  return cues;
}

/** One sound, or several in a row when the category bursts; a burst stops with the scene. */
function burst(category: SoundCategory, at: number, until: number, placeId: string, bank: SoundBank, draws: Rng): SoundCue[] {
  const bursting = category.burst !== undefined && draws.chance(category.burst.chance);
  const fewest = Math.max(1, Math.round(category.burst?.count.min ?? 1));
  const count = bursting ? draws.int(fewest, Math.max(fewest, Math.round(category.burst?.count.max ?? 1))) : 1;
  const cues: SoundCue[] = [];
  for (let n = 0; n < count && at < until; n++) {
    const variant = bank.pick(category.id, placeId);
    if (!variant) break;
    const cue = cueFor(variant, "oneShot", { at }, draws);
    cues.push(cue);
    at = cue.at + cue.duration + draws.float(BURST_SPACING.min, BURST_SPACING.max);
  }
  return cues;
}
