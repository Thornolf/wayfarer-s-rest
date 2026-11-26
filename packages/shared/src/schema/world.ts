// The world: zones, the places inside them, and the monsters that live there.

import { z } from "zod";
import {
  FLOORS,
  MONSTER_RANKS,
  PLACE_KINDS,
  WEATHER_KINDS,
  amount,
  baseFields,
  group,
  noun,
  perKey,
  ref,
  refs,
  select,
} from "./common";

export const zoneSchema = z.strictObject({
  ...baseFields(),
  name: noun("Nom"),
  weather: group(
    perKey(WEATHER_KINDS, (label) => amount(label)),
    "Météo",
    "Le poids de chaque temps : plus il est grand, plus ce temps est fréquent dans la zone.",
  ),
  monsters: refs("monsters", "Monstres", { help: "Les monstres qu’on croise dans la zone, tous rangs confondus." }),
});
/** Zones have no level: monsters and loot follow the character's. Its places point to it. */
export type Zone = z.infer<typeof zoneSchema>;

export const placeSchema = z.strictObject({
  ...baseFields(),
  name: noun("Nom"),
  zone: ref("zones", "Zone"),
  kind: select(PLACE_KINDS, "Type de lieu", "Les quêtes et les scènes choisissent leurs lieux par type."),
  floor: select(FLOORS, "Sol", "Décide du bruit des pas."),
  ambience: ref("ambiences", "Ambiance"),
  enterTransition: ref("soundCategories", "Son d’arrivée", {
    help: "Joué en entrant dans le lieu : une porte pour une auberge, par exemple.",
    where: { layer: "transition" },
  }).optional(),
});
export type Place = z.infer<typeof placeSchema>;

export const monsterSchema = z.strictObject({
  ...baseFields(),
  name: noun("Nom", "Sans article : « loup gris ». Pour un boss qui porte un nom : « Alpha Grisecroc »."),
  rank: select(MONSTER_RANKS, "Rang", "Le monstre n’a pas de niveau : il suit celui du personnage."),
});
export type Monster = z.infer<typeof monsterSchema>;
