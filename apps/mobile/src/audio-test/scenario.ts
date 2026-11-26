import * as Battery from "expo-battery";
import type { InterruptionMode } from "expo-audio";
import { AppState, type AppStateStatus } from "react-native";
import { Rng } from "./rng";
import { ShuffleBag } from "./shuffleBag";
import { ACTIONS, ALL_SOUNDS, BED, BIRDS, DING, RAIN, WIND, type LoopFormat, type SoundModule } from "./sounds";
import { SoundEngine, type SlotName } from "./soundEngine";
import { errorMessage, TestLog } from "./testLog";

// The scenario of the test: what plays when. One 500 ms loop drives everything (never a timer of
// an hour), and every decision compares the clock to a deadline, so a late tick catches up.
// The figures are hard-coded on purpose: the engine of step 5 will read them from the catalog.

const SECOND = 1000;
const MINUTE = 60 * SECOND;

const TICK_MS = 500;
const HEARTBEAT_MS = 10 * SECOND;
/** A tick this late means the JS was held up (R2 and R3 of the plan). */
const STALL_MS = 3 * SECOND;
const FINAL_FADE_MS = 45 * SECOND;
const STOP_FADE_MS = 1500;
/** How many ticks in a row the bed must be paused alone to count as a stop from the lock screen. */
const LOCK_PAUSE_TICKS = 3;
/** After the end, the heartbeat goes on for a while to see when iOS suspends the app. */
const POST_END_WATCH_MS = 5 * MINUTE;

const SCENE_MS: [number, number] = [20 * SECOND, 2 * MINUTE];
const CROSSFADE_MS: [number, number] = [2 * SECOND, 5 * SECOND];
const ONE_SHOT_GAP_MS: [number, number] = [20 * SECOND, 90 * SECOND];
const BURST_CHANCE = 0.25;
const BURST_GAP_MS: [number, number] = [500, 1200];
const FIRST_QUEST_MS = MINUTE;
const QUEST_EVERY_MS = 5 * MINUTE;
const WIND_CHANGE_MS: [number, number] = [20 * SECOND, 60 * SECOND];
const WIND_FADE_MS: [number, number] = [8 * SECOND, 20 * SECOND];

/** The loudest a category may be; the variation never goes above it. */
const VOLUME = { bed: 0.25, rain: 0.6, wind: 0.4, action: 0.55, bird: 0.5, ding: 0.5 };
/** Where the loop-only test starts in the rain loop: 80 % in, six seconds before the seam. */
const LOOP_ONLY_START = 0.8;
const VOLUME_VARIATION = 0.2;
const RATE_VARIATION = 0.08;
const AMBIENCE_RATE_VARIATION = 0.03;

type SceneKind = "walk" | "mine" | "none";
/** The scenes get quieter over the last quarter: more silence, less mining. */
const SCENE_WEIGHTS: Record<SceneKind, number> = { walk: 4, mine: 3, none: 2 };
const LATE_SCENE_WEIGHTS: Record<SceneKind, number> = { walk: 4, mine: 1, none: 5 };

export type RunPhase = "preparing" | "playing" | "fading" | "done";
export type EndReason = "timer" | "user" | "lockScreen" | "error";

export type RunOptions = {
  durationMs: number;
  loopFormat: LoopFormat;
  /**
   * Plays the rain loop alone, untouched, to listen to its seam (T2 of the plan). It starts near
   * the end of the loop, so the first seam comes after a few seconds.
   */
  loopOnly: boolean;
  interruptionMode: InterruptionMode;
  /** Show the lock-screen card (needs an exclusive audio mode). */
  lockScreenCard: boolean;
  /** Already translated: the engine and the scenario hold no user-visible text. */
  lockScreenTitle: string;
  lockScreenSubtitle: string;
  seed?: number;
};

export type Counter = { asked: number; started: number };

export type RunSummary = {
  phase: RunPhase;
  endReason: EndReason | null;
  elapsedMs: number;
  durationMs: number;
  scene: SceneKind;
  /** Scenes with a sound (walk, mine); `sceneChanges` also counts the silent ones. */
  scenes: Counter;
  sceneChanges: number;
  oneShots: Counter;
  questDings: number;
  /** The longest time between two heartbeats while the sound was on (10 s when all is well). */
  maxBeatGapMs: number;
  /** The same, after the end of the sound. */
  postEndMaxBeatGapMs: number;
  stalls: number;
  /** All the players are paused although the test runs (call, Siri, AirPods removed…). */
  paused: boolean;
  interruptions: number;
  problemCount: number;
  lastProblems: string[];
  batteryStart: number | null;
  batteryEnd: number | null;
  /** Where the rain is in its loop, in seconds: the seam is when it goes back to zero. */
  loopTime: number;
  loopDuration: number;
  logUri: string | null;
};

export class AudioTestRun {
  readonly log = new TestLog("run");
  private readonly rng: Rng;
  private readonly engine: SoundEngine;
  private readonly bags: Record<"walk" | "mine" | "bird", ShuffleBag<SoundModule>>;

  private phase: RunPhase = "preparing";
  private endReason: EndReason | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: { remove(): void } | null = null;
  private disposed = false;

  private startedAt = 0;
  private endedAt = 0;
  private lastTickAt = 0;
  private lastBeatAt = 0;
  private beats = 0;
  private maxBeatGapMs = 0;
  private postEndMaxBeatGapMs = 0;
  private stalls = 0;

  private scene: SceneKind = "none";
  private sceneEndsAt = 0;
  private actionSlot: "actionA" | "actionB" | null = null;
  private lastActionSlot: "actionA" | "actionB" = "actionB";
  private scenes: Counter = { asked: 0, started: 0 };
  private sceneChanges = 0;

  private oneShots: Counter = { asked: 0, started: 0 };
  private nextOneShotAt = 0;
  private burst: number[] = [];
  private nextQuestAt = 0;
  private questDings = 0;
  private nextWindAt = 0;

  private paused = false;
  private interruptions = 0;
  private lockPauseTicks = 0;
  private cardShown = false;
  private stopping = false;
  private lastFadeLogAt = 0;

  private batteryStart: number | null = null;
  private batteryEnd: number | null = null;

  constructor(private readonly options: RunOptions) {
    const seed = options.seed ?? (Date.now() & 0xffff);
    this.rng = new Rng(seed);
    this.engine = new SoundEngine(this.log);
    this.bags = {
      walk: new ShuffleBag(ACTIONS.walk, this.rng),
      mine: new ShuffleBag(ACTIONS.mine, this.rng),
      bird: new ShuffleBag(BIRDS, this.rng),
    };
    this.log.log("start", {
      seed,
      durationMs: options.durationMs,
      loopFormat: options.loopFormat,
      loopOnly: options.loopOnly,
      interruptionMode: options.interruptionMode,
      lockScreenCard: options.lockScreenCard,
      appState: AppState.currentState,
    });
  }

  async start(): Promise<void> {
    this.appStateSubscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      this.log.log("appState", { state });
      void this.log.flush();
    });
    try {
      this.batteryStart = await this.readBattery("start");
      await this.engine.prepare(this.options.interruptionMode, ALL_SOUNDS);
    } catch (error) {
      this.log.log("error", { where: "prepare", message: errorMessage(error) });
      this.finish("error");
      return;
    }
    // Stopped or closed while the sounds were loading.
    if (this.disposed || this.phase !== "preparing") return;

    const now = Date.now();
    this.startedAt = now;
    this.lastTickAt = now;
    this.lastBeatAt = now;
    this.phase = "playing";

    if (this.options.loopOnly) {
      this.engine.play("ambienceA", RAIN[this.options.loopFormat], {
        volume: VOLUME.rain,
        fadeInMs: SECOND,
        startFraction: LOOP_ONLY_START,
      });
      this.timer = setInterval(() => this.tick(), TICK_MS);
      void this.log.flush();
      return;
    }

    // The bed first: it is what keeps iOS from suspending the app, from start to end.
    this.engine.play("bed", BED, {
      volume: VOLUME.bed,
      fadeInMs: 2 * SECOND,
      startFraction: this.rng.next(),
    });
    // The ambience: the rain as the base, and the wind as a sub-ambience that comes and goes.
    // Each loop starts at a random point, and their lengths (19, 30 and 23 s) share no factor.
    this.engine.play("ambienceA", RAIN[this.options.loopFormat], {
      volume: this.vary(VOLUME.rain),
      rate: this.varyRate(AMBIENCE_RATE_VARIATION),
      fadeInMs: 3 * SECOND,
      startFraction: this.rng.next(),
    });
    this.engine.play("ambienceB", WIND, {
      volume: VOLUME.wind / 2,
      rate: this.varyRate(AMBIENCE_RATE_VARIATION),
      fadeInMs: 6 * SECOND,
      startFraction: this.rng.next(),
    });
    // iOS only ties the lock-screen card to an app whose audio is exclusive.
    if (this.options.lockScreenCard && this.options.interruptionMode !== "mixWithOthers") {
      this.cardShown = true;
      this.engine.showLockScreenCard(this.options.lockScreenTitle, this.options.lockScreenSubtitle);
    }

    this.sceneEndsAt = now + 3 * SECOND;
    this.nextOneShotAt = now + this.rng.range(10 * SECOND, 30 * SECOND);
    this.nextQuestAt = now + FIRST_QUEST_MS;
    this.nextWindAt = now + this.rng.range(...WIND_CHANGE_MS);

    this.timer = setInterval(() => this.tick(), TICK_MS);
    void this.log.flush();
  }

  /** Stops the sound with a short fade (the Stop button, or pause on the lock screen). */
  stop(reason: EndReason = "user"): void {
    if (this.phase === "done" || this.disposed) return;
    if (this.phase === "preparing") {
      this.finish(reason);
      return;
    }
    // The short fade is already running: starting it again would only postpone the end.
    if (this.stopping) return;
    this.stopping = true;
    this.phase = "fading";
    this.log.log("stopAsked", { reason });
    this.engine.fadeAllOut(STOP_FADE_MS, () => this.finish(reason));
  }

  /** Restarts the players after an interruption that iOS did not resume by itself. */
  resume(): void {
    if (this.phase !== "playing" && this.phase !== "fading") return;
    this.log.log("resumeAsked");
    this.engine.resumeAll();
  }

  /** Frees everything at once, without a fade (the screen is closed). */
  dispose(): void {
    if (this.disposed) return;
    if (this.phase !== "done") this.finish("user");
    this.disposed = true;
    this.clearTimer();
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    void this.log.flush();
  }

  getSummary(): RunSummary {
    const end = this.phase === "done" ? this.endedAt : Date.now();
    const loop = this.engine.position("ambienceA");
    return {
      phase: this.phase,
      endReason: this.endReason,
      elapsedMs: this.startedAt ? Math.max(0, end - this.startedAt) : 0,
      durationMs: this.options.durationMs,
      scene: this.scene,
      scenes: { ...this.scenes },
      sceneChanges: this.sceneChanges,
      oneShots: { ...this.oneShots },
      questDings: this.questDings,
      maxBeatGapMs: this.maxBeatGapMs,
      postEndMaxBeatGapMs: this.postEndMaxBeatGapMs,
      stalls: this.stalls,
      paused: this.paused,
      interruptions: this.interruptions,
      problemCount: this.log.problemCount,
      lastProblems: this.log.lastProblems,
      batteryStart: this.batteryStart,
      batteryEnd: this.batteryEnd,
      loopTime: loop.time,
      loopDuration: loop.duration,
      logUri: this.log.uri,
    };
  }

  private tick(): void {
    const now = Date.now();
    try {
      const tickGap = now - this.lastTickAt;
      this.lastTickAt = now;
      if (tickGap > STALL_MS) {
        this.stalls += 1;
        this.log.log("stall", { gapMs: tickGap, phase: this.phase });
      }
      this.beat(now);

      if (this.phase === "playing" || this.phase === "fading") {
        this.engine.tick(now);
        this.watchPlayers();
      }
      if (this.phase === "playing") {
        if (!this.paused && !this.options.loopOnly) this.advance(now);
        if (now >= this.startedAt + this.options.durationMs - FINAL_FADE_MS) this.beginFinalFade(now);
      } else if (this.phase === "fading") {
        this.logFadeStep(now);
      } else if (this.phase === "done" && now - this.endedAt > POST_END_WATCH_MS) {
        this.log.log("watchEnd");
        void this.log.flush();
        this.clearTimer();
      }
    } catch (error) {
      this.log.log("error", { where: "tick", message: errorMessage(error) });
    }
  }

  /** The heartbeat: every 10 s, how late it is and what each player is doing. */
  private beat(now: number): void {
    const gap = now - this.lastBeatAt;
    if (gap < HEARTBEAT_MS) return;
    this.lastBeatAt = now;
    this.beats += 1;
    if (this.phase === "done") {
      this.postEndMaxBeatGapMs = Math.max(this.postEndMaxBeatGapMs, gap);
    } else {
      this.maxBeatGapMs = Math.max(this.maxBeatGapMs, gap);
    }
    this.log.log("heartbeat", {
      n: this.beats,
      gapMs: gap,
      lateMs: gap - HEARTBEAT_MS,
      phase: this.phase,
      appState: AppState.currentState,
      scene: this.scene,
      players: this.engine.snapshot(),
    });
    void this.log.flush();
  }

  /** Reads what iOS did to the players: an interruption, or pause on the lock screen. */
  private watchPlayers(): void {
    if (!this.engine.hasStarted("bed") || !this.engine.hasStarted("ambienceA")) return;
    const bed = this.engine.isPlaying("bed");
    const rain = this.engine.isPlaying("ambienceA");

    // The lock-screen buttons act on the bed alone. The bed paused while the rain still plays
    // can only be that button: it is our Stop. Several ticks in a row, so that neither iOS
    // resuming the players one by one after an interruption nor a player waiting for a moment at
    // its loop point is mistaken for a stop.
    if (!bed && rain && this.cardShown && !this.stopping) {
      this.lockPauseTicks += 1;
      if (this.lockPauseTicks >= LOCK_PAUSE_TICKS) {
        this.lockPauseTicks = 0;
        this.stop("lockScreen");
        return;
      }
    } else {
      this.lockPauseTicks = 0;
    }

    const paused = !bed && !rain;
    if (paused !== this.paused) {
      this.paused = paused;
      if (paused) this.interruptions += 1;
      this.log.log(paused ? "paused" : "resumed", { players: this.engine.snapshot() });
      void this.log.flush();
    }
  }

  private advance(now: number): void {
    if (now >= this.sceneEndsAt) this.nextScene(now);

    while (this.burst.length > 0 && this.burst[0] <= now) {
      this.burst.shift();
      this.playOneShot(now, "bird");
    }
    if (now >= this.nextOneShotAt) {
      this.nextOneShotAt = now + this.rng.range(...ONE_SHOT_GAP_MS);
      const kind = this.rng.weighted({ bird: 3, ding: 1 });
      this.playOneShot(now, kind);
      // Sometimes three birds in a row, then nothing for a while.
      if (kind === "bird" && this.rng.chance(BURST_CHANCE)) {
        const second = now + this.rng.range(...BURST_GAP_MS);
        this.burst.push(second, second + this.rng.range(...BURST_GAP_MS));
      }
    }

    if (now >= this.nextQuestAt) {
      this.nextQuestAt = now + QUEST_EVERY_MS;
      this.questDings += 1;
      this.playOneShot(now, "quest");
    }

    if (now >= this.nextWindAt) {
      this.nextWindAt = now + this.rng.range(...WIND_CHANGE_MS);
      const volume = this.rng.chance(0.3) ? 0 : this.rng.range(0.25, 1) * VOLUME.wind;
      const fadeMs = this.rng.range(...WIND_FADE_MS);
      this.engine.fadeTo("ambienceB", volume, fadeMs);
      this.log.log("wind", { volume: round2(volume), fadeMs: Math.round(fadeMs) });
    }
  }

  /** Crossfades the action layer to the next scene, on the other player of the pair. */
  private nextScene(now: number): void {
    const elapsed = (now - this.startedAt) / this.options.durationMs;
    const kind = this.rng.weighted(elapsed >= 0.75 ? LATE_SCENE_WEIGHTS : SCENE_WEIGHTS);
    const durationMs = this.rng.range(...SCENE_MS);
    const fadeMs = this.rng.range(...CROSSFADE_MS);
    this.scene = kind;
    this.sceneEndsAt = now + durationMs;
    this.sceneChanges += 1;

    if (this.actionSlot) this.engine.stop(this.actionSlot, fadeMs);
    let slot: "actionA" | "actionB" | null = null;
    let volume = 0;
    let rate = 1;
    if (kind !== "none") {
      slot = this.lastActionSlot === "actionA" ? "actionB" : "actionA";
      this.lastActionSlot = slot;
      volume = this.vary(VOLUME.action);
      rate = this.varyRate(RATE_VARIATION);
      this.scenes.asked += 1;
      this.engine.play(slot, this.bags[kind].next(), {
        volume,
        rate,
        fadeInMs: fadeMs,
        onResult: (ok) => {
          if (ok) this.scenes.started += 1;
        },
      });
    }
    this.actionSlot = slot;
    this.log.log("scene", {
      kind,
      slot,
      durationMs: Math.round(durationMs),
      fadeMs: Math.round(fadeMs),
      volume: round2(volume),
      rate: round2(rate),
    });
  }

  private playOneShot(now: number, kind: "bird" | "ding" | "quest"): void {
    const slot: SlotName | null = this.engine.freeOneShotSlot(now);
    if (!slot) {
      this.log.log("oneShotSkipped", { kind });
      return;
    }
    const sound = kind === "bird" ? this.bags.bird.next() : DING;
    // The quest ding is a transition: always the same, a landmark for the ear during the test.
    const volume = kind === "quest" ? VOLUME.ding : this.vary(kind === "bird" ? VOLUME.bird : VOLUME.ding * 0.6);
    const rate = kind === "quest" ? 1 : this.varyRate(RATE_VARIATION);
    this.oneShots.asked += 1;
    this.engine.play(slot, sound, {
      volume,
      rate,
      onResult: (ok) => {
        if (ok) this.oneShots.started += 1;
      },
    });
    this.log.log("oneShot", { kind, slot, volume: round2(volume), rate: round2(rate) });
  }

  private beginFinalFade(now: number): void {
    this.phase = "fading";
    this.lastFadeLogAt = now;
    this.log.log("fadeStart", { ms: FINAL_FADE_MS });
    this.engine.fadeAllOut(FINAL_FADE_MS, () => this.finish("timer"));
  }

  /** A sample of the final ramp every 5 s, to see in the log whether it ran smoothly. */
  private logFadeStep(now: number): void {
    if (now - this.lastFadeLogAt < 5 * SECOND) return;
    this.lastFadeLogAt = now;
    // About 100 steps between two samples when the timer keeps its 20 steps per second.
    this.log.log("fadeStep", { steps: this.engine.fadeSteps, players: this.engine.snapshot() });
  }

  private finish(reason: EndReason): void {
    if (this.phase === "done") return;
    this.phase = "done";
    this.endReason = reason;
    this.endedAt = Date.now();
    this.paused = false;
    this.engine.releaseAll();
    const { lastProblems: _lastProblems, logUri: _logUri, ...summary } = this.getSummary();
    this.log.log("end", { reason, ...summary });
    void this.log.flush();
    void this.readBattery("end").then((level) => {
      this.batteryEnd = level;
    });
  }

  private async readBattery(when: "start" | "end"): Promise<number | null> {
    try {
      const [level, state, lowPower] = await Promise.all([
        Battery.getBatteryLevelAsync(),
        Battery.getBatteryStateAsync(),
        Battery.isLowPowerModeEnabledAsync(),
      ]);
      this.log.log("battery", { when, level: round2(level), state, lowPower });
      void this.log.flush();
      return level >= 0 ? level : null;
    } catch (error) {
      this.log.log("error", { where: "battery", message: errorMessage(error) });
      return null;
    }
  }

  private clearTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** The volume of this play: ±20 % around a centre placed so the loudest draw is the maximum. */
  private vary(max: number): number {
    return max * (1 - this.rng.range(0, 2 * VOLUME_VARIATION));
  }

  private varyRate(variation: number): number {
    return 1 + this.rng.range(-variation, variation);
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
