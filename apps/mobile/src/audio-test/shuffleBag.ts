import type { Rng } from "./rng";

// Draws without replacement: every item comes out once before any comes out again, and the first
// item of a new bag is never the last item of the previous one.
export class ShuffleBag<T> {
  private bag: T[] = [];
  private last: T | undefined;

  constructor(
    private readonly items: readonly T[],
    private readonly rng: Rng,
  ) {
    if (items.length === 0) throw new Error("ShuffleBag needs at least one item");
  }

  next(): T {
    if (this.bag.length === 0) this.refill();
    const item = this.bag.pop() as T;
    this.last = item;
    return item;
  }

  private refill(): void {
    const bag = [...this.items];
    // Fisher-Yates.
    for (let i = bag.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    // The next draw is the end of the array: move a repeat of the last item out of the way.
    const top = bag.length - 1;
    if (bag.length > 1 && bag[top] === this.last) {
      const other = this.rng.int(top);
      [bag[top], bag[other]] = [bag[other], bag[top]];
    }
    this.bag = bag;
  }
}
