// Registers handlers from the route table of the shared contract: the path and the method come
// from the table, the caller is checked as the route demands, and params, query, headers and body
// are parsed with the route's schemas before the handler runs.

import { routes, type RouteDef, type RouteName, type RouteRequest, type RouteResponse, type Routes } from "@wayfarers-rest/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Guard, Principal } from "../auth/guard";
import { HttpError, fieldErrors } from "./errors";

/** What a handler returns instead of a body to answer 304. */
export const NOT_MODIFIED = Symbol("notModified");

export type Call<R extends RouteDef> = RouteRequest<R> & {
  principal: Principal;
  /** To set a status other than 200 or a header; the body is what the handler returns. */
  reply: FastifyReply;
};
type Answer<R extends RouteDef> = RouteResponse<R> | typeof NOT_MODIFIED;
export type Handler<R extends RouteDef> = (call: Call<R>) => Answer<R> | Promise<Answer<R>>;

export type Api = { handle<N extends RouteName>(name: N, handler: Handler<Routes[N]>): void };

const PARTS = ["params", "query", "headers", "body"] as const;

export function createApi(app: FastifyInstance, guard: Guard): Api {
  return {
    handle(name, handler) {
      const route: RouteDef = routes[name];
      app.route({
        method: route.method,
        url: route.path,
        handler: async (request, reply) => {
          const call: Record<string, unknown> = { principal: guard.authenticate(request, route.auth), reply };
          for (const part of PARTS) {
            const schema = route[part];
            if (schema === undefined || schema === "multipart") continue;
            const parsed = schema.safeParse(request[part]);
            if (!parsed.success) throw new HttpError("badRequest", `The ${part} do not fit the contract`, { fields: fieldErrors(parsed.error) });
            call[part] = parsed.data;
          }
          const answer = await handler(call as Parameters<typeof handler>[0]);
          if (answer === NOT_MODIFIED) return reply.code(304).send();
          if (route.response === "empty") return reply.code(204).send();
          return reply.send(answer);
        },
      });
    },
  };
}
