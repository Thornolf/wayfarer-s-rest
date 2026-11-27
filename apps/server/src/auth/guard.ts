// Who is calling: the admin (session cookie), the app (device token), or nobody in particular.

import { SESSION_COOKIE, type Auth, type Device } from "@wayfarers-rest/shared";
import type { FastifyRequest } from "fastify";
import { HttpError } from "../http/errors";
import type { Devices } from "./devices";
import type { Session, Sessions } from "./sessions";

export type Principal = { kind: "public" } | { kind: "admin"; session: Session } | { kind: "device"; device: Device };

const BEARER = /^Bearer (.+)$/;

export class Guard {
  constructor(
    private readonly sessions: Sessions,
    private readonly devices: Devices,
  ) {}

  /** The caller of a request, as the route demands it; `unauthorized` when it is not who it must be. */
  authenticate(request: FastifyRequest, auth: Auth): Principal {
    if (auth === "none") return { kind: "public" };
    if (auth !== "device") {
      const cookie = request.cookies[SESSION_COOKIE];
      const session = cookie ? this.sessions.find(cookie) : undefined;
      if (session) return { kind: "admin", session };
    }
    if (auth !== "admin") {
      const token = BEARER.exec(request.headers.authorization ?? "")?.[1];
      const device = token ? this.devices.authenticate(token) : undefined;
      if (device) return { kind: "device", device };
    }
    throw new HttpError("unauthorized", auth === "device" ? "A device token is required" : "Not signed in");
  }
}

/** The session of a route that only the admin can reach. */
export function adminSession(principal: Principal): Session {
  if (principal.kind !== "admin") throw new HttpError("unauthorized", "Not signed in");
  return principal.session;
}
