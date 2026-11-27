// Builds the server: the database of the data directory, the starter world on first start, and
// every route of the shared contract that is implemented so far.

import cookie from "@fastify/cookie";
import { ERROR_STATUS, apiError, type ErrorCode } from "@wayfarers-rest/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { systemClock, type Clock } from "./clock";
import type { Config } from "./config";
import { seedStarterWorld } from "./content/seed";
import { openDatabase } from "./db/database";
import { createApi } from "./http/api";
import { HttpError } from "./http/errors";
import { accessRoutes } from "./routes/access";
import { catalogueRoutes } from "./routes/catalogue";
import { collectionRoutes } from "./routes/collections";
import { healthRoutes } from "./routes/health";
import { journalRoutes } from "./routes/journal";
import { publicationRoutes } from "./routes/publication";
import { createServices } from "./services";

/** A night report holds a whole night: a few hundred kilobytes. */
const BODY_LIMIT = 8 * 1024 * 1024;
/** Set by Tailscale Serve, which drops the one a client would send. */
const TAILSCALE_LOGIN = "tailscale-user-login";
/** Stays open for systemd and curl on the Pi itself, where no Tailscale header exists. */
const LOCAL_HEALTH = "/health";

export type AppOptions = {
  now?: Clock;
  /** Where the log goes instead of the standard output. */
  logStream?: { write(line: string): void };
};

function codeOfStatus(status: number): ErrorCode {
  if (status === 404) return "notFound";
  if (status === 413) return "payloadTooLarge";
  if (status === 415) return "unsupportedMedia";
  return status >= 400 && status < 500 ? "badRequest" : "internal";
}

export async function buildApp(config: Config, options: AppOptions = {}): Promise<FastifyInstance> {
  const now = options.now ?? systemClock;
  const app = Fastify({
    bodyLimit: BODY_LIMIT,
    logger: {
      level: config.logLevel,
      stream: options.logStream,
      serializers: {
        req: (request) => ({ method: request.method, url: request.url, tailscaleLogin: request.headers[TAILSCALE_LOGIN] }),
      },
    },
  });

  const db = openDatabase(config.dataDir);
  app.addHook("onClose", () => db.close());
  const services = createServices(config, db, now);
  if (seedStarterWorld(db, services.store)) app.log.info({ version: services.store.draftVersion() }, "seeded and published the starter world");
  if (!config.adminPasswordHash) app.log.warn("ADMIN_PASSWORD_HASH is not set: nobody can sign in to the admin");

  app.addHook("onRequest", async (request) => {
    const allowed = config.allowedTailscaleLogin;
    if (allowed && request.url.split("?")[0] !== LOCAL_HEALTH && request.headers[TAILSCALE_LOGIN] !== allowed) {
      throw new HttpError("forbidden", "This Tailscale user is not allowed here");
    }
  });

  app.setNotFoundHandler((request, reply) => reply.code(404).send(apiError("notFound", `No route ${request.method} ${request.url}`)));
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    if (error instanceof HttpError) return reply.code(error.status).send(error.body);
    const code = codeOfStatus(error.statusCode ?? 500);
    if (code === "internal") request.log.error(error);
    return reply.code(ERROR_STATUS[code]).send(apiError(code, code === "internal" ? "Internal error" : error.message));
  });

  await app.register(cookie);
  const api = createApi(app, services.guard);
  healthRoutes(api, services);
  accessRoutes(api, services);
  catalogueRoutes(api, services);
  collectionRoutes(api, services);
  publicationRoutes(api, services, now);
  journalRoutes(api, services);
  return app;
}
