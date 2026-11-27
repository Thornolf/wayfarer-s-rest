// A list of weighted rows (an event table) reads better with each row's share of the total.

function weightOf(row: unknown): number | undefined {
  if (row === null || typeof row !== "object") return undefined;
  const weight = (row as { weight?: unknown }).weight;
  return typeof weight === "number" && weight >= 0 ? weight : undefined;
}

/** For each row, its weight over the sum of all weights (0 to 1); undefined for a row without one. */
export function weightShares(rows: readonly unknown[]): (number | undefined)[] {
  const weights = rows.map(weightOf);
  const total = weights.reduce<number>((sum, weight) => sum + (weight ?? 0), 0);
  return weights.map((weight) => (weight === undefined || total === 0 ? undefined : weight / total));
}
