import assert from "node:assert/strict";
import { test } from "node:test";
import { Rng, ShuffleBag, createRng, cyrb128 } from "./rng";

const draws = (rng: Rng, count: number) => Array.from({ length: count }, () => rng.float());

test("the generator is frozen: a seed gives the same numbers forever", () => {
  // If this fails, every stored night would replay differently: do not update these values.
  assert.deepEqual(cyrb128("4821"), [1574971004, 151984936, 4252707471, 3424401949]);
  const rng = createRng(4821);
  assert.deepEqual(Array.from({ length: 5 }, () => rng.int(0, 999)), [976, 425, 491, 645, 935]);
  assert.deepEqual(draws(createRng(4821).fork("weather"), 3), [0.3624636549502611, 0.5859109372831881, 0.9834371313918382]);
});

test("same seed, same draws; different seeds, different draws", () => {
  assert.deepEqual(draws(createRng(4821), 50), draws(createRng(4821), 50));
  assert.deepEqual(draws(createRng("4821"), 50), draws(createRng(4821), 50));
  assert.notDeepEqual(draws(createRng(4821), 50), draws(createRng(4822), 50));
});

test("a fork does not depend on what its parent has drawn", () => {
  const untouched = createRng(7);
  const used = createRng(7);
  draws(used, 100);
  assert.deepEqual(draws(used.fork("loot"), 20), draws(untouched.fork("loot"), 20));
});

test("forks are separate streams, named by their path", () => {
  const root = createRng(7);
  assert.equal(root.fork("story").fork("quest").key, "7/story/quest");
  assert.notDeepEqual(draws(root.fork("story"), 20), draws(root.fork("loot"), 20));
  assert.notDeepEqual(draws(root.fork("story"), 20), draws(root, 20));
  assert.notDeepEqual(draws(root.fork("a").fork("b"), 20), draws(root.fork("b").fork("a"), 20));
});

test("float stays in [0, 1) and is spread evenly", () => {
  const values = draws(createRng("spread"), 20000);
  assert.ok(values.every((value) => value >= 0 && value < 1));
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(Math.abs(mean - 0.5) < 0.01, `mean ${mean}`);
  const scaled = createRng("scaled");
  for (let i = 0; i < 1000; i++) {
    const value = scaled.float(30, 120);
    assert.ok(value >= 30 && value < 120);
  }
});

test("int covers both bounds and nothing else", () => {
  const rng = createRng("int");
  const seen = new Set<number>();
  for (let i = 0; i < 2000; i++) seen.add(rng.int(3, 6));
  assert.deepEqual([...seen].sort(), [3, 4, 5, 6]);
  assert.equal(rng.int(5, 5), 5);
  assert.throws(() => rng.int(6, 3), RangeError);
  assert.throws(() => rng.int(0.5, 3), RangeError);
});

test("chance follows its probability", () => {
  const rng = createRng("chance");
  const hits = Array.from({ length: 20000 }, () => rng.chance(0.25)).filter(Boolean).length;
  assert.ok(Math.abs(hits / 20000 - 0.25) < 0.015, `rate ${hits / 20000}`);
  assert.equal(rng.chance(0), false);
  assert.equal(rng.chance(1), true);
});

test("pick returns items of the list and refuses an empty one", () => {
  const rng = createRng("pick");
  const items = ["a", "b", "c"];
  const seen = new Set(Array.from({ length: 200 }, () => rng.pick(items)));
  assert.deepEqual([...seen].sort(), items);
  assert.throws(() => rng.pick([]), RangeError);
});

test("weighted follows the weights and ignores those of zero or less", () => {
  const rng = createRng("weighted");
  const entries = [
    { value: "common", weight: 90 },
    { value: "rare", weight: 10 },
    { value: "never", weight: 0 },
    { value: "negative", weight: -5 },
  ];
  const counts: Record<string, number> = {};
  for (let i = 0; i < 20000; i++) {
    const value = rng.weighted(entries);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  assert.deepEqual(Object.keys(counts).sort(), ["common", "rare"]);
  assert.ok(Math.abs((counts.rare ?? 0) / 20000 - 0.1) < 0.01, `rare rate ${(counts.rare ?? 0) / 20000}`);
  assert.throws(() => rng.weighted([{ value: "x", weight: 0 }]), RangeError);
});

test("shuffle keeps every item and leaves its input alone", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8];
  const shuffled = createRng("shuffle").shuffle(items);
  assert.deepEqual(items, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...shuffled].sort(), items);
  assert.deepEqual(shuffled, createRng("shuffle").shuffle(items));
});

test("a shuffle bag gives every item once before any comes back", () => {
  const items = ["a", "b", "c", "d", "e"];
  const bag = new ShuffleBag(items, createRng("bag"));
  const firstRound = Array.from({ length: items.length }, () => bag.next());
  assert.deepEqual([...firstRound].sort(), items);
});

test("a shuffle bag never gives the same item twice in a row", () => {
  for (const size of [2, 3, 5]) {
    const items = Array.from({ length: size }, (_, i) => `sound-${i}`);
    const bag = new ShuffleBag(items, createRng(`no-repeat-${size}`), { copies: (item) => (item === "sound-0" ? 3 : 1) });
    let previous: string | null = null;
    for (let i = 0; i < 500; i++) {
      const item = bag.next();
      assert.notEqual(item, previous, `repeat of ${item} at draw ${i} with ${size} items`);
      previous = item;
    }
  }
});

test("a shuffle bag with copies gives heavier items more often", () => {
  const bag = new ShuffleBag(["often", "seldom", "other"], createRng("copies"), { copies: (item) => (item === "often" ? 3 : 1) });
  const counts: Record<string, number> = {};
  for (let i = 0; i < 3000; i++) {
    const item = bag.next();
    counts[item] = (counts[item] ?? 0) + 1;
  }
  assert.ok((counts.often ?? 0) > 1.5 * (counts.seldom ?? 0), JSON.stringify(counts));
});

test("a shuffle bag with a single item repeats it", () => {
  const bag = new ShuffleBag(["only"], createRng("single"));
  assert.deepEqual([bag.next(), bag.next(), bag.next()], ["only", "only", "only"]);
  assert.throws(() => new ShuffleBag([], createRng("empty")), RangeError);
});

test("a shuffle bag carries on from a saved state", () => {
  const items = ["a", "b", "c", "d"];
  const first = new ShuffleBag(items, createRng("night-1"));
  const served = [first.next(), first.next()];
  const saved = JSON.parse(JSON.stringify(first.state));

  const second = new ShuffleBag(items, createRng("night-2"), { state: saved });
  const next = [second.next(), second.next()];
  assert.deepEqual([...served, ...next].sort(), items, "the second night serves what the first left");

  const shrunk = new ShuffleBag(["a", "z"], createRng("night-3"), { state: { remaining: ["gone", "a"], last: "gone" } });
  assert.equal(shrunk.next(), "a", "items that left the catalog are dropped from the state");
});

test("two shuffle bags on the same stream give the same order", () => {
  const order = (seed: string) => {
    const bag = new ShuffleBag(["a", "b", "c", "d"], createRng(seed));
    return Array.from({ length: 12 }, () => bag.next());
  };
  assert.deepEqual(order("x"), order("x"));
});
