import type { Daylight, WeatherKind } from "../schema/common";

type Conditions = { weather?: WeatherKind[] | undefined; daylight?: Daylight[] | undefined };

/** Whether conditions on the weather and the time of day hold; an empty list means "always". */
export function holds(when: Conditions | undefined, now: { weather: WeatherKind; daylight: Daylight }): boolean {
  if (when?.weather?.length && !when.weather.includes(now.weather)) return false;
  return !(when?.daylight?.length && !when.daylight.includes(now.daylight));
}
