// The tunings of the game, edited in the admin as one form.

import { z } from "zod";
import { MONSTER_RANKS, NOISE_KINDS, RARITIES, amount, group, perKey, range, ratio, ref, select } from "./common";

export const settingsSchema = z.strictObject({
  xpCurve: group(
    {
      base: amount("XP du niveau 1 au niveau 2"),
      growth: amount("Croissance", "L’XP demandée est multipliée par ce nombre à chaque niveau."),
    },
    "Courbe d’XP",
  ),
  fightXp: group(perKey(MONSTER_RANKS, (label) => amount(label)), "XP par combat gagné", "Selon le rang du monstre."),
  successBase: group(
    perKey(MONSTER_RANKS, (label) => ratio(label)),
    "Chance de réussite d’un combat",
    "Avant le gear et le groupe. Un échec est une fuite : rien n’est perdu.",
  ),
  successBounds: range("Bornes de la chance de réussite", "Jamais en dessous du minimum, jamais au-dessus du maximum."),
  gearWeight: amount("Poids du gear", "Ce que chaque point de gear au-dessus du niveau attendu ajoute à la chance de réussite."),
  groupBonus: group(
    {
      success: ratio("Réussite", "Ajouté à la chance de réussite quand on est en groupe."),
      loot: amount("Butin", "Multiplie la chance d’un butin rare en groupe."),
    },
    "Bonus de groupe",
  ),
  knownCompanionWeight: amount("Retour des compagnons", "Un compagnon déjà rencontré a ce poids-là ; un nouveau, 1."),
  dropChance: group(perKey(MONSTER_RANKS, (label) => ratio(label)), "Chance de butin", "Selon le rang du monstre vaincu."),
  lootRates: group(
    perKey(MONSTER_RANKS, (rank) => group(perKey(RARITIES, (label) => amount(label)), rank)),
    "Rareté du butin",
    "Pour chaque rang, le poids de chaque rareté.",
  ),
  weatherMinMinutes: amount("Durée minimale d’un temps (minutes)", "La météo ne change pas plus souvent."),
  silentIntensity: ratio("Intensité de la partie silencieuse", "Une fois le son arrêté, l’aventure continue à cette intensité."),
  levelUpTransition: ref("soundCategories", "Son du niveau gagné", { where: { layer: "transition" } }).optional(),
  noiseBed: group(
    {
      kind: select(NOISE_KINDS, "Type"),
      volume: ratio("Volume", "Très doux : il doit se faire oublier."),
      category: ref("soundCategories", "Catégorie du son", {
        help: "Pour « un vrai son » : un vent lointain, un feu.",
        where: { layer: "ambience" },
      }).optional(),
    },
    "Fond sonore continu",
    "Il joue du début à la fin du son, pour qu’il ne coupe jamais et qu’iOS garde l’app active.",
  ).refine((bed) => bed.kind !== "sound" || bed.category !== undefined, {
    message: "A noise bed of kind \"sound\" needs a category",
    path: ["category"],
  }),
});
export type Settings = z.infer<typeof settingsSchema>;
