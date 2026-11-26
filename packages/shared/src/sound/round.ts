/** Rounds what goes into a cue, so that a night stored as JSON stays short: times to the hundredth, levels to the thousandth. */
export function round(value: number, digits: 2 | 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
