// What the phone plays: a list of cues on the night's clock.

import type { NoiseKind, SoundLayer } from "../schema/common";

/** The volume a cue should have reached at a time of the night; the player glides between points. */
export type VolumePoint = { at: number; volume: number };

export type SoundCue = {
  /** Seconds since the start of the night. */
  at: number;
  /** Seconds, fades included. */
  duration: number;
  layer: SoundLayer | "noiseBed";
  /** The category the story asked for; a fallback may have provided the sound. Null for generated noise. */
  category: string | null;
  /** The sound to play, or the noise to generate. */
  source: { sound: string; file: string } | { noise: Exclude<NoiseKind, "sound"> };
  loop: boolean;
  /** Where in the file to start, in seconds: a loop never starts at the same point. */
  offset: number;
  /** From 0 to 1, already within the category's maximum. */
  volume: number;
  /** Playback speed (and pitch): 1 is the file as it is. */
  rate: number;
  /** Seconds. */
  fadeIn: number;
  /** Seconds. */
  fadeOut: number;
  /** For sub-ambiences that come and go: the volume to glide through, instead of `volume`. */
  drift?: VolumePoint[];
};
