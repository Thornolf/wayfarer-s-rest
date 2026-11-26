// The action layer: what the scene sounds like. A loop covers the scene; short sounds follow each
// other, a new variant each time, with a breath in between.

import type { TimelineEvent } from "../generator/types";
import type { Rng } from "../rng";
import type { World } from "../world";
import { cueFor, type SoundBank } from "./bank";
import type { SoundCue } from "./types";

/** Seconds a loop takes to come and go at the edges of its scene. */
const LOOP_FADE = { min: 1, max: 3 };
/** Seconds between two short sounds of the same scene. */
const BREATH = { min: 0.5, max: 3 };
const SHORTEST_STEP = 0.5;

export function actionCues(events: readonly TimelineEvent[], world: World, bank: SoundBank, rng: Rng): SoundCue[] {
  const cues: SoundCue[] = [];
  for (const event of events) {
    const category = world.byId.sceneTemplates.get(event.scene)?.actionCategory;
    if (category === undefined) continue;
    const draws = rng.fork(String(event.index));
    const end = event.at + event.duration;

    for (let at = event.at; at < end; ) {
      const variant = bank.pick(category, event.place);
      if (!variant) break;
      if (variant.sound.loop) {
        const fade = Math.min(event.duration / 2, draws.float(LOOP_FADE.min, LOOP_FADE.max));
        cues.push(cueFor(variant, "action", { at, duration: end - at, fadeIn: fade, fadeOut: fade }, draws));
        break;
      }
      // The last short sound may ring a little into the next scene.
      const cue = cueFor(variant, "action", { at }, draws);
      cues.push(cue);
      at += Math.max(SHORTEST_STEP, cue.duration) + draws.float(BREATH.min, BREATH.max);
    }
  }
  return cues;
}
