// The typed client of the server: every call is built from the shared route table, so its path,
// its input and its answer are those of the contract. Answers are parsed with the route's schema.

import {
  apiErrorSchema,
  buildPath,
  routes,
  type ApiError,
  type ErrorCode,
  type RouteInput,
  type RouteName,
  type RouteResponse,
  type Routes,
} from "@wayfarers-rest/shared";
import type { z } from "zod";

/** The server's own codes, plus the two ways a call can fail before any code is read. */
export type FailureCode = ErrorCode | "network" | "badResponse";

/** A call that did not succeed. The admin shows the code's French sentence, never `message`. */
export class ApiFailure extends Error {
  readonly code: FailureCode;
  readonly status: number;
  readonly details: ApiError["error"]["details"];

  constructor(code: FailureCode, status: number, message: string, details?: ApiError["error"]["details"]) {
    super(message);
    this.name = "ApiFailure";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const isFailure = (error: unknown, code?: FailureCode): error is ApiFailure =>
  error instanceof ApiFailure && (code === undefined || error.code === code);

/** The routes this client can call: JSON in, JSON or nothing out. Files are fetched by their URL. */
export type CallableRoute = {
  [N in RouteName]: Routes[N] extends { body: "multipart" } | { response: "binary" } ? never : N;
}[RouteName];

type Args<N extends RouteName> = {} extends RouteInput<Routes[N]> ? [input?: RouteInput<Routes[N]>] : [input: RouteInput<Routes[N]>];
type Input = { params?: Record<string, unknown>; query?: Record<string, unknown>; headers?: Record<string, string | undefined>; body?: unknown };

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;
export type ApiClient = { call<N extends CallableRoute>(name: N, ...args: Args<N>): Promise<RouteResponse<Routes[N]>> };

async function failureOf(response: Response): Promise<ApiFailure> {
  const parsed = apiErrorSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) return new ApiFailure("badResponse", response.status, `Unreadable error (HTTP ${response.status})`);
  const { code, message, details } = parsed.data.error;
  return new ApiFailure(code, response.status, message, details);
}

/** `baseUrl` is empty when the admin is served by the server it talks to. */
export function createApiClient(fetchImpl: Fetch, baseUrl = ""): ApiClient {
  return {
    async call(name, ...args) {
      const route = routes[name];
      const input: Input = args[0] ?? {};
      const headers: Record<string, string> = { accept: "application/json" };
      for (const [key, value] of Object.entries(input.headers ?? {})) if (value !== undefined) headers[key] = value;
      const init: RequestInit = { method: route.method, headers, credentials: "same-origin" };
      if (input.body !== undefined) {
        headers["content-type"] = "application/json";
        init.body = JSON.stringify(input.body);
      }

      let response: Response;
      try {
        response = await fetchImpl(baseUrl + buildPath(route, input), init);
      } catch (error) {
        throw new ApiFailure("network", 0, error instanceof Error ? error.message : "Network error");
      }
      if (!response.ok) throw await failureOf(response);
      if (route.response === "empty") return undefined as RouteResponse<Routes[typeof name]>;

      const parsed = (route.response as z.ZodType).safeParse(await response.json().catch(() => undefined));
      if (!parsed.success) throw new ApiFailure("badResponse", response.status, `Unexpected answer from ${route.method} ${route.path}`);
      return parsed.data as RouteResponse<Routes[typeof name]>;
    },
  };
}
