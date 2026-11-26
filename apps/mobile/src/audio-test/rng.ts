// A seeded random generator (mulberry32): the same seed gives the same test.
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** A float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** An integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** Picks a key according to its weight; keys with a weight of zero never come out. */
  weighted<K extends string>(weights: Record<K, number>): K {
    const keys = Object.keys(weights) as K[];
    const total = keys.reduce((sum, key) => sum + weights[key], 0);
    let roll = this.next() * total;
    for (const key of keys) {
      roll -= weights[key];
      if (roll < 0) return key;
    }
    return keys[keys.length - 1];
  }
}
