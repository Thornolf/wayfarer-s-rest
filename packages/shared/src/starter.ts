// The starter world, written by an AI (every item carries `aiGenerated: true`) for the owner to
// rewrite in the admin. The server seeds its catalog from it; the app never needs it.

import ambiences from "../content/ambiences.json";
import companions from "../content/companions.json";
import eventTables from "../content/eventTables.json";
import items from "../content/items.json";
import monsters from "../content/monsters.json";
import places from "../content/places.json";
import questTemplates from "../content/questTemplates.json";
import sceneTemplates from "../content/sceneTemplates.json";
import settings from "../content/settings.json";
import soundCategories from "../content/soundCategories.json";
import sounds from "../content/sounds.json";
import summarySentences from "../content/summarySentences.json";
import zones from "../content/zones.json";
import { parseCatalog, type Catalog } from "./schema/catalog";

/** The starter world as written in `content/*.json`, validated and with its defaults filled in. */
export function loadStarterCatalog(): Catalog {
  return parseCatalog({
    zones,
    places,
    monsters,
    questTemplates,
    sceneTemplates,
    eventTables,
    ambiences,
    soundCategories,
    sounds,
    items,
    companions,
    summarySentences,
    settings,
  });
}
