import { Directory, File, Paths } from "expo-file-system";

const PREFIX = "audio-test-";
const KEPT_FILES = 10;
const KEPT_PROBLEMS = 5;
/** The events that mean something went wrong; the screen shows their count and the last ones. */
const PROBLEM_TYPES = new Set(["error", "statusError", "playFailed"]);

export type LogData = Record<string, unknown>;

// The journal of one test: one JSON object per line, in the app's documents. Lines are kept in
// memory until flush(), which appends them to the file: the scenario flushes at every heartbeat, so
// at most ten seconds are lost if iOS kills the app. Nothing else is kept in memory, so an hour of
// test costs a few hundred kilobytes on disk and nothing in RAM.
export class TestLog {
  readonly startedAt = Date.now();
  private readonly file: File | null;
  private pending: string[] = [];
  private writing: Promise<void> = Promise.resolve();
  private writeFailed = false;
  /** How many problem events were logged, and the last few, for the screen. */
  problemCount = 0;
  lastProblems: string[] = [];

  constructor(label: string) {
    let file: File | null = null;
    try {
      pruneOldLogs();
      const stamp = new Date(this.startedAt).toISOString().replace(/[:.]/g, "-");
      file = new File(Paths.document, `${PREFIX}${label}-${stamp}.jsonl`);
      file.create({ overwrite: true });
    } catch (error) {
      // The test is still worth running without a file: the lines go to the console.
      console.warn("[audio-test] cannot create the log file", error);
      file = null;
    }
    this.file = file;
  }

  /** The file to share, or null if it could not be created. */
  get uri(): string | null {
    return this.file?.uri ?? null;
  }

  log(type: string, data: LogData = {}): void {
    const now = Date.now();
    const line = JSON.stringify({
      t: new Date(now).toISOString(),
      ms: now - this.startedAt,
      type,
      ...data,
    });
    console.log(`[audio-test] ${line}`);
    if (PROBLEM_TYPES.has(type)) {
      this.problemCount += 1;
      const detail = [data.where, data.slot, data.message ?? data.error].filter(Boolean).join(" ");
      this.lastProblems = [...this.lastProblems, `${type} ${detail}`].slice(-KEPT_PROBLEMS);
    }
    if (this.file) this.pending.push(line);
  }

  /** Appends the pending lines to the file. Writes are chained, so the order is kept. */
  flush(): Promise<void> {
    const file = this.file;
    if (!file || this.pending.length === 0) return this.writing;
    const chunk = this.pending.join("\n") + "\n";
    this.pending = [];
    this.writing = this.writing
      .then(() => file.write(chunk, { append: true }))
      .catch((error) => {
        if (!this.writeFailed) console.warn("[audio-test] cannot write the log file", error);
        this.writeFailed = true;
      });
    return this.writing;
  }
}

/** Keeps the most recent logs only (the names sort by date within a label, close enough). */
function pruneOldLogs(): void {
  const logs = new Directory(Paths.document)
    .list()
    .filter((entry): entry is File => entry instanceof File && entry.name.startsWith(PREFIX))
    .sort((a, b) => (b.modificationTime ?? 0) - (a.modificationTime ?? 0));
  for (const old of logs.slice(KEPT_FILES - 1)) {
    try {
      old.delete();
    } catch {
      // A log that cannot be deleted is not worth failing the test for.
    }
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
