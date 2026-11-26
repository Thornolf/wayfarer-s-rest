// The sounds of the test, hard-coded: this is a test, not the engine. The engine of step 5 reads
// the same kind of settings from the catalog. The files other than the five originals are built by
// scripts/make-test-sounds.sh.

/** A Metro asset id, as returned by require(). */
export type SoundModule = number;

export type LoopFormat = "aac" | "alac";

export const BED: SoundModule = require("../../assets/sounds/bed-alac.m4a");

/** The same rain loop in both formats, to compare the loop seam by ear. */
export const RAIN: Record<LoopFormat, SoundModule> = {
  aac: require("../../assets/sounds/rain.m4a"),
  alac: require("../../assets/sounds/rain-alac.m4a"),
};

export const WIND: SoundModule = require("../../assets/sounds/wind-alac.m4a");

export const ACTIONS = {
  walk: [
    require("../../assets/sounds/steps.m4a"),
    require("../../assets/sounds/steps-02.m4a"),
  ] as SoundModule[],
  mine: [
    require("../../assets/sounds/mining.m4a"),
    require("../../assets/sounds/mining-02.m4a"),
  ] as SoundModule[],
};

export const BIRDS: SoundModule[] = [
  require("../../assets/sounds/bird.m4a"),
  require("../../assets/sounds/bird-02.m4a"),
  require("../../assets/sounds/bird-03.m4a"),
];

export const DING: SoundModule = require("../../assets/sounds/ding.m4a");

export const ALL_SOUNDS: SoundModule[] = [
  BED,
  RAIN.aac,
  RAIN.alac,
  WIND,
  ...ACTIONS.walk,
  ...ACTIONS.mine,
  ...BIRDS,
  DING,
];

/** Short sounds only, for the load test. */
export const SHORT_SOUNDS: SoundModule[] = [...ACTIONS.walk, ...ACTIONS.mine, ...BIRDS, DING];
