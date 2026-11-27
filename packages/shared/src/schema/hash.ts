// The fingerprint of a catalog. A night is its seed plus the catalog it was generated from: the
// fingerprint is stored with the night to tell which catalog that was.

import { cyrb128 } from "../rng";
import type { Catalog } from "./catalog";

/**
 * JSON with the keys of every object sorted, so two objects with the same content give the same
 * text whatever order their keys were written in. Array order is kept: it is part of the content.
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((element) => stableStringify(element ?? null)).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const object = value as Record<string, unknown>;
    const entries = Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** 32 hexadecimal characters that change whenever the value does, whatever the order of its keys. */
export function fingerprint(value: unknown): string {
  return cyrb128(stableStringify(value))
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("");
}

/**
 * The fingerprint of a catalog. Hash a parsed catalog (`parseCatalog`), so that a default left out
 * of the JSON does not change the result.
 */
export function catalogHash(catalog: Catalog): string {
  return fingerprint(catalog);
}
