// Sound files: what the server knows about a file, import batches, the bulk edit, and the packs the
// phone downloads. A file is the technical half of a sound; the editable half is its item in the
// `sounds` collection, whose `file` field holds the id of the file.

import { z } from "zod";
import { SOUND_LAYERS, type SoundLayer } from "../schema/common";
import { soundSchema } from "../schema/sound";
import { ARCHIVED_FILTERS, entrySchema } from "./content";
import { contentIdSchema, md5Schema, sha256Schema, textFlag, timestampSchema } from "./common";

const layerSchema = z.enum(Object.keys(SOUND_LAYERS) as [SoundLayer, ...SoundLayer[]]);

/** The name of the multipart field that carries each file of an import. */
export const SOUND_IMPORT_FIELD = "files";

export const SOUND_FILE_STATUSES = ["pending", "converting", "ready", "failed"] as const;
/** AAC for short sounds, ALAC for ambience loops; both in an `.m4a` file. */
export const SOUND_CODECS = ["aac", "alac"] as const;

/** The path of a converted file, relative to the server: its content never changes. */
export const soundFilePath = (sha256: string): string => `/files/sounds/${sha256}.m4a`;

export const convertedFileSchema = z.object({
  sha256: sha256Schema,
  /** The only hash the phone can compute on a downloaded file. */
  md5: md5Schema,
  bytes: z.number().int().min(0),
  durationMs: z.number().int().min(0),
  sampleRate: z.number().int().min(1),
  channels: z.number().int().min(1),
  codec: z.enum(SOUND_CODECS),
  /** `soundFilePath(sha256)`. */
  url: z.string(),
});

export const soundFileSchema = z.object({
  /** The value of the `file` field of the sound item. */
  id: z.string().min(1),
  originalName: z.string(),
  originalSha256: sha256Schema,
  originalBytes: z.number().int().min(0),
  status: z.enum(SOUND_FILE_STATUSES),
  /** Why the conversion failed, in English; null otherwise. */
  error: z.string().nullable(),
  /** Null until the conversion is done. */
  converted: convertedFileSchema.nullable(),
  /** True when the loudness pass had to compress the sound instead of applying a constant gain. */
  dynamicNormalization: z.boolean(),
  createdAt: timestampSchema,
});
export type SoundFile = z.infer<typeof soundFileSchema>;

export const soundRowSchema = z.object({
  /** The item of the `sounds` collection (draft). */
  entry: entrySchema,
  /** Null when the item names a file the server does not have. */
  file: soundFileSchema.nullable(),
});
export type SoundRow = z.infer<typeof soundRowSchema>;

export const soundListQuerySchema = z.strictObject({
  layer: layerSchema.optional(),
  category: contentIdSchema.optional(),
  place: contentIdSchema.optional(),
  status: z.enum(SOUND_FILE_STATUSES).optional(),
  /** Only the sounds of this import batch. */
  batch: z.string().optional(),
  /** Only the sounds whose file name could not be mapped and that were not classified since. */
  unclassified: textFlag.optional(),
  archived: z.enum(ARCHIVED_FILTERS).optional(),
  search: z.string().optional(),
});
export const soundListSchema = z.object({ sounds: z.array(soundRowSchema) });

export const soundParamsSchema = z.strictObject({ id: contentIdSchema });
export const soundFileResultSchema = z.object({ file: soundFileSchema });

// --- Bulk edit -----------------------------------------------------------------------------------

const { shape } = soundSchema;
/**
 * One change applied to many sounds in one transaction, refused whole if any result is invalid.
 * Only the fields present in `set` are touched; null clears a variation back to its category's.
 */
export const soundBulkPatchSchema = z.strictObject({
  ids: z.array(contentIdSchema).min(1),
  set: z
    .strictObject({
      category: shape.category,
      loop: shape.loop,
      volume: shape.volume,
      weight: shape.weight,
      volumeJitter: z.number().min(0).max(1).nullable(),
      rateJitter: z.number().min(0).max(1).nullable(),
      active: z.boolean(),
      archived: z.boolean(),
      aiGenerated: z.boolean(),
    })
    .partial()
    .optional(),
  /** Allowed places: replace the list, or add to it, or remove from it. */
  places: z.strictObject({ mode: z.enum(["replace", "add", "remove"]), ids: z.array(contentIdSchema) }).optional(),
});
export type SoundBulkPatch = z.infer<typeof soundBulkPatchSchema>;
export const soundBulkResultSchema = z.object({ entries: z.array(entrySchema) });

// --- Import batches ------------------------------------------------------------------------------

/** Why a file name could not be mapped; `value` is the part of the name at fault. */
export const MAPPING_PROBLEMS = ["badShape", "unknownLayer", "unknownCategory", "unknownPlace", "badNumber"] as const;

export const importItemSchema = z.object({
  /** The id of the sound item the import created, or of the existing one for a duplicate. */
  soundId: contentIdSchema,
  fileName: z.string(),
  /** The same file (same SHA-256) was already there: nothing was created. */
  duplicate: z.boolean(),
  /** What the file name said. The sound item holds the current values, corrected or not. */
  mapping: z.object({
    layer: layerSchema.nullable(),
    category: contentIdSchema.nullable(),
    places: z.array(contentIdSchema),
    problem: z.object({ code: z.enum(MAPPING_PROBLEMS), value: z.string() }).nullable(),
  }),
  file: soundFileSchema,
});
export type ImportItem = z.infer<typeof importItemSchema>;

export const importBatchSchema = z.object({
  id: z.string().min(1),
  createdAt: timestampSchema,
  /** Null until the batch is validated. Its sounds stay inactive until then. */
  committedAt: timestampSchema.nullable(),
  items: z.array(importItemSchema),
});
export type ImportBatch = z.infer<typeof importBatchSchema>;

export const importParamsSchema = z.strictObject({ batchId: z.string().min(1) });
/** Validates a batch: the sounds listed become active, the others stay inactive ("Non classés"). */
export const importCommitSchema = z.strictObject({ activate: z.array(contentIdSchema) });
export const importCommitResultSchema = z.object({ batch: importBatchSchema, entries: z.array(entrySchema) });

// --- Packs ---------------------------------------------------------------------------------------

/** The pack of the sounds tied to no place: actions, transitions, quest sounds, fallbacks. */
export const COMMON_PACK_ID = "commun";

const packHeadShape = {
  /** A zone id, or `COMMON_PACK_ID`. */
  id: z.string().min(1),
  /** Changes whenever the list of files does: the phone compares it with the one it stored. */
  packHash: sha256Schema,
  bytes: z.number().int().min(0),
  fileCount: z.number().int().min(0),
};
export const packSummarySchema = z.object({ ...packHeadShape });
export const packListSchema = z.object({ packs: z.array(packSummarySchema) });

export const packFileSchema = z.object({
  /** The id of the sound item, and the id of its file (`SoundCue.source`). */
  sound: contentIdSchema,
  file: z.string().min(1),
  sha256: sha256Schema,
  md5: md5Schema,
  bytes: z.number().int().min(0),
  durationMs: z.number().int().min(0),
  url: z.string(),
});
export type PackFile = z.infer<typeof packFileSchema>;

/** The published, active, converted sounds usable in a zone. A list of files, never an archive. */
export const packManifestSchema = z.object({ ...packHeadShape, files: z.array(packFileSchema) });
export type PackManifest = z.infer<typeof packManifestSchema>;

export const packParamsSchema = z.strictObject({ packId: z.string().min(1) });
export const convertedFileParamsSchema = z.strictObject({ sha256: sha256Schema });
