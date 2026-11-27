// Sound: categories (the unit the story asks for), ambiences made of layered sub-ambiences, and the
// sound files themselves.

import { z } from "zod";
import {
  ID_PATTERN,
  SOUND_LAYERS,
  amount,
  baseFields,
  conditionFields,
  group,
  list,
  localized,
  range,
  ratio,
  ref,
  refs,
  select,
  text,
  toggle,
} from "./common";
import { field } from "./admin";

export const soundCategorySchema = z.strictObject({
  ...baseFields(),
  name: localized("Nom"),
  layer: select(SOUND_LAYERS, "Couche"),
  maxVolume: ratio("Volume maximum", "Aucun son de la catégorie ne joue plus fort, quelles que soient les variations."),
  volumeJitter: ratio("Variation de volume", "0,2 : chaque lecture joue entre −20 % et +20 % du volume du son."),
  rateJitter: ratio("Variation de vitesse", "0,08 : chaque lecture joue entre −8 % et +8 % de la vitesse (et de la hauteur)."),
  minGap: range("Délai entre deux sons (secondes)", "Pour les ponctuels : le silence tiré entre deux sons ou deux rafales.").optional(),
  burst: group(
    {
      chance: ratio("Chance de rafale"),
      count: range("Nombre de sons"),
    },
    "Rafales",
    "Pour les ponctuels : parfois plusieurs sons d’un coup (trois oiseaux, puis plus rien).",
  ).optional(),
  fallback: ref("soundCategories", "Catégorie de secours", {
    help: "Utilisée tant que cette catégorie n’a aucun son actif.",
  }).optional(),
});
export type SoundCategory = z.infer<typeof soundCategorySchema>;

const subAmbienceSchema = z.strictObject({
  id: field(z.string().regex(ID_PATTERN), {
    label: "Identifiant",
    widget: "id",
    help: "Unique dans l’ambiance.",
  }),
  name: localized("Nom"),
  category: ref("soundCategories", "Sons", {
    help: "La catégorie de boucles d’où cette sous-ambiance tire ses sons.",
    where: { layer: "ambience" },
  }),
  volume: ratio("Volume"),
  probability: ratio("Probabilité", "La chance qu’elle soit là quand ses conditions sont réunies. 1 : toujours (le fond)."),
  drift: ratio("Va-et-vient", "De combien son volume monte et descend lentement. 0 : stable."),
  when: group(conditionFields(), "Conditions").optional(),
});
/** One layer of an ambience: the leaves, the wind, a nearby river, a bard… */
export type SubAmbience = z.infer<typeof subAmbienceSchema>;

const ambienceOneShotSchema = z.strictObject({
  category: ref("soundCategories", "Sons", { where: { layer: "oneShot" } }),
  when: group(conditionFields(), "Conditions").optional(),
});

export const ambienceSchema = z
  .strictObject({
    ...baseFields(),
    name: localized("Nom"),
    layers: list(subAmbienceSchema, "Sous-ambiances", "Elles se superposent : un fond, puis ce qui va et vient par-dessus.").min(1),
    oneShots: list(ambienceOneShotSchema, "Ponctuels", "Les sons qui éclatent de temps en temps dans cette ambiance."),
  })
  .refine((ambience) => new Set(ambience.layers.map((layer) => layer.id)).size === ambience.layers.length, {
    message: "Sub-ambience ids must be unique within an ambience",
    path: ["layers"],
  });
/** What a place sounds like: sub-ambiences layered on top of each other, plus its one-shots. */
export type Ambience = z.infer<typeof ambienceSchema>;

export const soundSchema = z.strictObject({
  ...baseFields(),
  file: text("Fichier", "L’identifiant du fichier sur le serveur."),
  category: ref("soundCategories", "Catégorie", { help: "Elle donne aussi la couche du son." }),
  places: refs("places", "Lieux autorisés", { help: "Vide : partout." }).optional(),
  loop: toggle("Boucle"),
  duration: amount("Durée (secondes)", "Calculée par le serveur à l’import."),
  volume: ratio("Volume"),
  weight: amount("Poids", "Plus il est grand, plus le son sort souvent parmi ceux de sa catégorie."),
  volumeJitter: ratio("Variation de volume", "Vide : celle de la catégorie.").optional(),
  rateJitter: ratio("Variation de vitesse", "Vide : celle de la catégorie.").optional(),
  active: toggle("Actif").default(true),
});
export type Sound = z.infer<typeof soundSchema>;
