// The catalog: every collection plus the settings. It is the JSON the server stores and publishes,
// and the only content the night generator reads.

import { z } from "zod";
import type { CollectionName } from "./admin";
import { companionSchema, itemSchema } from "./character";
import { eventTableSchema, questTemplateSchema, sceneTemplateSchema } from "./quest";
import { settingsSchema } from "./settings";
import { ambienceSchema, soundCategorySchema, soundSchema } from "./sound";
import { summarySentenceSchema } from "./summary";
import { monsterSchema, placeSchema, zoneSchema } from "./world";

type CollectionInfo<S extends z.ZodType> = {
  schema: S;
  /** French name of the collection, as the admin's menu shows it. */
  label: string;
  /** French name of one item. */
  singular: string;
  /** The field that names an item in lists and in reference pickers. */
  titleField: string;
};

const collection = <S extends z.ZodType>(schema: S, label: string, singular: string, titleField: string): CollectionInfo<S> => ({
  schema,
  label,
  singular,
  titleField,
});

export const COLLECTIONS = {
  zones: collection(zoneSchema, "Zones", "Zone", "name"),
  places: collection(placeSchema, "Lieux", "Lieu", "name"),
  monsters: collection(monsterSchema, "Monstres", "Monstre", "name"),
  questTemplates: collection(questTemplateSchema, "Quêtes", "Modèle de quête", "title"),
  sceneTemplates: collection(sceneTemplateSchema, "Scènes", "Modèle de scène", "name"),
  eventTables: collection(eventTableSchema, "Tables d’événements", "Table d’événements", "name"),
  ambiences: collection(ambienceSchema, "Ambiances", "Ambiance", "name"),
  soundCategories: collection(soundCategorySchema, "Catégories de sons", "Catégorie de sons", "name"),
  sounds: collection(soundSchema, "Sons", "Son", "file"),
  items: collection(itemSchema, "Objets", "Objet", "name"),
  companions: collection(companionSchema, "Compagnons", "Compagnon", "name"),
  summarySentences: collection(summarySentenceSchema, "Phrases du résumé", "Phrase du résumé", "text"),
} satisfies Record<CollectionName, CollectionInfo<z.ZodType>>;

/** French label of the settings form, which is not a collection. */
export const SETTINGS_LABEL = "Réglages";

export const catalogSchema = z.strictObject({
  zones: z.array(COLLECTIONS.zones.schema),
  places: z.array(COLLECTIONS.places.schema),
  monsters: z.array(COLLECTIONS.monsters.schema),
  questTemplates: z.array(COLLECTIONS.questTemplates.schema),
  sceneTemplates: z.array(COLLECTIONS.sceneTemplates.schema),
  eventTables: z.array(COLLECTIONS.eventTables.schema),
  ambiences: z.array(COLLECTIONS.ambiences.schema),
  soundCategories: z.array(COLLECTIONS.soundCategories.schema),
  sounds: z.array(COLLECTIONS.sounds.schema),
  items: z.array(COLLECTIONS.items.schema),
  companions: z.array(COLLECTIONS.companions.schema),
  summarySentences: z.array(COLLECTIONS.summarySentences.schema),
  settings: settingsSchema,
});

/** A validated catalog: defaults are filled in (`archived`, `aiGenerated`…). */
export type Catalog = z.infer<typeof catalogSchema>;
/** The type of one item of a collection: `CollectionItem<"zones">` is `Zone`. */
export type CollectionItem<K extends CollectionName> = Catalog[K][number];

/**
 * Validates raw JSON against the schema and returns the catalog with its defaults filled in.
 * Throws a ZodError; references between collections are checked apart, by `checkReferences`.
 */
export function parseCatalog(input: unknown): Catalog {
  return catalogSchema.parse(input);
}
