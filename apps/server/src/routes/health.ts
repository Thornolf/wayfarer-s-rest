import { CATALOGUE_SCHEMA_VERSION, type Health } from "@wayfarers-rest/shared";
import type { Api } from "../http/api";
import type { Services } from "../services";

export function healthRoutes(api: Api, { config, store }: Services): void {
  const health = (): Health => ({
    status: "ok",
    codeVersion: config.codeVersion,
    schemaVersion: CATALOGUE_SCHEMA_VERSION,
    catalogueVersion: store.publication()?.version ?? 0,
  });
  api.handle("health", health);
  api.handle("apiHealth", health);
}
