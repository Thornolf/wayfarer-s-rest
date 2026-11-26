import { Asset } from "expo-asset";
import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync, type AudioPlayer } from "expo-audio";
import { Rng } from "./rng";
import { SHORT_SOUNDS } from "./sounds";
import { errorMessage, TestLog } from "./testLog";

// The load test (T12 of the plan): ten players at once, each one given a new sound every second.
// It looks for crackles, a crash, or a JS that cannot keep up; it runs in the foreground.

const PLAYERS = 10;
const TICK_MS = 1000;
const DURATION_MS = 60_000;
const VOLUME = 0.15;

export type LoadSummary = {
  running: boolean;
  elapsedMs: number;
  durationMs: number;
  replaces: number;
  /** How many of the ten players were playing at the last tick. */
  playing: number;
  /** The longest time between two ticks (1 s when all is well). */
  maxTickGapMs: number;
  problemCount: number;
  lastProblems: string[];
  logUri: string | null;
};

export class LoadTestRun {
  readonly log = new TestLog("load");
  private readonly rng = new Rng(Date.now() & 0xffff);
  private players: AudioPlayer[] = [];
  private subscriptions: { remove(): void }[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = true;
  private startedAt = 0;
  private endedAt = 0;
  private lastTickAt = 0;
  private ticks = 0;
  private replaces = 0;
  private playing = 0;
  private maxTickGapMs = 0;

  async start(): Promise<void> {
    this.log.log("loadStart", { players: PLAYERS, durationMs: DURATION_MS });
    try {
      await Asset.loadAsync(SHORT_SOUNDS);
      await setIsAudioActiveAsync(true);
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: "doNotMix",
      });
    } catch (error) {
      this.log.log("error", { where: "prepare", message: errorMessage(error) });
    }
    if (!this.running) return;

    for (let i = 0; i < PLAYERS; i++) {
      const player = createAudioPlayer(null, { updateInterval: 1000, keepAudioSessionActive: true });
      player.volume = VOLUME;
      let lastError: string | null = null;
      this.subscriptions.push(
        player.addListener("playbackStatusUpdate", (status) => {
          if (status.error && status.error !== lastError) {
            lastError = status.error;
            this.log.log("statusError", { slot: `load${i}`, message: status.error });
          }
        }),
      );
      this.players.push(player);
    }
    this.startedAt = Date.now();
    this.lastTickAt = this.startedAt;
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.endedAt = Date.now();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const subscription of this.subscriptions) subscription.remove();
    this.subscriptions = [];
    for (const player of this.players) {
      try {
        player.pause();
        player.remove();
      } catch (error) {
        this.log.log("error", { where: "release", message: errorMessage(error) });
      }
    }
    this.players = [];
    const { lastProblems: _lastProblems, logUri: _logUri, ...summary } = this.getSummary();
    this.log.log("loadEnd", summary);
    void this.log.flush();
  }

  getSummary(): LoadSummary {
    const end = this.running ? Date.now() : this.endedAt;
    return {
      running: this.running,
      elapsedMs: this.startedAt ? Math.max(0, end - this.startedAt) : 0,
      durationMs: DURATION_MS,
      replaces: this.replaces,
      playing: this.playing,
      maxTickGapMs: this.maxTickGapMs,
      problemCount: this.log.problemCount,
      lastProblems: this.log.lastProblems,
      logUri: this.log.uri,
    };
  }

  private tick(): void {
    const now = Date.now();
    if (now - this.startedAt >= DURATION_MS) {
      this.stop();
      return;
    }
    const gap = now - this.lastTickAt;
    this.lastTickAt = now;
    this.maxTickGapMs = Math.max(this.maxTickGapMs, gap);
    this.ticks += 1;

    // Counted before the replace: what the previous second really played.
    let playing = 0;
    for (const player of this.players) {
      try {
        if (player.playing) playing += 1;
        player.replace(SHORT_SOUNDS[this.rng.int(SHORT_SOUNDS.length)]);
        player.shouldCorrectPitch = false;
        player.setPlaybackRate(this.rng.range(0.92, 1.08));
        player.play();
        this.replaces += 1;
      } catch (error) {
        this.log.log("error", { where: "replace", message: errorMessage(error) });
      }
    }
    this.playing = playing;

    if (this.ticks % 5 === 0) {
      this.log.log("loadTick", { n: this.ticks, gapMs: gap, playing, tookMs: Date.now() - now });
      void this.log.flush();
    }
  }
}
