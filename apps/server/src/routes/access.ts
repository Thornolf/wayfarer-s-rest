// Signing in and out of the admin, and the device tokens the admin hands to the app.

import { SESSION_COOKIE } from "@wayfarers-rest/shared";
import { adminSession } from "../auth/guard";
import { verifyPassword } from "../auth/password";
import type { Api } from "../http/api";
import { HttpError } from "../http/errors";
import type { Services } from "../services";

export function accessRoutes(api: Api, { config, sessions, devices, loginLimiter }: Services): void {
  const cookieOptions = { path: "/", httpOnly: true, secure: config.secureCookie, sameSite: "strict" } as const;

  api.handle("login", ({ body, reply }) => {
    if (loginLimiter.blocked()) throw new HttpError("rateLimited", "Too many wrong passwords, try again in a minute");
    if (!verifyPassword(body.password, config.adminPasswordHash)) {
      loginLimiter.recordFailure();
      throw new HttpError("unauthorized", "Wrong password");
    }
    const session = sessions.open();
    reply.setCookie(SESSION_COOKIE, session.token, { ...cookieOptions, expires: new Date(session.expiresAt) });
    return { expiresAt: session.expiresAt };
  });

  api.handle("session", ({ principal }) => ({ expiresAt: adminSession(principal).expiresAt }));

  api.handle("logout", ({ principal, reply }) => {
    sessions.close(adminSession(principal).token);
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    return undefined;
  });

  api.handle("listDevices", () => ({ devices: devices.list() }));

  api.handle("createDevice", ({ body, reply }) => {
    reply.code(201);
    return devices.create(body.name);
  });

  api.handle("revokeDevice", ({ params }) => {
    if (!devices.revoke(params.deviceId)) throw new HttpError("notFound", `No device "${params.deviceId}"`);
    return undefined;
  });
}
