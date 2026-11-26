import { Asset } from "expo-asset";
import {
  createAudioPlayer,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  type AudioPlayer,
  type AudioStatus,
  type InterruptionMode,
} from "expo-audio";
import type { SoundModule } from "./sounds";
import { errorMessage, type TestLog } from "./testLog";

// The reusable heart of the test: a fixed pool of players whose sources change with replace(),
// fades driven by the clock, and a check that every sound asked for really started.
//
// What the native code of expo-audio 58 imposes (see docs/plans/etape-1-test-audio.md):
// - iOS keeps the app alive only while a sound plays, so the bed never stops;
// - every player is created with keepAudioSessionActive, so a sound that ends or pauses never
//   takes the audio session down with it;
// - the pitch algorithm belongs to the current item: the rate is set after replace(), with
//   shouldCorrectPitch off, so the pitch follows the speed;
// - there is no native fade: volume ramps are done here, in JS.

export const SLOT_NAMES = [
  "bed",
  "ambienceA",
  "ambienceB",
  "actionA",
  "actionB",
  "oneShot1",
  "oneShot2",
  "oneShot3",
] as const;
export type SlotName = (typeof SLOT_NAMES)[number];

const LOOPING: Record<SlotName, boolean> = {
  bed: true,
  ambienceA: true,
  ambienceB: true,
  actionA: true,
  actionB: true,
  oneShot1: false,
  oneShot2: false,
  oneShot3: false,
};

const FADE_STEP_MS = 50; // 20 steps per second
const START_CHECK_MS = 2500;
const ONE_SHOT_TIMEOUT_MS = 20_000;

type Slot = {
  name: SlotName;
  player: AudioPlayer;
  subscription: { remove(): void };
  /** Should be sounding now (a loop that plays, or a one-shot not finished yet). */
  active: boolean;
  /** Goes up at every play(): a check or a seek asked for an older sound is dropped. */
  serial: number;
  /** A status update showed this sound playing (or finished) since the last play(). */
  sawPlaying: boolean;
  startedAt: number;
  lastError: string | null;
};

type Fade = {
  from: number;
  to: number;
  startedAt: number;
  ms: number;
  then?: () => void;
};

type StartCheck = { slot: Slot; at: number; onResult?: (ok: boolean) => void };
type PendingSeek = { slot: Slot; serial: number; fraction: number };

export type PlayOptions = {
  volume: number;
  rate?: number;
  /** Start silent and ramp up to the volume. */
  fadeInMs?: number;
  /** Where to start in a loop, as a fraction of its length (0 to 1). */
  startFraction?: number;
  /** Called once, a moment later, with whether the sound really started. */
  onResult?: (ok: boolean) => void;
};

export type SlotSnapshot = { n: SlotName; p: boolean; t: number; v: number };

export class SoundEngine {
  private slots = new Map<SlotName, Slot>();
  private fades = new Map<Slot, Fade>();
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private checks: StartCheck[] = [];
  private seeks: PendingSeek[] = [];
  private released = false;
  /** How many times the fade timer ran: logged during the final fade, to see a ramp that stutters. */
  fadeSteps = 0;

  constructor(private readonly log: TestLog) {}

  /** Downloads the sounds to the phone, sets the audio mode and creates the pool. */
  async prepare(interruptionMode: InterruptionMode, sounds: SoundModule[]): Promise<void> {
    // In Expo Go the assets come from Metro. Once they are on the phone, replace() finds the local
    // copy by itself, and the test no longer needs the PC.
    try {
      await Asset.loadAsync(sounds);
    } catch (error) {
      this.log.log("error", { where: "assets", message: errorMessage(error) });
    }
    // A previous setIsAudioActiveAsync(false) would make every play() a silent no-op.
    await setIsAudioActiveAsync(true);
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode,
    });
    if (this.released) return;
    for (const name of SLOT_NAMES) this.slots.set(name, this.createSlot(name));
  }

  private createSlot(name: SlotName): Slot {
    const player = createAudioPlayer(null, { updateInterval: 1000, keepAudioSessionActive: true });
    player.loop = LOOPING[name];
    player.volume = 0;
    const slot: Slot = {
      name,
      player,
      subscription: { remove() {} },
      active: false,
      serial: 0,
      sawPlaying: false,
      startedAt: 0,
      lastError: null,
    };
    slot.subscription = player.addListener("playbackStatusUpdate", (status: AudioStatus) =>
      this.onStatus(slot, status),
    );
    return slot;
  }

  private onStatus(slot: Slot, status: AudioStatus): void {
    if (status.playing || status.didJustFinish) slot.sawPlaying = true;
    if (status.didJustFinish && !LOOPING[slot.name]) slot.active = false;
    // The same error comes back at every update: log it once.
    if (status.error && status.error !== slot.lastError) {
      slot.lastError = status.error;
      this.log.log("statusError", { slot: slot.name, message: status.error });
    }
  }

  /** Puts a new sound in a slot and plays it. */
  play(name: SlotName, sound: SoundModule, options: PlayOptions): void {
    const slot = this.slots.get(name);
    if (!slot || this.released) return;
    const { volume, rate = 1, fadeInMs = 0, startFraction, onResult } = options;
    const now = Date.now();
    // The sound this one replaces may still wait for its start check (a short one-shot whose slot
    // is reused at once): settle it now, with what was seen of it.
    const replaced = this.checks.filter((check) => check.slot === slot);
    if (replaced.length > 0) {
      this.checks = this.checks.filter((check) => check.slot !== slot);
      for (const check of replaced) this.settleCheck(check);
    }
    slot.serial += 1;
    slot.active = true;
    slot.sawPlaying = false;
    slot.startedAt = now;
    slot.lastError = null;
    this.cancelFade(slot);
    try {
      const player = slot.player;
      player.volume = fadeInMs > 0 ? 0 : clamp01(volume);
      player.replace(sound);
      player.shouldCorrectPitch = false;
      player.setPlaybackRate(rate);
      player.play();
    } catch (error) {
      this.log.log("error", { where: "play", slot: name, message: errorMessage(error) });
    }
    if (fadeInMs > 0) this.fadeTo(name, volume, fadeInMs);
    if (startFraction !== undefined) {
      this.seeks.push({ slot, serial: slot.serial, fraction: startFraction });
    }
    this.checks.push({ slot, at: now + START_CHECK_MS, onResult });
  }

  /** The first one-shot slot that is free, or null when the three are busy. */
  freeOneShotSlot(now: number): SlotName | null {
    for (const slot of this.slots.values()) {
      if (LOOPING[slot.name]) continue;
      // A one-shot whose end was never reported must not hold its slot for ever.
      if (!slot.active || now - slot.startedAt > ONE_SHOT_TIMEOUT_MS) return slot.name;
    }
    return null;
  }

  /**
   * Ramps the volume of a slot. The value comes from the clock, not from a count of steps, so the
   * ramp ends on time even when iOS slows the timers down. Fade-outs follow a squared curve, which
   * sounds more even than a straight line.
   */
  fadeTo(name: SlotName, volume: number, ms: number, then?: () => void): void {
    const slot = this.slots.get(name);
    if (!slot || this.released) return;
    this.cancelFade(slot);
    const from = this.readVolume(slot);
    const to = clamp01(volume);
    if (ms <= 0 || from === to) {
      this.writeVolume(slot, to);
      then?.();
      return;
    }
    this.fades.set(slot, { from, to, startedAt: Date.now(), ms, then });
    if (!this.fadeTimer) this.fadeTimer = setInterval(() => this.stepFades(), FADE_STEP_MS);
  }

  /** Fades a slot out, then pauses it. */
  stop(name: SlotName, fadeMs: number): void {
    const slot = this.slots.get(name);
    if (!slot || this.released) return;
    const serial = slot.serial;
    slot.active = false;
    this.fadeTo(name, 0, fadeMs, () => {
      // A new sound may have taken the slot while it faded.
      if (slot.serial !== serial || this.released) return;
      try {
        slot.player.pause();
      } catch (error) {
        this.log.log("error", { where: "pause", slot: name, message: errorMessage(error) });
      }
    });
  }

  /** Fades everything out together; `then` runs once, when the last ramp is over. */
  fadeAllOut(ms: number, then: () => void): void {
    let waiting = this.slots.size;
    if (waiting === 0 || this.released) {
      then();
      return;
    }
    for (const name of this.slots.keys()) {
      this.fadeTo(name, 0, ms, () => {
        waiting -= 1;
        if (waiting === 0) then();
      });
    }
  }

  private stepFades(): void {
    const now = Date.now();
    this.fadeSteps += 1;
    const done: Fade[] = [];
    for (const [slot, fade] of this.fades) {
      const progress = Math.min(1, (now - fade.startedAt) / fade.ms);
      const shaped = fade.to < fade.from ? 1 - (1 - progress) ** 2 : progress;
      this.writeVolume(slot, fade.from + (fade.to - fade.from) * shaped);
      if (progress >= 1) {
        this.fades.delete(slot);
        done.push(fade);
      }
    }
    this.stopFadeTimerIfIdle();
    // Callbacks last: they may start new fades or release the engine.
    for (const fade of done) fade.then?.();
  }

  private cancelFade(slot: Slot): void {
    this.fades.delete(slot);
    this.stopFadeTimerIfIdle();
  }

  private stopFadeTimerIfIdle(): void {
    if (this.fades.size === 0 && this.fadeTimer) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  /** To call about once a second: runs the delayed start checks and the pending seeks. */
  tick(now: number): void {
    if (this.released) return;

    if (this.seeks.length > 0) {
      const waiting: PendingSeek[] = [];
      for (const seek of this.seeks) {
        if (seek.slot.serial !== seek.serial) continue;
        const player = seek.slot.player;
        if (player.isLoaded && player.duration > 0) {
          player.seekTo(seek.fraction * player.duration).catch((error: unknown) => {
            this.log.log("error", { where: "seek", slot: seek.slot.name, message: errorMessage(error) });
          });
        } else {
          waiting.push(seek);
        }
      }
      this.seeks = waiting;
    }

    if (this.checks.length > 0) {
      const due = this.checks.filter((check) => now >= check.at);
      if (due.length > 0) {
        // The list is updated first: a callback may start a new sound.
        this.checks = this.checks.filter((check) => now < check.at);
        for (const check of due) this.settleCheck(check);
      }
    }
  }

  /** Says whether a sound really started, and logs what the player reports when it did not. */
  private settleCheck(check: StartCheck): void {
    const slot = check.slot;
    let ok = slot.sawPlaying;
    try {
      ok = ok || slot.player.playing;
      if (!ok) {
        const status = slot.player.currentStatus;
        this.log.log("playFailed", {
          slot: slot.name,
          playbackState: status.playbackState,
          timeControlStatus: status.timeControlStatus,
          waiting: status.reasonForWaitingToPlay,
          isLoaded: status.isLoaded,
          error: status.error ?? slot.lastError,
        });
      }
    } catch (error) {
      this.log.log("error", { where: "check", slot: slot.name, message: errorMessage(error) });
    }
    check.onResult?.(ok);
  }

  isPlaying(name: SlotName): boolean {
    const slot = this.slots.get(name);
    if (!slot || this.released) return false;
    return slot.player.playing;
  }

  /** Where a slot is in its sound, in seconds (0 and 0 while it loads). */
  position(name: SlotName): { time: number; duration: number } {
    const slot = this.slots.get(name);
    if (!slot || this.released) return { time: 0, duration: 0 };
    return { time: slot.player.currentTime, duration: slot.player.duration };
  }

  /** True once the sound of this slot has been seen playing. */
  hasStarted(name: SlotName): boolean {
    return this.slots.get(name)?.sawPlaying ?? false;
  }

  /** Restarts every loop that should be sounding (after an interruption iOS did not resume). */
  resumeAll(): void {
    if (this.released) return;
    for (const slot of this.slots.values()) {
      if (!slot.active || !LOOPING[slot.name]) continue;
      try {
        slot.player.play();
      } catch (error) {
        this.log.log("error", { where: "resume", slot: slot.name, message: errorMessage(error) });
      }
    }
  }

  /** Shows the lock-screen card on the bed, the one player that plays from start to end. */
  showLockScreenCard(title: string, artist: string): void {
    const slot = this.slots.get("bed");
    if (!slot || this.released) return;
    try {
      slot.player.setActiveForLockScreen(
        true,
        { title, artist },
        { showSeekForward: false, showSeekBackward: false, isLiveStream: true },
      );
    } catch (error) {
      this.log.log("error", { where: "lockScreen", message: errorMessage(error) });
    }
  }

  snapshot(): SlotSnapshot[] {
    if (this.released) return [];
    return [...this.slots.values()].map((slot) => ({
      n: slot.name,
      p: slot.player.playing,
      t: round(slot.player.currentTime, 10),
      v: round(this.readVolume(slot), 100),
    }));
  }

  /** Stops the timers and frees every player. Safe to call twice. */
  releaseAll(): void {
    if (this.released) return;
    this.released = true;
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    this.fadeTimer = null;
    this.fades.clear();
    this.checks = [];
    this.seeks = [];
    for (const slot of this.slots.values()) {
      try {
        slot.subscription.remove();
        if (slot.name === "bed") slot.player.clearLockScreenControls();
        slot.player.pause();
        slot.player.remove();
      } catch (error) {
        this.log.log("error", { where: "release", slot: slot.name, message: errorMessage(error) });
      }
    }
    this.slots.clear();
  }

  private readVolume(slot: Slot): number {
    try {
      return slot.player.volume;
    } catch {
      return 0;
    }
  }

  private writeVolume(slot: Slot, volume: number): void {
    try {
      slot.player.volume = clamp01(volume);
    } catch {
      // The player is gone: the release is already logged.
    }
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number, factor: number): number {
  return Math.round(value * factor) / factor;
}
