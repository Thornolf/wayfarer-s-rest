// A real server on a temporary data directory, and clients that call it through the route table of
// the contract: every answer is parsed with the schema the admin and the app will parse it with.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import {
  ERROR_STATUS,
  SESSION_COOKIE,
  apiErrorSchema,
  buildPath,
  deviceAuthorization,
  routes,
  type ApiError,
  type RouteDef,
  type RouteInput,
  type RouteName,
  type RouteResponse,
  type Routes,
} from "@wayfarers-rest/shared";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { hashPassword } from "../auth/password";
import type { Config } from "../config";

export const ADMIN_PASSWORD = "correct horse battery";
const ADMIN_PASSWORD_HASH = hashPassword(ADMIN_PASSWORD);

type Headers = Record<string, string>;
type LooseInput = { params?: Record<string, unknown>; query?: Record<string, unknown>; headers?: Headers; body?: unknown };
type Args<N extends RouteName> = {} extends RouteInput<Routes[N]> ? [input?: RouteInput<Routes[N]>] : [input: RouteInput<Routes[N]>];

export class Client {
  constructor(
    private readonly app: FastifyInstance,
    private readonly credentials: Headers = {},
  ) {}

  /** The raw answer, for what the contract does not carry: cookies, a 304. */
  send<N extends RouteName>(name: N, ...[input]: Args<N>) {
    const route: RouteDef = routes[name];
    const { params, query, headers, body } = (input ?? {}) as LooseInput;
    return this.app.inject({
      method: route.method,
      url: buildPath(route, { params, query }),
      headers: { ...headers, ...this.credentials },
      payload: body as object | undefined,
    });
  }

  /** Calls a route that must succeed and returns its parsed body. */
  async ok<N extends RouteName>(name: N, ...args: Args<N>): Promise<{ status: number; headers: Headers; body: RouteResponse<Routes[N]> }> {
    const response = await this.send(name, ...args);
    assert.ok(response.statusCode >= 200 && response.statusCode < 300, `${name} answered ${response.statusCode}: ${response.body}`);
    const schema = routes[name].response;
    const body = typeof schema === "string" ? undefined : schema.parse(response.json());
    return { status: response.statusCode, headers: response.headers as Headers, body: body as RouteResponse<Routes[N]> };
  }

  /** Calls a route that must be refused and returns the error, checked against its status. */
  async fail<N extends RouteName>(name: N, ...args: Args<N>): Promise<ApiError["error"]> {
    const response = await this.send(name, ...args);
    assert.ok(response.statusCode >= 400, `${name} answered ${response.statusCode}: ${response.body}`);
    const { error } = apiErrorSchema.parse(response.json());
    assert.equal(response.statusCode, ERROR_STATUS[error.code]);
    return error;
  }
}

export type TestServer = Awaited<ReturnType<typeof startTestServer>>;

/** Starts a server that is closed, and its data removed, when the test ends. */
export async function startTestServer(t: TestContext, overrides: Partial<Config> = {}) {
  const dataDir = overrides.dataDir ?? mkdtempSync(join(tmpdir(), "wayfarer-test-"));
  const config: Config = {
    host: "127.0.0.1",
    port: 0,
    dataDir,
    adminPasswordHash: ADMIN_PASSWORD_HASH,
    allowedTailscaleLogin: null,
    secureCookie: true,
    codeVersion: "test",
    logLevel: "info",
    ...overrides,
  };
  let time = Date.parse("2026-11-27T22:00:00.000Z");
  const logs: string[] = [];
  const app = await buildApp(config, { now: () => new Date(time), logStream: { write: (line) => logs.push(line) } });
  t.after(async () => {
    await app.close();
    if (!overrides.dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  const anonymous = new Client(app);
  return {
    app,
    config,
    logs,
    anonymous,
    advance(milliseconds: number): void {
      time += milliseconds;
    },
    /** A client that sends more headers with every call. */
    with: (headers: Headers) => new Client(app, headers),
    /** Signs in with the admin password and returns a client that carries the session cookie. */
    async signIn(): Promise<Client> {
      const response = await anonymous.send("login", { body: { password: ADMIN_PASSWORD } });
      const session = response.cookies.find((cookie) => cookie.name === SESSION_COOKIE);
      assert.ok(session, `login answered ${response.statusCode}: ${response.body}`);
      return new Client(app, { cookie: `${SESSION_COOKIE}=${session.value}` });
    },
    /** Creates a device token and returns a client that sends it, as the app does. */
    async pairDevice(admin: Client, name = "iPhone"): Promise<Client> {
      const { body } = await admin.ok("createDevice", { body: { name } });
      return new Client(app, { authorization: deviceAuthorization(body.token) });
    },
  };
}
