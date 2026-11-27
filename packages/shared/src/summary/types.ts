// The morning summary: the highlights of the night as data, and the sentences written from them.

import type { ItemInstance } from "../generator/types";
import type { ShuffleBagState } from "../rng";
import type { Daylight, FightResult, WeatherKind } from "../schema/common";
import type { HighlightKind } from "../schema/summary";

/** A moment of the night worth a sentence. The fields past `salience` depend on the kind. */
export type Highlight = {
  kind: HighlightKind;
  /** Seconds since the start of the night. */
  at: number;
  place: string;
  weather: WeatherKind;
  daylight: Daylight;
  /** How much the moment deserves its sentence: the highest ones are kept. */
  salience: number;
  /** The rendered title of the quest. */
  quest?: string;
  monster?: string;
  outcome?: FightResult;
  item?: ItemInstance;
  /** The companion who joined. */
  companion?: string;
  /** What the companion said, already in the night's language. */
  quip?: string;
  /** The companions present. */
  companions?: string[];
  level?: number;
  xp?: number;
  /** How many times it happened this night: quests done, flights. */
  count?: number;
};

export type SummaryLine = {
  highlight: Highlight;
  /** Id of the summary sentence used. */
  sentence: string;
  text: string;
};

/**
 * The summary, kept both ways: the text as it was written that morning, and the highlights as
 * data. Content rewritten or archived later never changes an old chronicle.
 */
export type Summary = {
  text: string;
  lines: SummaryLine[];
  /** The sentence bags after this summary, to store in the character for the next nights. */
  served: Partial<Record<HighlightKind, ShuffleBagState<string>>>;
};
