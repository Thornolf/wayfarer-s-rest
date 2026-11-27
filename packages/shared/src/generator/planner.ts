// The plan of a night: where it starts, at what hour of the world, and which quest comes next.
// While the sound plays, quests are chosen to fit the time left, and the last one is a rest.

import type { Locale } from "../locale";
import { createRng, type Rng } from "../rng";
import type { QuestKind } from "../schema/common";
import type { QuestTemplate } from "../schema/quest";
import type { Place, Zone } from "../schema/world";
import { indexCatalog, placesOf, type World } from "../world";
import { drawStartHour } from "./daylight";
import { intensityAt, type IntensityCurve } from "./intensity";
import { canHappen, isHub, planQuest, type QuestContext, type QuestPlan } from "./quest";
import type { NightWarning, StoryInput } from "./types";

/** How much rest quests gain in weight as the intensity falls. */
const REST_PULL = 2;
/** A rest drawn when no more than this many reserves are left of the sound becomes the final rest, instead of a pause before it. */
const REST_SETTLES = 2.5;
/** How many templates are tried before the heard part settles for its final rest. */
const FITTING_TRIES = 4;
/** How many templates are tried before a catalog is declared unplayable. */
const PLAYABLE_TRIES = 8;

export type NightPlan = {
  zone: Zone;
  startPlace: Place;
  /** The hour of the world when the night starts, from 0 to 24. */
  startHour: number;
  soundSeconds: number;
  curve: IntensityCurve;
  warnings: NightWarning[];
};

/** The share of the sound timer kept for the final rest, in seconds. */
export function restReserve(soundSeconds: number): number {
  return Math.min(600, Math.max(180, soundSeconds * 0.3));
}

const playable = (world: World, zone: Zone) => world.active.questTemplates.some((template) => canHappen(world, zone, template));

/** What is decided once for the whole night. It depends on the seed, the catalog and the settings only. */
export function planNight(input: StoryInput, world: World = indexCatalog(input.catalog)): NightPlan {
  const rng = createRng(input.seed).fork("plan");
  const settings = input.settings ?? {};
  const zones = world.active.zones.filter((zone) => playable(world, zone));
  if (zones.length === 0) throw new Error("The catalog has no zone where a quest can happen");

  const zone = zones.find(({ id }) => id === settings.zone) ?? rng.fork("zone").pick(zones);
  const places = placesOf(world, zone);
  const hubs = places.filter(isHub);
  const soundSeconds = Math.max(0, input.soundMinutes * 60);
  const hasRest = world.active.questTemplates.some((template) => template.kind === "rest" && canHappen(world, zone, template));

  return {
    zone,
    startPlace: rng.fork("place").pick(hubs.length > 0 ? hubs : places),
    startHour: drawStartHour(rng.fork("hour"), settings.daylight),
    soundSeconds,
    curve: {
      soundSeconds,
      start: Math.min(1, Math.max(0, settings.intensity ?? 1)),
      silent: world.catalog.settings.silentIntensity,
    },
    warnings: hasRest ? [] : [{ kind: "noRestQuest", zone: zone.id }],
  };
}

export type QuestChoice = {
  world: World;
  plan: NightPlan;
  from: Place;
  /** Seconds since the start of the night. */
  at: number;
  known: ReadonlySet<string>;
  locale: Locale;
  /** A stream of its own for this quest. */
  rng: Rng;
  /** Asks for a quest of this kind, when one can be played. */
  kind?: QuestKind | undefined;
  /** Id of the template of the quest before: it is not offered twice in a row while another can be. */
  previous?: string | undefined;
};

/** The next quest, planned. Throws when the zone has no quest that yields a single scene. */
export function chooseQuest(choice: QuestChoice): QuestPlan {
  const { world, plan, at, rng } = choice;
  const intensity = intensityAt(at, plan.curve);
  const possible = world.active.questTemplates.filter((template) => template.weight > 0 && canHappen(world, plan.zone, template));
  const ofKind = possible.filter((template) => template.kind === choice.kind);
  const lively = possible.filter((template) => (template.minIntensity ?? 0) <= intensity);
  const suited = ofKind.length > 0 ? ofKind : lively.length > 0 ? lively : possible;
  const fresh = suited.filter((template) => template.id !== choice.previous);
  const offered = fresh.length > 0 ? fresh : suited;

  const context = (name: string): QuestContext => ({
    world,
    zone: plan.zone,
    from: choice.from,
    startAt: at,
    intensity: (seconds) => intensityAt(seconds, plan.curve),
    known: choice.known,
    locale: choice.locale,
    rng: rng.fork(name),
  });
  const draw = (templates: QuestTemplate[], name: string): QuestTemplate =>
    rng.fork(name).weighted(
      templates.map((template) => ({
        value: template,
        weight: template.weight * (template.kind === "rest" ? 1 + REST_PULL * (1 - intensity) : 1),
      })),
    );

  if (at < plan.soundSeconds && offered.length > 0) {
    const reserve = restReserve(plan.soundSeconds);
    const mustEndBy = plan.soundSeconds - reserve;
    const finalRest = (template: QuestTemplate, name: string) =>
      planQuest(template, { ...context(name), restUntil: plan.soundSeconds, restLead: reserve });
    for (let attempt = 0; attempt < FITTING_TRIES; attempt++) {
      const template = draw(offered, `pick-${attempt}`);
      if (template.kind === "rest" && plan.soundSeconds - at <= REST_SETTLES * reserve) {
        const rest = finalRest(template, `plan-${attempt}-rest`);
        if (rest) return rest;
      }
      for (const short of [false, true]) {
        const quest = planQuest(template, { ...context(`plan-${attempt}-${short ? "short" : "full"}`), short });
        if (quest && at + quest.duration <= mustEndBy) return quest;
      }
    }
    const rests = possible.filter((template) => template.kind === "rest");
    if (rests.length > 0) {
      const rest = finalRest(draw(rests, "rest"), "plan-rest");
      if (rest) return rest;
    }
  }

  for (let attempt = 0; attempt < PLAYABLE_TRIES && offered.length > 0; attempt++) {
    const quest = planQuest(draw(offered, `any-${attempt}`), context(`plan-any-${attempt}`));
    if (quest) return quest;
  }
  throw new Error(`No quest of the catalog yields a scene in zone "${plan.zone.id}"`);
}
