// One quest, planned from its template: where it happens, against what, with whom, and the scenes
// of each step. A plan is pure data: nothing is resolved yet, so a plan that does not fit the time
// left can be thrown away.

import { localize, type Locale } from "../locale";
import type { Rng } from "../rng";
import type { MonsterRank, PlaceKind, RowOutcome, StepAction } from "../schema/common";
import type { EventRow, QuestStep, QuestTemplate, SceneTemplate } from "../schema/quest";
import type { Monster, Place, Zone } from "../schema/world";
import { renderTemplate, type SlotValue } from "../text/template";
import { monstersOf, placesOf, type World } from "../world";
import { drawCompanions } from "./companions";
import { sceneFit } from "./intensity";

/** Where quests are given and where the hero waits between two of them. */
const HUB_KINDS: readonly PlaceKind[] = ["town", "inn", "camp"];
const FIGHT_RANKS: Partial<Record<RowOutcome, MonsterRank>> = { fight: "normal", elite: "elite", boss: "boss" };
/** A forced rest repeats its last step until the sound ends; this only guards against a broken catalog. */
const MOST_REST_SCENES = 500;

export type PlannedScene = {
  step: StepAction;
  scene: SceneTemplate;
  place: Place;
  /** Seconds, at least one. */
  duration: number;
  outcome: RowOutcome;
  /** The monster fought, when the outcome is a fight. */
  monster?: Monster;
  /** The sound category of the step, on its first scene: the ding of a quest accepted or turned in. */
  ding?: string;
  /** The sound category of the place, when the scene is the first one there: the door of the inn. */
  entrance?: string;
};

export type QuestPlan = {
  template: QuestTemplate;
  title: string;
  giver: Place;
  target: Place;
  monster?: Monster;
  companions: string[];
  scenes: PlannedScene[];
  /** Index of the scene that ends the quest: the last of its turn-in step, or its last scene. */
  endScene: number;
  /** Seconds. */
  duration: number;
};

export type QuestContext = {
  world: World;
  zone: Zone;
  /** Where the hero stands when the quest starts. */
  from: Place;
  /** When the quest starts, in seconds since the start of the night. */
  startAt: number;
  intensity: (seconds: number) => number;
  /** Ids of the companions already met. */
  known: ReadonlySet<string>;
  locale: Locale;
  rng: Rng;
  /** Take the fewest scenes each step allows. */
  short?: boolean;
  /**
   * Makes the quest the rest that ends the heard part: its last step only draws rest scenes and
   * repeats until this time, and the steps before it leave it room to start well before.
   */
  restUntil?: number;
  /** How long before `restUntil` the last step must have started. */
  restLead?: number;
};

/** Whether a template can be played in a zone at all: a place of the right kind, a monster of the right rank. */
export function canHappen(world: World, zone: Zone, template: QuestTemplate): boolean {
  if (template.zones?.length && !template.zones.includes(zone.id)) return false;
  if (!placesOf(world, zone).some((place) => template.placeKinds.includes(place.kind))) return false;
  return template.monsterRank === undefined || monstersOf(world, zone, template.monsterRank).length > 0;
}

export function isHub(place: Place): boolean {
  return HUB_KINDS.includes(place.kind);
}

function fits(scene: SceneTemplate, place: Place, inGroup: boolean): boolean {
  if (scene.floors?.length && !scene.floors.includes(place.floor)) return false;
  if (scene.placeKinds?.length && !scene.placeKinds.includes(place.kind)) return false;
  return scene.group === "any" || scene.group === (inGroup ? "group" : "solo");
}

function wholeRange(range: { min: number; max: number }): [number, number] {
  const min = Math.max(1, Math.round(range.min));
  return [min, Math.max(min, Math.round(range.max))];
}

/** Prefers the items that pass the test, and falls back on all of them. */
function preferring<T>(items: T[], test: (item: T) => boolean): T[] {
  const preferred = items.filter(test);
  return preferred.length > 0 ? preferred : items;
}

export function planQuest(template: QuestTemplate, context: QuestContext): QuestPlan | null {
  const { world, zone, rng } = context;
  if (!canHappen(world, zone, template)) return null;

  const places = placesOf(world, zone);
  const setting = rng.fork("setting");
  const giver = isHub(context.from) ? context.from : setting.pick(preferring(places, isHub));
  const targets = places.filter((place) => template.placeKinds.includes(place.kind));
  const target = setting.pick(preferring(targets, (place) => place.id !== giver.id));
  const wild = places.filter((place) => place.kind === "wild");
  const route = wild.length > 0 ? setting.pick(preferring(wild, (place) => place.id !== target.id)) : target;
  const monster = template.monsterRank ? setting.pick(monstersOf(world, zone, template.monsterRank)) : undefined;
  const companions = drawCompanions(world, template, context.known, rng.fork("group"));
  const inGroup = companions.length > 0;

  const placeOf = (action: StepAction): Place => {
    if (action === "accept" || action === "turnIn") return giver;
    return action === "do" ? target : route;
  };

  const draws = rng.fork("scenes");
  const scenes: PlannedScene[] = [];
  let at = context.startAt;
  let previousPlace = context.from;

  /** The scene of a step: its fixed one, or a row of its table that fits the place and the group. */
  const drawScene = (step: QuestStep, place: Place, restOnly: boolean): Pick<PlannedScene, "scene" | "outcome" | "monster"> | null => {
    if (step.scene !== undefined) {
      const scene = world.byId.sceneTemplates.get(step.scene);
      return scene && !scene.archived ? { scene, outcome: "nothing" } : null;
    }
    const table = step.eventTable === undefined ? undefined : world.byId.eventTables.get(step.eventTable);
    if (!table || table.archived) return null;

    const foes = (row: EventRow): Monster[] => {
      const rank = FIGHT_RANKS[row.outcome];
      if (rank === undefined) return [];
      return monster?.rank === rank ? [monster] : monstersOf(world, zone, rank);
    };
    let rows = table.rows.flatMap((row) => {
      const scene = world.byId.sceneTemplates.get(row.scene);
      if (!scene || scene.archived || row.weight <= 0 || !fits(scene, place, inGroup)) return [];
      if (FIGHT_RANKS[row.outcome] !== undefined && foes(row).length === 0) return [];
      return [{ row, scene }];
    });
    if (restOnly) rows = preferring(rows, ({ scene }) => scene.kind === "rest");
    if (rows.length === 0) return null;

    const intensity = context.intensity(at);
    const drawn = draws.weighted(rows.map((entry) => ({ value: entry, weight: entry.row.weight * sceneFit(entry.scene.intensity, intensity) })));
    const candidates = foes(drawn.row);
    return {
      scene: drawn.scene,
      outcome: drawn.row.outcome,
      ...(candidates.length > 0 ? { monster: draws.pick(candidates) } : {}),
    };
  };

  let endScene = -1;
  template.steps.forEach((step, stepIndex) => {
    const place = placeOf(step.action);
    const resting = context.restUntil !== undefined;
    const untilSoundEnds = resting && stepIndex === template.steps.length - 1;
    const [fewest, most] = step.repeat ? wholeRange(step.repeat) : [1, 1];
    const count = untilSoundEnds ? MOST_REST_SCENES : context.short || resting ? fewest : draws.int(fewest, most);

    for (let n = 0; n < count; n++) {
      if (untilSoundEnds && at >= (context.restUntil as number)) break;
      const drawn = drawScene(step, place, untilSoundEnds);
      if (!drawn) break;
      const duration = draws.int(...wholeRange(drawn.scene.duration));
      // The steps before the final rest stop early enough for it to begin while the sound still plays.
      if (resting && !untilSoundEnds && at + duration > (context.restUntil as number) - (context.restLead ?? 0)) break;

      scenes.push({
        step: step.action,
        place,
        duration,
        ...drawn,
        ...(n === 0 && step.transition !== undefined ? { ding: step.transition } : {}),
        ...(place.id !== previousPlace.id && place.enterTransition !== undefined ? { entrance: place.enterTransition } : {}),
      });
      previousPlace = place;
      at += duration;
      if (step.action === "turnIn") endScene = scenes.length - 1;
    }
  });
  if (scenes.length === 0) return null;

  const slots: Record<string, SlotValue> = { place: target.name, zone: zone.name, ...(monster ? { monster: monster.name } : {}) };
  const title = renderTemplate(localize(template.title, context.locale), slots, { rng: rng.fork("title"), locale: context.locale });

  return {
    template,
    title,
    giver,
    target,
    ...(monster ? { monster } : {}),
    companions,
    scenes,
    endScene: endScene >= 0 ? endScene : scenes.length - 1,
    duration: at - context.startAt,
  };
}
