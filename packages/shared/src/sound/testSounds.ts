// Sound files for the tests: the starter world has categories but no sound yet.

import type { Catalog } from "../schema/catalog";
import type { Sound } from "../schema/sound";

/** The catalog with a few sounds in every category, except the ones to leave empty. */
export function withSounds(catalog: Catalog, options: { perCategory?: number; empty?: readonly string[] } = {}): Catalog {
  // Steps and hooves loop for the whole scene, like the categories they fall back on.
  const looping = new Set<string | undefined>(
    catalog.sceneTemplates.filter((scene) => scene.kind === "walk" || scene.kind === "ride").map((scene) => scene.actionCategory),
  );
  for (const category of catalog.soundCategories) if (looping.has(category.id)) looping.add(category.fallback);
  const sounds = catalog.soundCategories
    .filter((category) => !options.empty?.includes(category.id))
    .flatMap((category) =>
      Array.from({ length: options.perCategory ?? 3 }, (_, n): Sound => {
        const loop = category.layer === "ambience" || looping.has(category.id);
        return {
          id: `${category.id}-${n + 1}`,
          archived: false,
          aiGenerated: false,
          file: `${category.id}-${n + 1}.m4a`,
          category: category.id,
          loop,
          duration: loop ? 40 + 7 * n : 1.5 + n,
          // Low enough to stay under every category's maximum, so that the variations show.
          volume: 0.4,
          weight: n === 0 ? 2 : 1,
          active: true,
        };
      }),
    );
  return { ...catalog, sounds };
}
