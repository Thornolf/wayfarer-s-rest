// Slow weather: a state lasts at least the minimum set in the admin, then stays or moves to a
// neighbour (clear, cloudy, rain, storm), never further in one go.

import type { Rng } from "../rng";
import { WEATHER_KINDS, type WeatherKind } from "../schema/common";

const ORDER = Object.keys(WEATHER_KINDS) as WeatherKind[];
/** A state lasts between one and this many times the minimum. */
const LONGEST_SPELL = 2.5;
const SHORTEST_SPELL_SECONDS = 60;

export class WeatherTrack {
  private readonly weights: Readonly<Record<WeatherKind, number>>;
  private readonly rng: Rng;
  private readonly minSeconds: number;
  private kind: WeatherKind;
  private changesAt: number;

  constructor(weights: Readonly<Record<WeatherKind, number>>, rng: Rng, minSeconds: number, initial?: WeatherKind) {
    this.weights = weights;
    this.rng = rng;
    this.minSeconds = minSeconds;
    this.kind = initial ?? this.draw(ORDER, "clear");
    this.changesAt = this.spell();
  }

  /** The weather at a time of the night. Times must be asked in order. */
  at(seconds: number): WeatherKind {
    while (this.changesAt <= seconds) {
      const position = ORDER.indexOf(this.kind);
      this.kind = this.draw(ORDER.slice(Math.max(0, position - 1), position + 2), this.kind);
      this.changesAt += this.spell();
    }
    return this.kind;
  }

  private draw(kinds: WeatherKind[], fallback: WeatherKind): WeatherKind {
    const entries = kinds.map((kind) => ({ value: kind, weight: this.weights[kind] }));
    return entries.some(({ weight }) => weight > 0) ? this.rng.weighted(entries) : fallback;
  }

  private spell(): number {
    return Math.max(SHORTEST_SPELL_SECONDS, this.minSeconds) * this.rng.float(1, LONGEST_SPELL);
  }
}
