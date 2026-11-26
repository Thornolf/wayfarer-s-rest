// The sounds of the catalog, by category. Each category has a shuffle bag, so that a variant never
// plays twice in a row; an empty category borrows from its fallback and the hole is noted.

import type { NightWarning } from "../generator/types";
import { ShuffleBag, copiesByWeight, type Rng } from "../rng";
import type { Sound, SoundCategory } from "../schema/sound";
import type { World } from "../world";
import { round } from "./round";
import type { SoundCue } from "./types";

/** A sound picked for a category, with the category whose rules apply (the one asked for). */
export type Variant = { sound: Sound; category: SoundCategory };

export class SoundBank {
  readonly warnings: NightWarning[] = [];
  private readonly world: World;
  private readonly rng: Rng;
  private readonly sounds = new Map<string, Sound[]>();
  private readonly bags = new Map<string, ShuffleBag<string>>();
  private readonly warned = new Set<string>();

  constructor(world: World, rng: Rng) {
    this.world = world;
    this.rng = rng;
    for (const sound of world.active.sounds) {
      if (!sound.active || sound.weight <= 0) continue;
      this.sounds.set(sound.category, [...(this.sounds.get(sound.category) ?? []), sound]);
    }
  }

  /**
   * A sound of the category that may play at the place, never the one this category played last.
   * Follows the fallbacks when the category has nothing, and gives null at the end of the chain.
   */
  pick(categoryId: string, placeId: string): Variant | null {
    const category = this.world.byId.soundCategories.get(categoryId);
    if (!category) return null;
    const allowedAt = (sound: Sound) => !sound.places?.length || sound.places.includes(placeId);

    const seen = new Set<string>();
    for (let source: SoundCategory | undefined = category; source && !seen.has(source.id); ) {
      seen.add(source.id);
      const sounds = this.sounds.get(source.id) ?? [];
      if (sounds.some(allowedAt)) {
        if (source.id !== category.id) this.warn(category, source.id);
        const allowed = new Set(sounds.filter(allowedAt).map(({ id }) => id));
        const id = this.bagOf(source.id, sounds).next((candidate) => allowed.has(candidate));
        return { sound: sounds.find((sound) => sound.id === id) as Sound, category };
      }
      source = source.fallback === undefined ? undefined : this.world.byId.soundCategories.get(source.fallback);
    }
    this.warn(category);
    return null;
  }

  private bagOf(categoryId: string, sounds: Sound[]): ShuffleBag<string> {
    let bag = this.bags.get(categoryId);
    if (!bag) {
      const weights = new Map(sounds.map((sound) => [sound.id, sound.weight]));
      bag = new ShuffleBag([...weights.keys()], this.rng.fork(`bag/${categoryId}`), { copies: copiesByWeight(weights) });
      this.bags.set(categoryId, bag);
    }
    return bag;
  }

  /** Notes once that a category has no sound of its own (a sound limited to other places is not a hole). */
  private warn(category: SoundCategory, fallback?: string): void {
    if (this.warned.has(category.id) || (this.sounds.get(category.id) ?? []).length > 0) return;
    this.warned.add(category.id);
    this.warnings.push({ kind: "emptyCategory", category: category.id, ...(fallback === undefined ? {} : { fallback }) });
  }
}

export type Playback = {
  at: number;
  /** Seconds; left out, a sound that does not loop plays once through. */
  duration?: number;
  /** Multiplies the sound's own volume: the level of a sub-ambience, for instance. */
  level?: number;
  fadeIn?: number;
  fadeOut?: number;
};

/**
 * A cue for a variant: the volume and the speed are drawn within the ranges of the sound, or of
 * its category, and a loop starts at a point of its own.
 */
export function cueFor(variant: Variant, layer: SoundCue["layer"], playback: Playback, rng: Rng): SoundCue {
  const { sound, category } = variant;
  const volumeJitter = sound.volumeJitter ?? category.volumeJitter;
  const rateJitter = sound.rateJitter ?? category.rateJitter;
  const volume = sound.volume * (playback.level ?? 1) * (1 + rng.float(-volumeJitter, volumeJitter));
  const rate = Math.max(0.5, 1 + rng.float(-rateJitter, rateJitter));
  const offset = sound.loop ? rng.float(0, sound.duration) : 0;
  return {
    at: round(playback.at, 2),
    duration: round(playback.duration ?? sound.duration / rate, 2),
    layer,
    category: category.id,
    source: { sound: sound.id, file: sound.file },
    loop: sound.loop,
    offset: round(offset, 2),
    volume: round(Math.min(category.maxVolume, Math.max(0, volume)), 3),
    rate: round(rate, 3),
    fadeIn: round(playback.fadeIn ?? 0, 2),
    fadeOut: round(playback.fadeOut ?? 0, 2),
  };
}
