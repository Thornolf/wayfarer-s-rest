// Group quests: who comes along. Companions met before are favoured, so that they come back.

import type { Rng } from "../rng";
import type { QuestTemplate } from "../schema/quest";
import type { World } from "../world";

export function drawCompanions(world: World, template: QuestTemplate, known: ReadonlySet<string>, rng: Rng): string[] {
  const group = template.group;
  const inGroup = group !== undefined && rng.chance(group.chance);
  if (!group || !inGroup) return [];

  const size = rng.int(Math.round(group.size.min), Math.max(Math.round(group.size.min), Math.round(group.size.max)));
  const knownWeight = world.catalog.settings.knownCompanionWeight;
  let candidates = world.active.companions.map(({ id }) => ({ value: id, weight: known.has(id) ? knownWeight : 1 }));
  const companions: string[] = [];
  while (companions.length < size && candidates.some(({ weight }) => weight > 0)) {
    const drawn = rng.weighted(candidates);
    companions.push(drawn);
    candidates = candidates.filter(({ value }) => value !== drawn);
  }
  return companions;
}
