// One run of the simulation: from the command-line arguments to the text to print.

import type { CharacterSnapshot, Gear } from "../generator/types";
import { cutNight, generateNight, type NightInput } from "../night";
import { newCharacter } from "../progression/character";
import { ITEM_SLOTS, type Catalog, type ItemSlot } from "../schema";
import { indexCatalog, type World } from "../world";
import { OptionError, USAGE, minutesBetween, parseOptions, type SimulateOptions } from "./options";
import { renderReport } from "./report";

/** Plain gear of the character's level: the first common item of each slot, so that odds are those of a character who kept up. */
function plainGear(world: World, level: number): Gear {
  const gear: Gear = {};
  for (const slot of Object.keys(ITEM_SLOTS) as ItemSlot[]) {
    const item = world.active.items.find((candidate) => candidate.slot === slot && candidate.rarity === "common");
    if (item) gear[slot] = { item: item.id, rarity: item.rarity, level };
  }
  return gear;
}

export function simulatedHero(options: SimulateOptions, world: World): CharacterSnapshot {
  return { ...newCharacter(options.name, options.gender), level: options.level, gear: plainGear(world, options.level) };
}

/** The night the options ask for, cut when they say so. */
export function simulate(options: SimulateOptions, catalog: Catalog) {
  const world = indexCatalog(catalog);
  if (options.zone !== undefined && !world.active.zones.some((zone) => zone.id === options.zone)) {
    throw new OptionError(`--zone : « ${options.zone} » n’existe pas (${world.active.zones.map((zone) => zone.id).join(", ")})`);
  }
  const character = simulatedHero(options, world);
  const input: NightInput = {
    seed: options.seed,
    catalog,
    character,
    soundMinutes: options.soundMinutes,
    durationSeconds: minutesBetween(options.start, options.wake) * 60,
    ...(options.zone === undefined ? {} : { settings: { zone: options.zone } }),
  };
  const whole = generateNight(input);
  const night = options.cut === undefined ? whole : cutNight(whole, minutesBetween(options.start, options.cut) * 60, { catalog, character });
  return { night, world, character };
}

/** What the command prints for these arguments: the help, the night as JSON or its report. */
export function run(args: readonly string[], catalog: Catalog): string {
  const options = parseOptions(args);
  if (options === "help") return USAGE;
  const { night, world, character } = simulate(options, catalog);
  if (options.json) return JSON.stringify(night, null, 2);
  return renderReport(night, {
    world,
    gear: character.gear,
    start: options.start,
    wake: options.wake,
    ...(options.cut === undefined ? {} : { cut: options.cut }),
    all: options.all,
  });
}
