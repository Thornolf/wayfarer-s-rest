// The sound of a night: the cues of every layer over a continuous noise bed, until the sound timer
// ends in a long fade of everything together. Past the timer the night goes on in silence: nothing is planned there.

import type { NightWarning, TimelineEvent } from "../generator/types";
import { createRng, type Rng } from "../rng";
import type { World } from "../world";
import { actionCues } from "./action";
import { ambienceCues } from "./ambience";
import { SoundBank, cueFor } from "./bank";
import { oneShotCues } from "./oneShots";
import { round } from "./round";
import { transitionCues } from "./transitions";
import type { SoundCue } from "./types";

/** Seconds the noise bed takes to rise at the start of the night. */
const BED_FADE_IN = 4;

export type SoundPlan = {
  cues: SoundCue[];
  /**
   * The fade that ends the sound: from `at`, everything that plays goes down together to silence
   * over `duration` seconds. The player applies it on top of each cue's own volume.
   */
  finalFade: { at: number; duration: number };
  warnings: NightWarning[];
};

export type SoundRequest = {
  seed: number;
  world: World;
  /** The events of the night; only those that start before the sound ends are heard. */
  events: readonly TimelineEvent[];
  soundSeconds: number;
};

/** The final fade of a sound timer: its last tenth, between half a minute and two minutes long. */
export function finalFadeOf(soundSeconds: number): SoundPlan["finalFade"] {
  const duration = Math.min(soundSeconds, Math.min(120, Math.max(30, soundSeconds * 0.1)));
  return { at: soundSeconds - duration, duration };
}

/**
 * The cues of a night, sorted by start. Sound has its own random stream, forked by layer and by
 * category: adding a sound never changes the story, and hardly changes the other categories.
 */
export function planSound(request: SoundRequest): SoundPlan {
  const { world, soundSeconds } = request;
  const finalFade = finalFadeOf(Math.max(0, soundSeconds));
  if (soundSeconds <= 0) return { cues: [], finalFade, warnings: [] };

  const rng = createRng(request.seed).fork("sound");
  const bank = new SoundBank(world, rng.fork("variants"));
  const heard = request.events.filter((event) => event.at < soundSeconds);
  const cues = [
    ...noiseBed(world, bank, soundSeconds, rng.fork("bed"), heard[0]?.place),
    ...ambienceCues(heard, world, bank, rng.fork("ambience")),
    ...actionCues(heard, world, bank, rng.fork("action")),
    ...oneShotCues(heard, world, bank, rng.fork("oneShot")),
    ...transitionCues(heard, world, bank, rng.fork("transition")),
  ];
  const heardCues = cues.flatMap((cue) => cutAt(cue, soundSeconds));
  return { cues: heardCues.sort((a, b) => a.at - b.at), finalFade, warnings: bank.warnings };
}

/** The continuous bed under everything: generated noise, or a looping sound of the category set in the admin. */
function noiseBed(world: World, bank: SoundBank, soundSeconds: number, rng: Rng, placeId = ""): SoundCue[] {
  const bed = world.catalog.settings.noiseBed;
  const playback = { at: 0, duration: soundSeconds, fadeIn: Math.min(BED_FADE_IN, soundSeconds) };
  if (bed.kind !== "sound") {
    return [{ ...playback, layer: "noiseBed", category: null, source: { noise: bed.kind }, loop: true, offset: 0, volume: bed.volume, rate: 1, fadeOut: 0 }];
  }
  const variant = bed.category === undefined ? null : bank.pick(bed.category, placeId);
  if (!variant) return [];
  // The bed plays at the volume of the settings, without variation: it must be forgotten.
  const steady = { ...variant, sound: { ...variant.sound, volume: bed.volume, volumeJitter: 0, rateJitter: 0 } };
  return [{ ...cueFor(steady, "noiseBed", playback, rng), loop: true }];
}

/** Ends a cue with the sound: what would play past the end is cut there. */
function cutAt(cue: SoundCue, end: number): SoundCue[] {
  if (cue.at >= end) return [];
  if (cue.at + cue.duration <= end) return [cue];
  const duration = round(end - cue.at, 2);
  return [
    {
      ...cue,
      duration,
      fadeOut: Math.min(cue.fadeOut, duration),
      ...(cue.drift ? { drift: cue.drift.filter((point) => point.at < end) } : {}),
    },
  ];
}
