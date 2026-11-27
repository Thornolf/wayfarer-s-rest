// Where a value sits inside an item: the keys and indexes that lead to it. Forms read and write
// through paths, and errors are keyed by the same text the server uses ("steps[2].scene").

export type Path = readonly (string | number)[];

export function formatPath(path: Path): string {
  return path.reduce<string>((text, part) => (typeof part === "number" ? `${text}[${part}]` : text ? `${text}.${part}` : part), "");
}

/** Reads back what `formatPath` wrote. */
export function parsePath(text: string): Path {
  return [...text.matchAll(/([^.[\]]+)|\[(\d+)\]/g)].map((match) => (match[2] === undefined ? (match[1] as string) : Number(match[2])));
}

export function getAt(value: unknown, path: Path): unknown {
  let current = value;
  for (const part of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[part];
  }
  return current;
}

/**
 * A copy of `value` with `next` at `path`; nothing is mutated. Setting undefined removes the key of
 * an object. Missing parents are created: an array under an index, an object under a key.
 */
export function setAt(value: unknown, path: Path, next: unknown): unknown {
  const [head, ...rest] = path;
  if (head === undefined) return next;
  if (typeof head === "number") {
    const copy = Array.isArray(value) ? [...value] : [];
    copy[head] = setAt(copy[head], rest, next);
    return copy;
  }
  const copy: Record<string, unknown> = value !== null && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
  const child = setAt(copy[head], rest, next);
  if (child === undefined) delete copy[head];
  else copy[head] = child;
  return copy;
}
