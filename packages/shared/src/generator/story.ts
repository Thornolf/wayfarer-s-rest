// The story of a night, one event after the other. It is a generator with a stable prefix: an
// event depends on the seed, the catalog, the character and what came before, never on when the
// night will end. Cutting a night is keeping the events that started before the cut.

import { DEFAULT_LOCALE } from "../locale";
import { earn } from "../progression/gains";
import { lootMultiplier, successChance, type Fighter } from "../progression/fight";
import { gearScore } from "../progression/gear";
import { addXp } from "../progression/xp";
import { createRng } from "../rng";
import type { MonsterRank } from "../schema/common";
import { indexCatalog } from "../world";
import { daylightAt } from "./daylight";
import { intensityAt } from "./intensity";
import { chooseQuest, planNight } from "./planner";
import type { Fight, QuestRun, StoryBeat, StoryInput, TimelineEvent } from "./types";
import { WeatherTrack } from "./weather";

/** The quests whose monster must fall for the quest to be turned in. */
const DECISIVE_RANKS: readonly MonsterRank[] = ["elite", "boss"];

/**
 * Yields the events of the night for ever: take them while `event.at` is before the wake time.
 * Each use of randomness has its own stream (plan, story, weather, fight, loot), so that a change
 * in one part of the catalog only moves what depends on it.
 */
export function* generateStory(input: StoryInput): Generator<StoryBeat, never, undefined> {
  const world = indexCatalog(input.catalog);
  const settings = world.catalog.settings;
  const plan = planNight(input, world);
  const root = createRng(input.seed);
  const storyRng = root.fork("story");
  const fightRng = root.fork("fight");
  const lootRng = root.fork("loot");
  const weather = new WeatherTrack(plan.zone.weather, root.fork("weather"), settings.weatherMinMinutes * 60, input.settings?.weather);

  const { character } = input;
  const worn = gearScore(character.gear, world);
  const known = new Set(character.knownCompanions);
  let progress = { level: character.level, xp: character.xp };
  let pity = character.pity;
  let place = plan.startPlace;
  let at = 0;
  let eventIndex = 0;

  for (let questIndex = 0; ; questIndex++) {
    const quest = chooseQuest({
      world,
      plan,
      from: place,
      at,
      known,
      locale: input.locale ?? DEFAULT_LOCALE,
      rng: storyRng.fork(`quest-${questIndex}`),
      kind: questIndex === 0 ? input.settings?.questKind : undefined,
    });
    const run: QuestRun = {
      index: questIndex,
      template: quest.template.id,
      kind: quest.template.kind,
      title: quest.title,
      at,
      giver: quest.giver.id,
      place: quest.target.id,
      ...(quest.monster ? { monster: quest.monster.id } : {}),
      companions: quest.companions,
    };
    quest.companions.forEach((companion) => known.add(companion));
    // The gear and the level of bedtime decide the odds all night: the cut never changes them.
    const fighter: Fighter = { gearScore: worn, level: character.level, inGroup: quest.companions.length > 0 };
    const decisive = quest.monster !== undefined && DECISIVE_RANKS.includes(quest.monster.rank);
    let faced = false;
    let beaten = false;

    for (const [sceneIndex, planned] of quest.scenes.entries()) {
      let fight: Fight | undefined;
      if (planned.monster) {
        const won = fightRng.fork(String(eventIndex)).chance(successChance(planned.monster.rank, fighter, settings));
        fight = { monster: planned.monster.id, rank: planned.monster.rank, result: won ? "win" : "flee" };
        if (planned.monster.id === quest.monster?.id) {
          faced = true;
          beaten ||= won;
        }
      }
      const endsQuest = sceneIndex === quest.endScene;
      const questDone = !decisive || !faced || beaten;
      const earned = earn({
        world,
        sceneXp: planned.scene.xp,
        outcome: planned.outcome,
        fight,
        questXp: endsQuest && questDone ? quest.template.xp : 0,
        lootMultiplier: lootMultiplier(fighter, settings),
        pity,
        level: progress.level,
        rng: lootRng.fork(String(eventIndex)),
      });
      pity = earned.pity;
      const before = progress;
      progress = addXp(progress, earned.xp, settings.xpCurve);

      const event: TimelineEvent = {
        index: eventIndex,
        at,
        duration: planned.duration,
        quest: questIndex,
        step: planned.step,
        scene: planned.scene.id,
        kind: planned.scene.kind,
        place: planned.place.id,
        weather: weather.at(at),
        daylight: daylightAt(plan.startHour, at),
        intensity: Math.round(intensityAt(at, plan.curve) * 1000) / 1000,
        // A quest that failed is told to its giver without the ding.
        transitions: [
          ...(planned.ding !== undefined && !(endsQuest && !questDone) ? [planned.ding] : []),
          ...(planned.entrance !== undefined ? [planned.entrance] : []),
        ],
        ...(fight ? { fight } : {}),
        ...(endsQuest ? { questDone } : {}),
        ...(earned.xp > 0 || earned.items.length > 0
          ? { gains: { xp: earned.xp, items: earned.items, level: progress.level, levelXp: progress.xp, levelUp: progress.level > before.level } }
          : {}),
      };
      yield { quest: run, event };

      place = planned.place;
      at += planned.duration;
      eventIndex += 1;
    }
  }
}
