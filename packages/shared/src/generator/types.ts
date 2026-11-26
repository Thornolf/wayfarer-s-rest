// What goes into a night and what its story is made of.

import type { Locale } from "../locale";
import type { ShuffleBagState } from "../rng";
import type { Catalog } from "../schema/catalog";
import type {
  Daylight,
  FightResult,
  Gender,
  ItemSlot,
  MonsterRank,
  QuestKind,
  Rarity,
  SceneKind,
  StepAction,
  WeatherKind,
} from "../schema/common";
import type { HighlightKind } from "../schema/summary";

/** An item the character owns: it took the character's level when it dropped. */
export type ItemInstance = { item: string; rarity: Rarity; level: number };
export type Gear = Partial<Record<ItemSlot, ItemInstance>>;

/** Drops since the last item of each rarity or better: long bad luck raises the odds. */
export type PityCounters = { rare: number; epic: number };

/** The character as it goes to bed. The night never changes it: `applyNight` gives the next one. */
export type CharacterSnapshot = {
  name: string;
  gender: Gender;
  level: number;
  /** XP gained since reaching `level`. */
  xp: number;
  /** What is equipped at bedtime; it stays the same all night. */
  gear: Gear;
  /** Ids of the companions met on earlier nights: they come back more often. */
  knownCompanions: string[];
  pity: PityCounters;
  /** One shuffle bag of sentence ids per kind of highlight, so that summaries do not repeat. */
  servedSentences: Partial<Record<HighlightKind, ShuffleBagState<string>>>;
};

/** What the Adventure button asks for. Anything left out is drawn at random. */
export type AdventureSettings = {
  zone?: string;
  /** The time of day in the world when the night starts. */
  daylight?: Daylight;
  /** The weather when the night starts. */
  weather?: WeatherKind;
  /** The kind of the first quest. */
  questKind?: QuestKind;
  /** The intensity the night starts at, from 0 to 1 (1 when left out). */
  intensity?: number;
};

/** Everything the story depends on. The wake time is not in it: a night is cut, never regenerated. */
export type StoryInput = {
  seed: number;
  catalog: Catalog;
  character: CharacterSnapshot;
  settings?: AdventureSettings;
  /** The sound timer: 15, 30, 60 or 120. */
  soundMinutes: number;
  /** The language quest titles and the summary are rendered in (French when left out). */
  locale?: Locale;
};

/** One quest as it was played: a template with its places, monster and companions drawn. */
export type QuestRun = {
  index: number;
  template: string;
  kind: QuestKind;
  /** The rendered title. */
  title: string;
  /** Seconds since the start of the night. */
  at: number;
  /** Where the quest is given and turned in. */
  giver: string;
  /** Where it takes place. */
  place: string;
  monster?: string;
  /** Ids of the companions who came along; empty when alone. */
  companions: string[];
};

export type Fight = { monster: string; rank: MonsterRank; result: FightResult };

/** What an event earned, and where the character stands once it is counted. */
export type Gains = {
  xp: number;
  items: ItemInstance[];
  level: number;
  /** XP into `level`. */
  levelXp: number;
  /** True when this event raised the level. */
  levelUp: boolean;
};

/** One scene of the night. Events follow each other without gap: `at + duration` is the next `at`. */
export type TimelineEvent = {
  index: number;
  /** Seconds since the start of the night. */
  at: number;
  /** Seconds. */
  duration: number;
  /** Index of the quest in `night.quests`. */
  quest: number;
  step: StepAction;
  /** Id of the scene template. */
  scene: string;
  kind: SceneKind;
  place: string;
  weather: WeatherKind;
  daylight: Daylight;
  /** The intensity of the night at that time, from 0 to 1. */
  intensity: number;
  /** Sound categories to play as the event starts: quest ding, door of the inn. */
  transitions: string[];
  fight?: Fight;
  /** Set on the event that ends a quest: true when it was turned in, false when its monster won. */
  questDone?: boolean;
  gains?: Gains;
};

/** What the story yields: an event and the quest it belongs to (the same object all quest long). */
export type StoryBeat = { quest: QuestRun; event: TimelineEvent };

/** A hole in the content that the night worked around; the admin's check shows them. */
export type NightWarning =
  | { kind: "emptyCategory"; category: string; fallback?: string }
  | { kind: "noRestQuest"; zone: string }
  | { kind: "noSentence"; highlight: HighlightKind };
