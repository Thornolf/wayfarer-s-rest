// A whole night: its story until the wake time, the sound of its heard part and its summary.

import { generateStory } from "./generator/story";
import { planNight } from "./generator/planner";
import type { CharacterSnapshot, NightWarning, QuestRun, StoryInput, TimelineEvent } from "./generator/types";
import { DEFAULT_LOCALE, type Locale } from "./locale";
import type { Catalog } from "./schema/catalog";
import type { Gender } from "./schema/common";
import { catalogHash } from "./schema/hash";
import { planSound, type SoundPlan } from "./sound/plan";
import type { SoundCue } from "./sound/types";
import { summarize } from "./summary/summary";
import type { Summary } from "./summary/types";
import { indexCatalog, type World } from "./world";

export type NightInput = StoryInput & {
  /** From bedtime to the wake time set in the app, in seconds. The caller reads the clock, never the generator. */
  durationSeconds: number;
};

export type Night = {
  seed: number;
  /** The catalog the night was generated from: the same seed on another catalog is another night. */
  catalogHash: string;
  locale: Locale;
  /** How long the sound plays, in seconds. */
  soundSeconds: number;
  /** How long the night lasts, in seconds: events start before it. */
  duration: number;
  zone: string;
  /** The hour of the world when the night starts, from 0 to 24. */
  startHour: number;
  /** The character at bedtime, as far as the night needs it later. */
  hero: { name: string; gender: Gender; level: number; xp: number };
  quests: QuestRun[];
  events: TimelineEvent[];
  /** What to play, sorted by start; nothing past `soundSeconds`. */
  cues: SoundCue[];
  /** The fade of everything together that ends the sound. */
  finalFade: SoundPlan["finalFade"];
  summary: Summary;
  warnings: NightWarning[];
};

function summaryOf(night: Omit<Night, "summary" | "warnings">, world: World, served: Summary["served"]) {
  return summarize({
    seed: night.seed,
    world,
    events: night.events,
    quests: night.quests,
    zone: night.zone,
    hero: night.hero,
    served,
    locale: night.locale,
  });
}

/** Generates the night from bedtime to the wake time. Same input, same night. */
export function generateNight(input: NightInput): Night {
  const world = indexCatalog(input.catalog);
  const plan = planNight(input, world);
  const quests: QuestRun[] = [];
  const events: TimelineEvent[] = [];
  for (const { quest, event } of generateStory(input)) {
    if (event.at >= input.durationSeconds) break;
    if (quests[quest.index] === undefined) quests.push(quest);
    events.push(event);
  }

  const sound = planSound({ seed: input.seed, world, events, soundSeconds: Math.min(plan.soundSeconds, input.durationSeconds) });
  const { character } = input;
  const night = {
    seed: input.seed,
    catalogHash: catalogHash(input.catalog),
    locale: input.locale ?? DEFAULT_LOCALE,
    soundSeconds: plan.soundSeconds,
    duration: input.durationSeconds,
    zone: plan.zone.id,
    startHour: plan.startHour,
    hero: { name: character.name, gender: character.gender, level: character.level, xp: character.xp },
    quests,
    events,
    cues: sound.cues,
    finalFade: sound.finalFade,
  };
  const { summary, untold } = summaryOf(night, world, character.servedSentences);
  const warnings: NightWarning[] = [...plan.warnings, ...sound.warnings, ...untold.map((highlight) => ({ kind: "noSentence" as const, highlight }))];
  return { ...night, summary, warnings };
}

/**
 * The night as it stood when the app was opened again: the events, quests and cues that started
 * before the cut, and the summary of that part. Nothing is drawn again for the events: a night cut
 * at 3 is the beginning of the same night cut at 7. Needs the catalog and the character the night
 * was generated with.
 */
export function cutNight(night: Night, cutAt: number, context: { catalog: Catalog; character: CharacterSnapshot }): Night {
  const cut = {
    ...night,
    duration: Math.min(night.duration, cutAt),
    quests: night.quests.filter((quest) => quest.at < cutAt),
    events: night.events.filter((event) => event.at < cutAt),
    cues: night.cues.filter((cue) => cue.at < cutAt),
  };
  const { summary } = summaryOf(cut, indexCatalog(context.catalog), context.character.servedSentences);
  return { ...cut, summary };
}
