// Every route of the server, once: the server registers its handlers from this table and the admin
// and the app build their calls from it. See docs/plans/etape-3-serveur.md, section 4.
//
// Three rules hold everywhere:
// - the app only ever sees published content: `catalogue`, `packs` and `packManifest` serve the last
//   publication, while everything under /api/admin reads and writes the draft;
// - nothing is deleted: an item is archived, a device token is revoked;
// - any response that is not a success carries `apiErrorSchema` (see common.ts).

import {
  catalogueHeadersSchema,
  catalogueQuerySchema,
  catalogueSyncSchema,
  checkResultSchema,
  collectionParamsSchema,
  entryDetailSchema,
  entryListQuerySchema,
  entryListSchema,
  entryParamsSchema,
  entryResultSchema,
  entryWriteSchema,
  exportSchema,
  publicationStateSchema,
  publishRequestSchema,
  settingsDetailSchema,
  settingsWriteSchema,
  writeHeadersSchema,
} from "./content";
import {
  backupParamsSchema,
  backupReceiptSchema,
  characterBackupSchema,
  characterParamsSchema,
  deviceCreateSchema,
  deviceCreatedSchema,
  deviceListSchema,
  deviceParamsSchema,
  healthSchema,
  loginSchema,
  nightReportSchema,
  reportListQuerySchema,
  reportListSchema,
  reportParamsSchema,
  reportReceiptSchema,
  sessionSchema,
  storedBackupSchema,
} from "./device";
import { route, type RouteDef } from "./route";
import {
  convertedFileParamsSchema,
  importBatchSchema,
  importCommitResultSchema,
  importCommitSchema,
  importParamsSchema,
  packListSchema,
  packManifestSchema,
  packParamsSchema,
  soundBulkPatchSchema,
  soundBulkResultSchema,
  soundFileResultSchema,
  soundListQuerySchema,
  soundListSchema,
  soundParamsSchema,
} from "./sounds";

export const routes = {
  // --- Alive ---
  /** For systemd and curl. */
  health: route({ method: "GET", path: "/health", auth: "none", response: healthSchema }),
  /** The same answer under /api: the app calls it before emptying its outbox. */
  apiHealth: route({ method: "GET", path: "/api/health", auth: "none", response: healthSchema }),

  // --- Admin session ---
  /** Sets the session cookie. A wrong password is `unauthorized`; too many tries, `rateLimited`. */
  login: route({ method: "POST", path: "/api/admin/session", auth: "none", body: loginSchema, response: sessionSchema }),
  /** Tells the admin whether it is signed in: `unauthorized` when it is not. */
  session: route({ method: "GET", path: "/api/admin/session", auth: "admin", response: sessionSchema }),
  logout: route({ method: "DELETE", path: "/api/admin/session", auth: "admin", response: "empty" }),

  // --- Catalogue ---
  /** The published catalogue, as changes after `since`. 304 when `If-None-Match` names the version. */
  catalogue: route({
    method: "GET",
    path: "/api/catalogue",
    auth: "any",
    query: catalogueQuerySchema,
    headers: catalogueHeadersSchema,
    response: catalogueSyncSchema,
  }),
  /** The same for the draft: what the admin loads to fill reference pickers and simulate a night. */
  draftCatalogue: route({
    method: "GET",
    path: "/api/admin/catalogue",
    auth: "admin",
    query: catalogueQuerySchema,
    headers: catalogueHeadersSchema,
    response: catalogueSyncSchema,
  }),

  // --- Collections (draft) ---
  listEntries: route({
    method: "GET",
    path: "/api/admin/collections/:collection",
    auth: "admin",
    params: collectionParamsSchema,
    query: entryListQuerySchema,
    response: entryListSchema,
  }),
  getEntry: route({
    method: "GET",
    path: "/api/admin/collections/:collection/:id",
    auth: "admin",
    params: entryParamsSchema,
    response: entryDetailSchema,
  }),
  /**
   * 201 when created, 200 when replaced. `invalidContent` when the item does not fit its schema,
   * `brokenReferences` when it adds a broken reference, `versionConflict` when `If-Match` fails.
   */
  putEntry: route({
    method: "PUT",
    path: "/api/admin/collections/:collection/:id",
    auth: "admin",
    params: entryParamsSchema,
    headers: writeHeadersSchema,
    body: entryWriteSchema,
    response: entryResultSchema,
  }),
  archiveEntry: route({
    method: "POST",
    path: "/api/admin/collections/:collection/:id/archive",
    auth: "admin",
    params: entryParamsSchema,
    response: entryResultSchema,
  }),
  unarchiveEntry: route({
    method: "POST",
    path: "/api/admin/collections/:collection/:id/unarchive",
    auth: "admin",
    params: entryParamsSchema,
    response: entryResultSchema,
  }),
  getSettings: route({ method: "GET", path: "/api/admin/settings", auth: "admin", response: settingsDetailSchema }),
  putSettings: route({
    method: "PUT",
    path: "/api/admin/settings",
    auth: "admin",
    headers: writeHeadersSchema,
    body: settingsWriteSchema,
    response: settingsDetailSchema,
  }),

  // --- Check, publication, export ---
  check: route({ method: "GET", path: "/api/admin/check", auth: "admin", response: checkResultSchema }),
  /** What changed in the draft since the last publication. */
  publication: route({ method: "GET", path: "/api/admin/publication", auth: "admin", response: publicationStateSchema }),
  /** The "Publier" button: from now on the phone receives the draft as it stands. */
  publish: route({
    method: "POST",
    path: "/api/admin/publication",
    auth: "admin",
    body: publishRequestSchema,
    response: publicationStateSchema,
  }),
  exportCatalogue: route({ method: "GET", path: "/api/admin/export", auth: "admin", response: exportSchema }),

  // --- Sounds (draft) ---
  listSounds: route({ method: "GET", path: "/api/admin/sounds", auth: "admin", query: soundListQuerySchema, response: soundListSchema }),
  /** One transaction: every sound is changed, or none is. */
  patchSounds: route({ method: "PATCH", path: "/api/admin/sounds", auth: "admin", body: soundBulkPatchSchema, response: soundBulkResultSchema }),
  /** One part named `SOUND_IMPORT_FIELD` per file. Answers 201 at once; conversions follow. */
  importSounds: route({ method: "POST", path: "/api/admin/sounds/import", auth: "admin", body: "multipart", response: importBatchSchema }),
  /** Polled while conversions run. */
  getImport: route({
    method: "GET",
    path: "/api/admin/sounds/imports/:batchId",
    auth: "admin",
    params: importParamsSchema,
    response: importBatchSchema,
  }),
  /** "Valider l'import", once the mapping was reviewed and corrected. */
  commitImport: route({
    method: "POST",
    path: "/api/admin/sounds/imports/:batchId/commit",
    auth: "admin",
    params: importParamsSchema,
    body: importCommitSchema,
    response: importCommitResultSchema,
  }),
  /** Queues the conversion again, after a failure or new settings; answers 202. */
  reconvertSound: route({
    method: "POST",
    path: "/api/admin/sounds/:id/reconvert",
    auth: "admin",
    params: soundParamsSchema,
    response: soundFileResultSchema,
  }),
  /** The file as it was uploaded. */
  originalSound: route({
    method: "GET",
    path: "/api/admin/sounds/:id/original",
    auth: "admin",
    params: soundParamsSchema,
    response: "binary",
  }),

  // --- Packs and files ---
  packs: route({ method: "GET", path: "/api/packs", auth: "device", response: packListSchema }),
  packManifest: route({ method: "GET", path: "/api/packs/:packId", auth: "device", params: packParamsSchema, response: packManifestSchema }),
  /** A converted file: `Range` supported, `Cache-Control: immutable`. */
  convertedSound: route({
    method: "GET",
    path: "/files/sounds/:sha256.m4a",
    auth: "any",
    params: convertedFileParamsSchema,
    response: "binary",
  }),

  // --- Reports and backups ---
  putReport: route({
    method: "PUT",
    path: "/api/reports/:reportId",
    auth: "device",
    params: reportParamsSchema,
    body: nightReportSchema,
    response: reportReceiptSchema,
  }),
  listReports: route({ method: "GET", path: "/api/reports", auth: "any", query: reportListQuerySchema, response: reportListSchema }),
  putBackup: route({
    method: "PUT",
    path: "/api/characters/:characterId/backups/:revision",
    auth: "device",
    params: backupParamsSchema,
    body: characterBackupSchema,
    response: backupReceiptSchema,
  }),
  /** The highest revision, to restore on a new phone; `notFound` when there is none. */
  latestBackup: route({
    method: "GET",
    path: "/api/characters/:characterId/backups/latest",
    auth: "device",
    params: characterParamsSchema,
    response: storedBackupSchema,
  }),

  // --- Devices ---
  listDevices: route({ method: "GET", path: "/api/admin/devices", auth: "admin", response: deviceListSchema }),
  createDevice: route({ method: "POST", path: "/api/admin/devices", auth: "admin", body: deviceCreateSchema, response: deviceCreatedSchema }),
  /** Revokes the token; the device stays in the list. */
  revokeDevice: route({
    method: "DELETE",
    path: "/api/admin/devices/:deviceId",
    auth: "admin",
    params: deviceParamsSchema,
    response: "empty",
  }),
} as const satisfies Record<string, RouteDef>;

export type RouteName = keyof typeof routes;
export type Routes = typeof routes;
