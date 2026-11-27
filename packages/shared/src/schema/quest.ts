// The story: quest templates give the thread, scenes fill it, event tables say which scene comes.

import { z } from "zod";
import type { SlotKind } from "../text/template";
import {
  FLOORS,
  GROUP_MODES,
  MONSTER_RANKS,
  PLACE_KINDS,
  QUEST_KINDS,
  ROW_OUTCOMES,
  SCENE_KINDS,
  STEP_ACTIONS,
  amount,
  baseFields,
  group,
  list,
  localized,
  multiselect,
  range,
  ratio,
  ref,
  refs,
  select,
  template,
} from "./common";

export const sceneTemplateSchema = z.strictObject({
  ...baseFields(),
  name: localized("Nom"),
  kind: select(SCENE_KINDS, "Type de scène"),
  duration: range("Durée (secondes)", "La durée de chaque scène est tirée entre ces deux valeurs."),
  intensity: ratio("Intensité", "De 0 (très calme) à 1 (très animé). Les scènes animées se font rares quand la minuterie avance."),
  actionCategory: ref("soundCategories", "Son d’action", {
    help: "La catégorie jouée pendant la scène. Vide : l’ambiance seule.",
    where: { layer: "action" },
  }).optional(),
  floors: multiselect(FLOORS, "Sols", "La scène ne sort que sur ces sols. Vide : partout.").optional(),
  placeKinds: multiselect(PLACE_KINDS, "Types de lieux", "La scène ne sort que dans ces lieux. Vide : partout.").optional(),
  group: select(GROUP_MODES, "Groupe").default("any"),
  xp: amount("XP", "Gagnée à chaque fois, hors combat (l’XP des combats dépend du rang du monstre).").default(0),
});
export type SceneTemplate = z.infer<typeof sceneTemplateSchema>;

const eventRowSchema = z.strictObject({
  scene: ref("sceneTemplates", "Scène"),
  weight: amount("Poids", "Plus il est grand, plus la ligne sort souvent."),
  outcome: select(
    ROW_OUTCOMES,
    "Ce qui se passe",
    "Un combat se fait contre le monstre de la quête s’il a ce rang, sinon contre un monstre de la zone.",
  ).default("nothing"),
});
export type EventRow = z.infer<typeof eventRowSchema>;

export const eventTableSchema = z.strictObject({
  ...baseFields(),
  name: localized("Nom"),
  rows: list(eventRowSchema, "Lignes", "Les lignes dont la scène ne convient pas au lieu ou au groupe sont ignorées.").min(1),
});
export type EventTable = z.infer<typeof eventTableSchema>;

/** What a quest title can name. `{monster}` needs the quest to have a monster rank. */
export const QUEST_TITLE_SLOTS = { monster: "noun", place: "noun", zone: "noun" } as const satisfies Record<string, SlotKind>;

const questStepSchema = z
  .strictObject({
    action: select(
      STEP_ACTIONS,
      "Étape",
      "Accepter et rendre se passent là où la quête est donnée ; faire, au lieu de la quête ; aller et revenir, entre les deux.",
    ),
    scene: ref("sceneTemplates", "Scène", { help: "Une scène fixe, sans surprise." }).optional(),
    eventTable: ref("eventTables", "Table d’événements", { help: "Ou des scènes tirées dans une table." }).optional(),
    repeat: range("Nombre de scènes", "Tiré entre ces deux valeurs. Vide : une seule scène.").optional(),
    transition: ref("soundCategories", "Transition sonore", {
      help: "Jouée au début de l’étape : le « ding » d’une quête acceptée ou rendue.",
      where: { layer: "transition" },
    }).optional(),
  })
  .refine((step) => (step.scene === undefined) !== (step.eventTable === undefined), {
    message: "A step needs either a scene or an event table, not both",
    path: ["scene"],
  });
export type QuestStep = z.infer<typeof questStepSchema>;

export const questTemplateSchema = z
  .strictObject({
    ...baseFields(),
    kind: select(QUEST_KINDS, "Type de quête", "Une « pause » clôt la partie entendue de la nuit."),
    title: template(
      QUEST_TITLE_SLOTS,
      "Titre",
      "Un gabarit : « Les {monster:pl} {place:de} ». {place} est le lieu de la quête, {zone} sa zone.",
    ),
    zones: refs("zones", "Zones", { help: "La quête n’est proposée que dans ces zones. Vide : partout." }).optional(),
    placeKinds: multiselect(PLACE_KINDS, "Lieu de la quête", "Les types de lieux où la quête peut se dérouler.").min(1),
    monsterRank: select(MONSTER_RANKS, "Monstre de la quête", "Le rang du monstre que la quête désigne. Vide : aucun.").optional(),
    steps: list(questStepSchema, "Étapes").min(1),
    group: group(
      {
        chance: ratio("Chance d’être en groupe"),
        size: range("Nombre de compagnons"),
      },
      "Groupe",
      "Vide : la quête se fait toujours seul.",
    ).optional(),
    minLevel: amount("Niveau minimal", "La quête n’est proposée qu’à partir de ce niveau du personnage (celui du coucher). Vide : dès le niveau 1.").optional(),
    minIntensity: ratio("Intensité minimale", "La quête n’est plus proposée quand l’intensité de la nuit passe en dessous.").optional(),
    xp: amount("XP", "Gagnée quand la quête est rendue."),
    weight: amount("Poids", "Plus il est grand, plus la quête est fréquente."),
  })
  .superRefine((quest, context) => {
    if (quest.monsterRank !== undefined) return;
    for (const [locale, title] of Object.entries(quest.title)) {
      if (/\{monster\b/.test(title)) {
        context.addIssue({ code: "custom", message: "{monster} needs a monster rank", path: ["title", locale] });
      }
    }
  });
export type QuestTemplate = z.infer<typeof questTemplateSchema>;
