// The morning summary: fill-in-the-blanks sentences, each tied to a kind of highlight of the night.

import { z } from "zod";
import { templateProblems, type SlotKind } from "../text/template";
import { FIGHT_RESULTS, amount, baseFields, conditionFields, group, select, template, toggle } from "./common";

/** The moments of a night worth a sentence, in the order the admin lists them. */
export const HIGHLIGHT_KINDS = {
  opening: "Ouverture (toujours la première phrase)",
  questDone: "Quête rendue",
  levelUp: "Niveau gagné",
  boss: "Combat de boss",
  epicLoot: "Butin épique ou légendaire",
  flee: "Fuite",
  companion: "Compagnon qui rejoint l’aventure",
  weatherChange: "Changement de météo",
  restAt: "Repos",
  closing: "Clôture (toujours la dernière phrase)",
} as const;
export type HighlightKind = keyof typeof HIGHLIGHT_KINDS;

/** Slots every sentence can use: the hero, and where the highlight happened. */
const COMMON_SLOTS = { hero: "noun", place: "noun", zone: "noun" } as const;

/**
 * The slots the generator fills for each kind of highlight, and what each holds. `quest` is the
 * rendered title, `companions` the joined names of the group, `quip` one line of the companion,
 * `count` how many times it happened this night (quests done, flights).
 */
export const HIGHLIGHT_SLOTS = {
  opening: COMMON_SLOTS,
  questDone: { ...COMMON_SLOTS, quest: "text", count: "number" },
  levelUp: { ...COMMON_SLOTS, level: "number" },
  boss: { ...COMMON_SLOTS, monster: "noun", companions: "text" },
  epicLoot: { ...COMMON_SLOTS, item: "noun" },
  flee: { ...COMMON_SLOTS, monster: "noun", count: "number" },
  companion: { ...COMMON_SLOTS, companion: "noun", quip: "text" },
  weatherChange: COMMON_SLOTS,
  restAt: COMMON_SLOTS,
  closing: { ...COMMON_SLOTS, level: "number", xp: "number", count: "number" },
} as const satisfies Record<HighlightKind, Record<string, SlotKind>>;

const ALL_SLOTS: Record<string, SlotKind> = Object.assign({}, ...Object.values(HIGHLIGHT_SLOTS));

export const summarySentenceSchema = z
  .strictObject({
    ...baseFields(),
    trigger: select(HIGHLIGHT_KINDS, "Temps fort"),
    text: template(
      ALL_SLOTS,
      "Phrase",
      "Un gabarit : {hero}, {place:a}, {monster:le}, [une variante|une autre], {hero?parti|partie}. Les trous permis dépendent du temps fort.",
    ),
    weight: amount("Poids", "Plus il est grand, plus la phrase sort souvent parmi celles qui conviennent."),
    when: group(
      {
        ...conditionFields(),
        outcome: select(FIGHT_RESULTS, "Issue du combat", "Pour un combat de boss.").optional(),
        companion: toggle("En groupe", "Oui : seulement avec des compagnons ({companions} est alors rempli). Non : seulement seul.").optional(),
        minCount: amount("À partir de… fois", "La phrase ne sort que si {count} atteint ce nombre.").optional(),
      },
      "Conditions",
      "Vide : la phrase convient toujours.",
    ).optional(),
  })
  .superRefine((sentence, context) => {
    const allowed = HIGHLIGHT_SLOTS[sentence.trigger];
    for (const [locale, source] of Object.entries(sentence.text)) {
      for (const problem of templateProblems(source, allowed)) {
        context.addIssue({ code: "custom", message: `${problem} (trigger "${sentence.trigger}")`, path: ["text", locale] });
      }
    }
  });
export type SummarySentence = z.infer<typeof summarySentenceSchema>;
