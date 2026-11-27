// A stand-in for the server of apps/server that lives in memory and follows the shared contract:
// same routes, same schemas, same error codes. The admin runs on it in development
// (`npm run dev:fake`) and its tests call it through the real client. Sound files, packs, reports
// and devices are not played: their routes answer `notFound`.

import {
  CATALOGUE_SCHEMA_VERSION,
  COLLECTION_NAMES,
  COLLECTIONS,
  ERROR_STATUS,
  apiError,
  etagMatches,
  parseCatalog,
  routes,
  settingsSchema,
  versionEtag,
  type ApiError,
  type Catalog,
  type CatalogueSync,
  type CollectionName,
  type Entry,
  type ErrorCode,
  type RouteDef,
  type RouteName,
  type RouteRequest,
  type RouteResponse,
  type Routes,
} from "@wayfarers-rest/shared";
import type { z } from "zod";
import type { Fetch } from "../api/client";
import { formatPath } from "../editor/paths";
import { checkDraft, issueKey, referenceIssues } from "./check";
import { FAKE_PASSWORD } from "./password";
import { createStore, type Side, type Store } from "./store";

export type FakeOptions = {
  /** The draft to start from; without it the server is empty, as before its first import. */
  catalog?: Catalog;
  /** Publishes the starting draft at once, so the admin opens on "nothing to publish". */
  published?: boolean;
  password?: string;
  /** The clock, for tests that compare timestamps. */
  now?: () => string;
  /** Where the session lives between two page loads; in memory when absent. */
  session?: { get(): boolean; set(signedIn: boolean): void };
};

const SESSION_HOURS = 12;

class Refusal extends Error {
  readonly code: ErrorCode;
  readonly details: ApiError["error"]["details"];

  constructor(code: ErrorCode, message: string, details?: ApiError["error"]["details"]) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

type Reply<T> = { status: number; body: T; headers?: Record<string, string> };
type Handlers = { [N in RouteName]?: (request: RouteRequest<Routes[N]>) => Reply<RouteResponse<Routes[N]>> };

const ok = <T>(body: T, headers?: Record<string, string>): Reply<T> => ({ status: 200, body, ...(headers ? { headers } : {}) });
const created = <T>(body: T): Reply<T> => ({ status: 201, body });
const empty = (): Reply<undefined> => ({ status: 204, body: undefined });

function plainText(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Refuses a write whose `If-Match` names another version than the one held ("0": must not exist). */
function guardVersion(header: string | undefined, current: number): void {
  if (header !== undefined && !etagMatches(header, current)) {
    throw new Refusal("versionConflict", `If-Match ${header} does not match version ${current}`);
  }
}

function parseContent<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields = result.error.issues.map((issue) => ({ path: formatPath(issue.path as (string | number)[]), message: issue.message }));
  throw new Refusal("invalidContent", "The content does not fit its schema", { fields });
}

function handlersOf(store: Store, options: FakeOptions): Handlers {
  const now = options.now ?? (() => new Date().toISOString());
  const password = options.password ?? FAKE_PASSWORD;
  const session = () => ({ expiresAt: new Date(Date.parse(now()) + SESSION_HOURS * 3_600_000).toISOString() });

  const mustFind = (collection: CollectionName, id: string): Entry => {
    const entry = store.entry(collection, id);
    if (!entry) throw new Refusal("notFound", `No ${collection}/${id}`);
    return entry;
  };

  /** Refuses a draft that would hold reference errors the current one does not have. */
  const guardReferences = (candidate: Record<string, unknown>): void => {
    const known = new Set(referenceIssues(store.catalog()).map(issueKey));
    const added = referenceIssues(candidate).filter((issue) => issue.severity === "error" && !known.has(issueKey(issue)));
    if (added.length > 0) throw new Refusal("brokenReferences", "The write adds broken references", { issues: added });
  };

  const withItem = (collection: CollectionName, item: Record<string, unknown>): Record<string, unknown> => {
    const catalog = store.catalog();
    const others = (catalog[collection] as Record<string, unknown>[]).filter((other) => other.id !== item.id);
    return { ...catalog, [collection]: [...others, item] };
  };

  const sync = (side: Side, since: number, ifNoneMatch: string | undefined): Reply<CatalogueSync> => {
    const version = side === "draft" ? store.draftVersion() : (store.published()?.version ?? 0);
    const headers = { etag: versionEtag(version) };
    if (etagMatches(ifNoneMatch, version)) return { status: 304, body: undefined as never, headers };
    const changes = COLLECTION_NAMES.flatMap((collection) => store.entries(collection, side))
      .filter((entry) => entry.version > since)
      .map(({ collection, id, version: written, archived, data }) => ({ collection, id, version: written, archived, data }));
    const settings = store.settings(side);
    return ok(
      {
        version,
        schemaVersion: CATALOGUE_SCHEMA_VERSION,
        changes,
        settings: settings && settings.version > since ? { version: settings.version, data: settings.data } : null,
      },
      headers,
    );
  };

  const setArchived = (collection: CollectionName, id: string, archived: boolean) => {
    const entry = mustFind(collection, id);
    return ok({ entry: entry.archived === archived ? entry : store.write(collection, { ...entry.data, archived }) });
  };

  const settingsDetail = () => {
    const settings = store.settings();
    if (!settings) throw new Refusal("notFound", "No settings yet");
    return { settings, published: store.settings("published") };
  };

  const publicationState = () => ({ draftVersion: store.draftVersion(), published: store.published(), changes: store.changes() });
  const health = () =>
    ok({ status: "ok" as const, codeVersion: "fake", schemaVersion: CATALOGUE_SCHEMA_VERSION, catalogueVersion: store.published()?.version ?? 0 });

  return {
    health,
    apiHealth: health,

    login: ({ body }) => {
      if (body.password !== password) throw new Refusal("unauthorized", "Wrong password");
      options.session?.set(true);
      return ok(session());
    },
    session: () => ok(session()),
    logout: () => {
      options.session?.set(false);
      return empty();
    },

    catalogue: ({ query, headers }) => sync("published", query.since ?? 0, headers["if-none-match"]),
    draftCatalogue: ({ query, headers }) => sync("draft", query.since ?? 0, headers["if-none-match"]),

    listEntries: ({ params, query }) => {
      const archived = query.archived ?? "exclude";
      const search = plainText(query.search ?? "");
      const entries = store.entries(params.collection).filter((entry) => {
        if (archived !== "include" && entry.archived !== (archived === "only")) return false;
        if (query.aiGenerated !== undefined && entry.aiGenerated !== query.aiGenerated) return false;
        return search === "" || plainText(JSON.stringify(entry.data)).includes(search);
      });
      return ok({ entries });
    },
    getEntry: ({ params }) =>
      ok({
        entry: mustFind(params.collection, params.id),
        published: store.entry(params.collection, params.id, "published"),
        revisions: store.revisions(params.collection, params.id),
      }),
    putEntry: ({ params, headers, body }) => {
      if (body.data.id !== params.id) throw new Refusal("badRequest", "data.id must be the id of the path");
      const existing = store.entry(params.collection, params.id);
      guardVersion(headers["if-match"], existing?.version ?? 0);
      const data = parseContent(COLLECTIONS[params.collection].schema, body.data);
      guardReferences(withItem(params.collection, data));
      const entry = store.write(params.collection, data);
      return existing ? ok({ entry }) : created({ entry });
    },
    archiveEntry: ({ params }) => setArchived(params.collection, params.id, true),
    unarchiveEntry: ({ params }) => setArchived(params.collection, params.id, false),

    getSettings: () => ok(settingsDetail()),
    putSettings: ({ headers, body }) => {
      guardVersion(headers["if-match"], store.settings()?.version ?? 0);
      const data = parseContent(settingsSchema, body.data);
      guardReferences({ ...store.catalog(), settings: data });
      store.writeSettings(data);
      return ok(settingsDetail());
    },

    check: () => ok({ draftVersion: store.draftVersion(), issues: checkDraft(store) }),
    publication: () => ok(publicationState()),
    publish: ({ body }) => {
      if (body.draftVersion !== store.draftVersion()) throw new Refusal("versionConflict", "The draft moved since it was read");
      const errors = checkDraft(store).filter((issue) => issue.severity === "error");
      if (errors.length > 0) throw new Refusal("publishBlocked", "The draft has errors", { issues: errors });
      store.publish();
      return ok(publicationState());
    },
    exportCatalogue: () => ok({ draftVersion: store.draftVersion(), exportedAt: now(), catalog: parseCatalog(store.catalog()) }),
  };
}

// --- From a request to a handler -------------------------------------------------------------

type Matcher = { name: RouteName; route: RouteDef; pattern: RegExp; params: string[] };

const MATCHERS: Matcher[] = (Object.entries(routes) as [RouteName, RouteDef][]).map(([name, route]) => {
  const params: string[] = [];
  const source = route.path.replace(/[.]/g, "\\.").replace(/:([A-Za-z0-9_]+)/g, (_, param: string) => {
    params.push(param);
    return "([^/]+)";
  });
  return { name, route, pattern: new RegExp(`^${source}$`), params };
});

function parsePart(schema: z.ZodType | "multipart" | undefined, value: unknown, part: string): unknown {
  if (schema === undefined || schema === "multipart") return undefined;
  const result = schema.safeParse(value);
  if (!result.success) throw new Refusal("badRequest", `Invalid ${part}: ${result.error.issues[0]?.message ?? ""}`);
  return result.data;
}

function respond({ status, body, headers }: Reply<unknown>): Response {
  const json = body === undefined ? null : JSON.stringify(body);
  return new Response(json, { status, headers: { ...(json === null ? {} : { "content-type": "application/json" }), ...headers } });
}

export type FakeServer = { fetch: Fetch; store: Store };

export function createFakeServer(options: FakeOptions = {}): FakeServer {
  const store = createStore(options.now ?? (() => new Date().toISOString()));
  if (options.catalog) store.seed(options.catalog);
  if (options.published) store.publish();

  let signedIn = false;
  const session = options.session ?? { get: () => signedIn, set: (value: boolean) => void (signedIn = value) };
  const handlers = handlersOf(store, { ...options, session }) as Record<string, ((request: unknown) => Reply<unknown>) | undefined>;

  const handle = (url: string, init: RequestInit): Reply<unknown> => {
    const { pathname, searchParams } = new URL(url, "http://fake.invalid");
    for (const { name, route, pattern, params } of MATCHERS) {
      const match = route.method === (init.method ?? "GET") ? pattern.exec(pathname) : null;
      if (!match) continue;
      const needsAdmin = route.auth === "admin" || route.auth === "any";
      if (needsAdmin && !session.get()) throw new Refusal("unauthorized", "No session");
      const handler = handlers[name];
      if (!handler || route.auth === "device") throw new Refusal("notFound", `The fake server does not play ${name}`);
      const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([key, value]) => [key.toLowerCase(), value]));
      return handler({
        params: parsePart(route.params, Object.fromEntries(params.map((param, index) => [param, decodeURIComponent(match[index + 1] as string)])), "params"),
        query: parsePart(route.query, Object.fromEntries(searchParams), "query"),
        headers: parsePart(route.headers, headers, "headers"),
        body: parsePart(route.body, typeof init.body === "string" ? JSON.parse(init.body) : undefined, "body"),
      });
    }
    throw new Refusal("notFound", `No route for ${init.method ?? "GET"} ${pathname}`);
  };

  return {
    store,
    fetch: async (url, init) => {
      try {
        return respond(handle(url, init));
      } catch (error) {
        if (!(error instanceof Refusal)) throw error;
        return respond({ status: ERROR_STATUS[error.code], body: apiError(error.code, error.message, error.details) });
      }
    },
  };
}
