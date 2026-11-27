// The content check of the fake server: the reference problems of the shared schema, plus the
// sound categories nothing can play. A real server finds more (conversions, unclassified sounds).

import { checkReferences, type Catalog, type CheckIssue } from "@wayfarers-rest/shared";
import type { Store } from "./store";

/** Only what stops the phone from reading the catalog blocks a publication. */
const SEVERITY: Record<ReturnType<typeof checkReferences>[number]["kind"], CheckIssue["severity"]> = {
  duplicateId: "error",
  missingRef: "error",
  mismatchedRef: "error",
  archivedRef: "warning",
};

export function referenceIssues(catalog: Record<string, unknown>): CheckIssue[] {
  return checkReferences(catalog as Catalog).map((issue) => ({ severity: SEVERITY[issue.kind], ...issue }));
}

function emptyCategories(store: Store): CheckIssue[] {
  const playable = new Set(
    store
      .entries("sounds")
      .filter((sound) => !sound.archived && sound.data.active !== false)
      .map((sound) => sound.data.category),
  );
  return store
    .entries("soundCategories")
    .filter((category) => !category.archived && !playable.has(category.id))
    .map((category) => ({ severity: "warning", kind: "emptyCategory", collection: "soundCategories", id: category.id, path: "" }));
}

export function checkDraft(store: Store): CheckIssue[] {
  return [...referenceIssues(store.catalog()), ...emptyCategories(store)];
}

export const issueKey = (issue: CheckIssue): string =>
  [issue.kind, issue.collection, issue.id, issue.path, issue.target?.collection, issue.target?.id].join("|");
