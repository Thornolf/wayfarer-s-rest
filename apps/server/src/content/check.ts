// The check of the content: what is wrong in a set of items, and how much it matters. An error
// blocks publishing; a warning is only shown.

import { checkReferences, type Catalog, type CheckIssue } from "@wayfarers-rest/shared";
import { assembleCatalog } from "./catalog";
import type { StoredItem } from "./store";

/**
 * Archiving never blocks: the generator leaves archived items out of its draws, and a category
 * without sound falls back or stays silent. A reference to nothing, or to the wrong kind of item,
 * would break a night.
 */
const severityOf = (kind: CheckIssue["kind"]): CheckIssue["severity"] =>
  kind === "archivedRef" || kind === "emptyCategory" ? "warning" : "error";

export function referenceIssues(catalog: Catalog): CheckIssue[] {
  return checkReferences(catalog).map((issue) => ({ severity: severityOf(issue.kind), ...issue }));
}

/** The live sound categories that no live, active sound belongs to. */
function emptyCategories(catalog: Catalog): CheckIssue[] {
  const used = new Set(catalog.sounds.filter((sound) => sound.active && !sound.archived).map((sound) => sound.category));
  return catalog.soundCategories
    .filter((category) => !category.archived && !used.has(category.id))
    .map((category) => ({ severity: severityOf("emptyCategory"), kind: "emptyCategory", collection: "soundCategories", id: category.id, path: "" }));
}

export function checkContent(items: StoredItem[]): CheckIssue[] {
  const { catalog, invalid } = assembleCatalog(items);
  return [...invalid, ...referenceIssues(catalog), ...emptyCategories(catalog)];
}

export const errorsOf = (issues: CheckIssue[]): CheckIssue[] => issues.filter((issue) => issue.severity === "error");
