// Slows down password guessing: after five wrong passwords within a minute, every attempt is
// refused until the oldest one is a minute old. There is one admin, so there is one counter.

import type { Clock } from "../clock";

const MAX_FAILURES = 5;
const WINDOW_MS = 60_000;

export class LoginLimiter {
  private failures: number[] = [];

  constructor(private readonly now: Clock) {}

  blocked(): boolean {
    const oldest = this.now().getTime() - WINDOW_MS;
    this.failures = this.failures.filter((at) => at > oldest);
    return this.failures.length >= MAX_FAILURES;
  }

  recordFailure(): void {
    this.failures.push(this.now().getTime());
  }
}
