// What the character gathers along the nights: gear and companions.

import { z } from "zod";
import { COMPANION_ROLES, ITEM_SLOTS, RARITIES, amount, baseFields, list, localized, noun, select } from "./common";

export const itemSchema = z.strictObject({
  ...baseFields(),
  name: noun("Nom", "Sans article : « bottes de marche ». Coche « déjà au pluriel » pour des bottes ou des gants."),
  slot: select(ITEM_SLOTS, "Emplacement"),
  rarity: select(RARITIES, "Rareté"),
  power: amount("Puissance par niveau", "L’objet prend le niveau du personnage : sa puissance vaut ce nombre × le niveau."),
});
export type Item = z.infer<typeof itemSchema>;

export const companionSchema = z.strictObject({
  ...baseFields(),
  name: noun("Nom"),
  role: select(COMPANION_ROLES, "Rôle"),
  quips: list(localized("Réplique"), "Répliques", "Ce qu’il ou elle lance en rejoignant l’aventure ; citées dans le résumé.").min(1),
});
export type Companion = z.infer<typeof companionSchema>;
