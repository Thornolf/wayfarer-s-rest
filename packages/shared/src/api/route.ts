// What a route is, the types a server and a client read from it, and the builder of its URL.

import type { z } from "zod";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Who may call a route: nobody in particular, the admin (session cookie), the app (device token
 * in `Authorization: Bearer`), or either of the two.
 */
export type Auth = "none" | "admin" | "device" | "any";

export type RouteDef = {
  method: Method;
  /** With `:name` for each parameter, as Fastify writes it. */
  path: string;
  auth: Auth;
  params?: z.ZodType;
  query?: z.ZodType;
  /** The request headers the route reads, keys in lowercase. */
  headers?: z.ZodType;
  /** A JSON body, or "multipart" for a file upload. */
  body?: z.ZodType | "multipart";
  /** A JSON body, a file ("binary") or nothing at all ("empty", status 204). */
  response: z.ZodType | "binary" | "empty";
};

export const route = <const R extends RouteDef>(definition: R): R => definition;

type Part<R, K extends string, Side extends "input" | "output"> =
  R extends Record<K, infer S extends z.ZodType>
    ? Side extends "output"
      ? { [P in K]: z.output<S> }
      : {} extends z.input<S>
        ? { [P in K]?: z.input<S> }
        : { [P in K]: z.input<S> }
    : {};

/** What a client passes to call the route: params, query, headers and body, before validation. */
export type RouteInput<R extends RouteDef> = Part<R, "params", "input"> &
  Part<R, "query", "input"> &
  Part<R, "headers", "input"> &
  Part<R, "body", "input">;
/** What a handler holds once the server has parsed the request with the route's schemas. */
export type RouteRequest<R extends RouteDef> = Part<R, "params", "output"> &
  Part<R, "query", "output"> &
  Part<R, "headers", "output"> &
  Part<R, "body", "output">;
/** The JSON a route answers with; `undefined` for a file or an empty response. */
export type RouteResponse<R extends RouteDef> = R["response"] extends z.ZodType ? z.output<R["response"]> : undefined;

type Values = Record<string, unknown>;

/**
 * The path and query string of a call, e.g. `/api/reports?characterId=…&limit=30`. Values are
 * percent-encoded; an undefined query value is left out; a missing path parameter throws.
 */
export function buildPath(definition: RouteDef, input: { params?: Values; query?: Values } = {}): string {
  const path = definition.path.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) => {
    const value = input.params?.[name];
    if (value === undefined || value === null || value === "") throw new Error(`Missing path parameter "${name}" for ${definition.path}`);
    return encodeURIComponent(String(value));
  });
  const pairs = Object.entries(input.query ?? {})
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return pairs.length === 0 ? path : `${path}?${pairs.join("&")}`;
}
