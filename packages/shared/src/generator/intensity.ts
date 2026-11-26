// The intensity of a night: high at first, falling as the sound timer runs out so that fights give
// way to walks and rest, then steady during the silent part.

/** Where the intensity lands when the sound ends. */
export const HEARD_END_INTENSITY = 0.2;
/** How fast a scene livelier than the night allows becomes rare. */
const CALM_SLOPE = 1.25;
const LEAST_FIT = 0.1;

export type IntensityCurve = { soundSeconds: number; start: number; silent: number };

export function intensityAt(seconds: number, curve: IntensityCurve): number {
  if (seconds >= curve.soundSeconds) return curve.silent;
  const end = Math.min(curve.start, HEARD_END_INTENSITY);
  return curve.start + (end - curve.start) * (seconds / curve.soundSeconds);
}

/**
 * What multiplies the weight of a scene: 1 while the scene is no livelier than the night, then
 * less and less, never quite zero so that a table of fights only still has something to offer.
 */
export function sceneFit(sceneIntensity: number, intensity: number): number {
  const excess = sceneIntensity - intensity;
  if (excess <= 0) return 1;
  return Math.max(LEAST_FIT, 1 - CALM_SLOPE * excess) ** 2;
}
