// The building blocks every collection is made of: ids, localized texts, names with their grammar,
// ranges, the closed lists of values, and the helpers that register a field for the admin.

import { z } from "zod";
import type { LocalizedText } from "../locale";
import { templateProblems, type SlotKind } from "../text/template";
import { field, type AdminMeta, type CollectionName } from "./admin";

// --- Closed lists of values, each with its French label for the admin ---------------------------

export const GENDERS = { m: "Masculin", f: "Féminin" } as const;
/** In order from fair to foul: the weather only moves to a neighbour. */
export const WEATHER_KINDS = { clear: "Ciel clair", cloudy: "Nuageux", rain: "Pluie", storm: "Orage" } as const;
export const DAYLIGHTS = { dawn: "Aube", day: "Jour", dusk: "Crépuscule", night: "Nuit" } as const;
export const PLACE_KINDS = {
  town: "Ville ou hameau",
  inn: "Auberge",
  wild: "Lieu sauvage",
  cave: "Grotte ou mine",
  camp: "Camp",
  dungeon: "Donjon",
} as const;
export const FLOORS = { grass: "Herbe", wood: "Bois", stone: "Pierre", mud: "Boue" } as const;
export const MONSTER_RANKS = { normal: "Normal", elite: "Élite", boss: "Boss" } as const;
export const QUEST_KINDS = {
  hunt: "Chasse",
  gather: "Récolte",
  deliver: "Livraison",
  cave: "Grotte",
  escort: "Escorte",
  rest: "Pause",
} as const;
export const STEP_ACTIONS = {
  accept: "Accepter la quête",
  travel: "Aller sur place",
  do: "Faire",
  return: "Revenir",
  turnIn: "Rendre la quête",
} as const;
export const SCENE_KINDS = {
  walk: "Marcher",
  ride: "Chevaucher",
  fight: "Combattre",
  gather: "Cueillir",
  mine: "Miner",
  search: "Fouiller",
  talk: "Parler",
  rest: "Se reposer",
} as const;
export const GROUP_MODES = { any: "Seul ou en groupe", solo: "Seul uniquement", group: "En groupe uniquement" } as const;
export const ROW_OUTCOMES = {
  nothing: "Rien de spécial",
  fight: "Combat contre un monstre normal",
  elite: "Combat contre un élite",
  boss: "Combat contre un boss",
  find: "Trouvaille (un objet sans combat)",
} as const;
export const SOUND_LAYERS = {
  ambience: "Ambiance",
  action: "Action",
  oneShot: "Ponctuel",
  transition: "Transition",
} as const;
export const ITEM_SLOTS = {
  weapon: "Arme",
  head: "Tête",
  chest: "Torse",
  hands: "Mains",
  feet: "Pieds",
  trinket: "Bijou",
} as const;
export const RARITIES = { common: "Commun", rare: "Rare", epic: "Épique", legendary: "Légendaire" } as const;
export const COMPANION_ROLES = { tank: "Tank", healer: "Soins", damage: "Dégâts" } as const;
export const FIGHT_RESULTS = { win: "Victoire", flee: "Fuite" } as const;
export const NOISE_KINDS = {
  pink: "Bruit rose",
  brown: "Bruit brun",
  sound: "Un vrai son (catégorie ci-dessous)",
} as const;

export type Gender = keyof typeof GENDERS;
export type WeatherKind = keyof typeof WEATHER_KINDS;
export type Daylight = keyof typeof DAYLIGHTS;
export type PlaceKind = keyof typeof PLACE_KINDS;
export type Floor = keyof typeof FLOORS;
export type MonsterRank = keyof typeof MONSTER_RANKS;
export type QuestKind = keyof typeof QUEST_KINDS;
export type StepAction = keyof typeof STEP_ACTIONS;
export type SceneKind = keyof typeof SCENE_KINDS;
export type GroupMode = keyof typeof GROUP_MODES;
export type RowOutcome = keyof typeof ROW_OUTCOMES;
export type SoundLayer = keyof typeof SOUND_LAYERS;
export type ItemSlot = keyof typeof ITEM_SLOTS;
export type Rarity = keyof typeof RARITIES;
export type CompanionRole = keyof typeof COMPANION_ROLES;
export type FightResult = keyof typeof FIGHT_RESULTS;
export type NoiseKind = keyof typeof NOISE_KINDS;

type Labels<K extends string> = Readonly<Record<K, string>>;

function enumOf<K extends string>(labels: Labels<K>) {
  return z.enum(Object.keys(labels) as [K, ...K[]]);
}

// --- Plain schemas -------------------------------------------------------------------------------

/** Ids are stable slugs: lowercase letters, digits and dashes. */
export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const idSchema = () => z.string().regex(ID_PATTERN);

const localizedTextShape = { fr: z.string().min(1), en: z.string().min(1).optional() };
export const localizedTextSchema = z.strictObject(localizedTextShape) satisfies z.ZodType<LocalizedText>;

const nounShape = {
  text: localizedTextSchema,
  gender: enumOf(GENDERS),
  /** Forces elision on ("l’hôtel") or off ("le onzième"); guessed from the first letter otherwise. */
  elided: z.boolean().optional(),
  /** The plural, when adding an s is not enough ("loups gris"). */
  plural: localizedTextSchema.optional(),
  /** The name is already a plural ("les Collines de Brumefer"). */
  isPlural: z.boolean().optional(),
  /** A proper noun, used without article ("Brann", "Hautval"). */
  proper: z.boolean().optional(),
};
export const nounSchema = z.strictObject(nounShape);
/** A name that enters sentences, with the grammar the article filters need (see text/french.ts). */
export type Noun = z.infer<typeof nounSchema>;

const rangeShape = { min: z.number().min(0), max: z.number().min(0) };
const rangeOrdered = (range: { min: number; max: number }) => range.min <= range.max;
export const rangeSchema = z.strictObject(rangeShape).refine(rangeOrdered, "min must not exceed max");
export type Range = z.infer<typeof rangeSchema>;

// --- Fields: a schema plus its admin metadata, built fresh for each use --------------------------

function meta(label: string, widget: AdminMeta["widget"], help: string | undefined, extra: Partial<AdminMeta> = {}): AdminMeta {
  return { label, widget, ...extra, ...(help === undefined ? {} : { help }) };
}

/** The three fields every item of every collection starts with. */
export const baseFields = () => ({
  id: field(idSchema(), meta("Identifiant", "id", "Minuscules, chiffres et tirets. Il ne change plus une fois créé.")),
  archived: field(
    z.boolean().default(false),
    meta("Archivé", "boolean", "Un élément archivé ne sort plus dans les nouvelles nuits, mais n’est jamais supprimé."),
  ),
  aiGenerated: field(z.boolean().default(false), meta("Écrit par une IA", "boolean", "À relire, puis à réécrire à ta façon.")),
});

export const text = (label: string, help?: string) => field(z.string().min(1), meta(label, "text", help));
export const toggle = (label: string, help?: string) => field(z.boolean(), meta(label, "boolean", help));
/** A number that is zero or more: a weight, an amount of XP, a duration. */
export const amount = (label: string, help?: string) => field(z.number().min(0), meta(label, "number", help));
/** A number between 0 and 1: a probability, a volume, an intensity. */
export const ratio = (label: string, help?: string) => field(z.number().min(0).max(1), meta(label, "ratio", help));
export const localized = (label: string, help?: string) =>
  field(z.strictObject(localizedTextShape), meta(label, "localized", help));
export const noun = (label: string, help?: string) => field(z.strictObject(nounShape), meta(label, "noun", help));
export const range = (label: string, help?: string) =>
  field(z.strictObject(rangeShape).refine(rangeOrdered, "min must not exceed max"), meta(label, "range", help));

export const select = <K extends string>(labels: Labels<K>, label: string, help?: string) =>
  field(enumOf(labels), meta(label, "select", help, { options: labels }));
export const multiselect = <K extends string>(labels: Labels<K>, label: string, help?: string) =>
  field(z.array(enumOf(labels)), meta(label, "multiselect", help, { options: labels }));

type RefOptions = { help?: string; where?: Record<string, string> };
const refMeta = (widget: "ref" | "refs", collection: CollectionName, label: string, options: RefOptions) =>
  meta(label, widget, options.help, { ref: collection, ...(options.where ? { refWhere: options.where } : {}) });
/** The id of an item of another collection. `where` narrows the items that fit. */
export const ref = (collection: CollectionName, label: string, options: RefOptions = {}) =>
  field(idSchema(), refMeta("ref", collection, label, options));
export const refs = (collection: CollectionName, label: string, options: RefOptions = {}) =>
  field(z.array(idSchema()), refMeta("refs", collection, label, options));

/** A nested object drawn from its own fields. */
export const group = <S extends z.ZodRawShape>(shape: S, label: string, help?: string) =>
  field(z.strictObject(shape), meta(label, "group", help));
/** A list of objects or of localized texts, each drawn from its own fields. */
export const list = <T extends z.ZodType>(element: T, label: string, help?: string) =>
  field(z.array(element), meta(label, "list", help));

/** A localized text with {slots} and [variants]; every language must be a valid template. */
export const template = (slotKinds: Readonly<Record<string, SlotKind>>, label: string, help?: string) =>
  field(
    z.strictObject(localizedTextShape).superRefine((value, context) => {
      for (const [locale, source] of Object.entries(value)) {
        for (const problem of templateProblems(source, slotKinds)) {
          context.addIssue({ code: "custom", message: problem, path: [locale] });
        }
      }
    }),
    meta(label, "template", help, { slots: Object.keys(slotKinds) }),
  );

/** Conditions on the weather and the time of day; an empty or missing list means "always". */
export const conditionFields = () => ({
  weather: multiselect(WEATHER_KINDS, "Météo", "Vide : par tous les temps.").optional(),
  daylight: multiselect(DAYLIGHTS, "Moment", "Vide : de jour comme de nuit.").optional(),
});

/** One field per key of a closed list, e.g. one number per monster rank. */
export function perKey<K extends string, S extends z.ZodType>(labels: Labels<K>, make: (label: string) => S): Record<K, S> {
  const shape = {} as Record<K, S>;
  for (const key of Object.keys(labels) as K[]) shape[key] = make(labels[key]);
  return shape;
}
