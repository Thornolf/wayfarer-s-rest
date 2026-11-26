// The world's clock: it starts at an hour of its own and runs at the pace of the real night.

import type { Rng } from "../rng";
import type { Daylight } from "../schema/common";

/** Each time of day and the hours it covers; night runs past midnight. */
const BANDS: { kind: Daylight; from: number; to: number }[] = [
  { kind: "dawn", from: 5, to: 8 },
  { kind: "day", from: 8, to: 18 },
  { kind: "dusk", from: 18, to: 21 },
  { kind: "night", from: 21, to: 29 },
];

/** The time of day in the world, `seconds` after a night that started at `startHour` (0 to 24). */
export function daylightAt(startHour: number, seconds: number): Daylight {
  const hour = (startHour + seconds / 3600) % 24;
  const band = BANDS.find(({ from, to }) => (hour >= from && hour < to) || (hour + 24 >= from && hour + 24 < to));
  return band?.kind ?? "night";
}

/** The hour the world starts at: anywhere in the day, or within the time of day asked for. */
export function drawStartHour(rng: Rng, daylight?: Daylight): number {
  const band = BANDS.find(({ kind }) => kind === daylight);
  const hour = band ? rng.float(band.from, band.to) : rng.float(0, 24);
  return Math.round((hour % 24) * 100) / 100;
}
