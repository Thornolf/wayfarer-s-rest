// What leaves a form before it is checked and sent: the gaps a form holds while it is being filled
// (an input emptied, a block opened and left blank) are not content.

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  return typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;
}

/**
 * A copy without empty texts, missing values and objects left with nothing in them. Lists keep
 * their rows, even an empty one: a row's position is what its errors are attached to.
 */
export function prune(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((element) => (element !== null && typeof element === "object" ? prune(element) : element));
  if (value === null || typeof value !== "object") return isEmpty(value) ? undefined : value;
  const kept: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const cleaned = prune(child);
    if (!isEmpty(cleaned)) kept[key] = cleaned;
  }
  return kept;
}
