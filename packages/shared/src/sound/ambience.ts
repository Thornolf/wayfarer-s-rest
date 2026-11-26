// The ambience layer: the sub-ambiences of the place, layered. Each one is there or not according
// to its conditions and its probability, drawn again every few minutes, and drifts slowly in volume.

import type { TimelineEvent } from "../generator/types";
import type { Rng } from "../rng";
import type { Ambience, SubAmbience } from "../schema/sound";
import type { World } from "../world";
import { cueFor, type SoundBank } from "./bank";
import { holds } from "./conditions";
import { round } from "./round";
import type { SoundCue, VolumePoint } from "./types";

/** Seconds between two draws of whether a sub-ambience is there. */
const PRESENCE_SPELL = { min: 180, max: 480 };
/** Seconds a sub-ambience takes to come or go within the same ambience. */
const SLOW_FADE = { min: 8, max: 20 };
/** Seconds of crossfade when the place changes ambience. */
const CROSSFADE = { min: 3, max: 8 };
/** Seconds between two points of a drift. */
const DRIFT_STEP = { min: 20, max: 60 };

type LayerState = { present: boolean; decideAt: number; rng: Rng; cue: SoundCue | null; maxVolume: number };

export function ambienceCues(events: readonly TimelineEvent[], world: World, bank: SoundBank, rng: Rng): SoundCue[] {
  const cues: SoundCue[] = [];
  const fades = rng.fork("fades");
  let current: { ambience: Ambience; layers: Map<string, LayerState> } | null = null;

  const close = (layer: SubAmbience, state: LayerState, at: number, fade: number) => {
    const cue = state.cue;
    if (!cue) return;
    state.cue = null;
    cue.duration = round(at + fade - cue.at, 2);
    cue.fadeOut = Math.min(fade, cue.duration);
    const drift = layer.drift > 0 ? driftOf(cue, layer, state) : [];
    if (drift.length > 1) cue.drift = drift;
  };
  const closeAll = (at: number, fade: number) => {
    if (!current) return;
    for (const layer of current.ambience.layers) close(layer, current.layers.get(layer.id) as LayerState, at, fade);
  };

  for (const event of events) {
    const place = world.byId.places.get(event.place);
    const ambience = place ? world.byId.ambiences.get(place.ambience) : undefined;
    if (!ambience) continue;

    const arriving = current?.ambience.id !== ambience.id;
    const crossfade = round(fades.float(CROSSFADE.min, CROSSFADE.max), 2);
    if (!current || arriving) {
      closeAll(event.at, crossfade);
      const spanRng = rng.fork(`${ambience.id}@${event.index}`);
      const layers = ambience.layers.map((layer): [string, LayerState] => [
        layer.id,
        { present: false, decideAt: event.at, rng: spanRng.fork(layer.id), cue: null, maxVolume: 1 },
      ]);
      current = { ambience, layers: new Map(layers) };
    }

    for (const layer of ambience.layers) {
      const state = current.layers.get(layer.id) as LayerState;
      if (event.at >= state.decideAt) {
        state.present = state.rng.chance(layer.probability);
        state.decideAt = event.at + state.rng.float(PRESENCE_SPELL.min, PRESENCE_SPELL.max);
      }
      const on = state.present && holds(layer.when, event);
      const slowFade = state.rng.float(SLOW_FADE.min, SLOW_FADE.max);
      if (on && !state.cue) {
        const variant = bank.pick(layer.category, event.place);
        if (!variant) continue;
        // The duration is set when the sub-ambience leaves.
        state.cue = cueFor(variant, "ambience", { at: event.at, duration: 0, level: layer.volume, fadeIn: arriving ? crossfade : slowFade }, state.rng);
        state.maxVolume = variant.category.maxVolume;
        cues.push(state.cue);
      } else if (!on && state.cue) {
        close(layer, state, event.at, slowFade);
      }
    }
  }

  const last = events[events.length - 1];
  if (last) closeAll(last.at + last.duration, 0);
  return cues;
}

/** The slow rise and fall of a sub-ambience around its volume, as points along its cue. */
function driftOf(cue: SoundCue, layer: SubAmbience, state: LayerState): VolumePoint[] {
  const points: VolumePoint[] = [{ at: cue.at, volume: cue.volume }];
  const end = cue.at + cue.duration;
  for (let at = cue.at + state.rng.float(DRIFT_STEP.min, DRIFT_STEP.max); at < end; at += state.rng.float(DRIFT_STEP.min, DRIFT_STEP.max)) {
    const volume = Math.min(state.maxVolume, Math.max(0, cue.volume * (1 + layer.drift * state.rng.float(-1, 1))));
    points.push({ at: round(at, 2), volume: round(volume, 3) });
  }
  return points;
}
