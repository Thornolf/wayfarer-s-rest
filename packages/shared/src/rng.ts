// Seeded randomness for the night generator. Written by hand and never to be changed: a night is
// stored as a seed, so the same seed must give the same draws forever.

/** A value and how often it should come out, relative to the others. */
export type WeightedEntry<T> = { value: T; weight: number };

const UINT32 = 4294967296;
/** sfc32 starts poorly mixed: its first outputs are thrown away. */
const WARM_UP_DRAWS = 12;

/** Hashes a string into four 32-bit numbers (bryc's cyrb128), used to seed sfc32. */
export function cyrb128(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** The sfc32 generator: returns a function giving the next number in [0, 1). */
function sfc32(seed: readonly [number, number, number, number]): () => number {
  let [a, b, c, d] = seed;
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / UINT32;
  };
}

/**
 * A stream of seeded random numbers. Each use gets its own stream through `fork(name)`, so adding
 * a draw in one place never shifts the draws made anywhere else.
 */
export class Rng {
  /** The path of names that identifies this stream: the seed, then one name per fork. */
  readonly key: string;
  private readonly draw: () => number;

  constructor(key: string) {
    this.key = key;
    this.draw = sfc32(cyrb128(key));
    for (let i = 0; i < WARM_UP_DRAWS; i++) this.draw();
  }

  /**
   * A separate stream named after its use. It depends on this stream's key and on the name only,
   * not on what has been drawn so far: forking the same name twice gives the same stream.
   */
  fork(name: string): Rng {
    return new Rng(`${this.key}/${name}`);
  }

  /** A number in [min, max); in [0, 1) when called without bounds. */
  float(min = 0, max = 1): number {
    return min + this.draw() * (max - min);
  }

  /** A whole number between min and max, both included. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Rng.int: invalid bounds ${min}..${max}`);
    }
    return min + Math.floor(this.draw() * (max - min + 1));
  }

  /** True with the given probability (0 never, 1 always). One draw is always consumed. */
  chance(probability: number): boolean {
    return this.draw() < probability;
  }

  /** One of the items, each as likely as the others. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("Rng.pick: nothing to pick from");
    return items[this.int(0, items.length - 1)] as T;
  }

  /** One of the values, each as likely as its weight says. Weights of zero or less never come out. */
  weighted<T>(entries: readonly WeightedEntry<T>[]): T {
    const candidates = entries.filter((entry) => entry.weight > 0);
    const total = candidates.reduce((sum, entry) => sum + entry.weight, 0);
    if (candidates.length === 0) throw new RangeError("Rng.weighted: no entry with a positive weight");
    let roll = this.draw() * total;
    for (const entry of candidates) {
      roll -= entry.weight;
      if (roll < 0) return entry.value;
    }
    // Only reached when rounding leaves a crumb of `roll` after the last entry.
    return (candidates[candidates.length - 1] as WeightedEntry<T>).value;
  }

  /** A shuffled copy of the items (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[] {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j] as T, shuffled[i] as T];
    }
    return shuffled;
  }
}

/** The root stream of a night, from its seed ("Aventure #4821" is seed 4821). */
export function createRng(seed: number | string): Rng {
  return new Rng(String(seed));
}

/** What a shuffle bag needs to carry on later where it stopped (kept with the character). */
export type ShuffleBagState<T> = { remaining: T[]; last: T | null };

export type ShuffleBagOptions<T> = {
  /** How many copies of an item go in the bag each time it is filled (default 1, at least 1). */
  copies?: (item: T) => number;
  /** A state saved earlier; items that no longer exist are dropped from it. */
  state?: ShuffleBagState<T>;
};

/**
 * Draws items without putting them back, and refills when empty: every item comes out before any
 * comes out again, and the same item never comes out twice in a row (unless it is the only one).
 * Items are compared with `===`, so they should be ids or other plain values.
 */
export class ShuffleBag<T> {
  private readonly items: readonly T[];
  private readonly rng: Rng;
  private readonly copies: (item: T) => number;
  private remaining: T[];
  private last: T | null;

  constructor(items: readonly T[], rng: Rng, options: ShuffleBagOptions<T> = {}) {
    if (items.length === 0) throw new RangeError("ShuffleBag: no items");
    this.items = [...new Set(items)];
    this.rng = rng;
    this.copies = options.copies ?? (() => 1);
    const known = new Set(this.items);
    this.remaining = (options.state?.remaining ?? []).filter((item) => known.has(item));
    this.last = options.state?.last ?? null;
  }

  /**
   * The next item. With `allowed`, the next item that passes it: the others stay in the bag, which
   * refills when it holds nothing allowed. Throws when no item at all is allowed.
   */
  next(allowed: (item: T) => boolean = () => true): T {
    let candidates = this.candidates(allowed);
    if (candidates.length === 0) {
      this.refill();
      candidates = this.candidates(allowed);
    }
    let index: number;
    if (candidates.length > 0) {
      index = this.rng.pick(candidates);
    } else {
      // Nothing but the item drawn last is allowed: it may then repeat.
      index = this.remaining.findIndex(allowed);
      if (index < 0) throw new RangeError("ShuffleBag: no allowed item");
    }
    const item = this.remaining[index] as T;
    this.remaining.splice(index, 1);
    this.last = item;
    return item;
  }

  get state(): ShuffleBagState<T> {
    return { remaining: [...this.remaining], last: this.last };
  }

  /** The positions in the bag that can come out now: the allowed items, but not the one drawn last. */
  private candidates(allowed: (item: T) => boolean): number[] {
    const positions: number[] = [];
    this.remaining.forEach((item, position) => {
      if (item !== this.last && allowed(item)) positions.push(position);
    });
    return positions;
  }

  private refill(): void {
    this.remaining = this.items.flatMap((item) => {
      const count = Math.max(1, Math.round(this.copies(item)));
      return Array.from({ length: count }, () => item);
    });
  }
}

/** Whole copies for a shuffle bag from free-form weights: the lightest item gets one, the others in proportion. */
export function copiesByWeight<T>(weights: ReadonlyMap<T, number>, maxCopies = 8): (item: T) => number {
  const positive = [...weights.values()].filter((weight) => weight > 0);
  const lightest = positive.length > 0 ? Math.min(...positive) : 1;
  return (item) => Math.min(maxCopies, Math.max(1, Math.round((weights.get(item) ?? lightest) / lightest)));
}
