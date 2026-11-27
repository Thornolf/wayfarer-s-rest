// Everything the server reads from its environment. Nothing else in the code looks at process.env.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type Config = {
  /** 127.0.0.1 by default: Tailscale Serve is the only way in, so its identity headers cannot be forged. */
  host: string;
  port: number;
  /** Where the database (and later the sounds) live. */
  dataDir: string;
  /** `scrypt:<salt>:<key>` as printed by `npm run hash-password`; null means nobody can sign in. */
  adminPasswordHash: string | null;
  /** When set, every request under /api and /files must carry this Tailscale-User-Login. */
  allowedTailscaleLogin: string | null;
  /** False only for development over plain http, where a browser would drop a Secure cookie. */
  secureCookie: boolean;
  /** Reported by /health: the commit when the deployment sets it, otherwise the package version. */
  codeVersion: string;
  logLevel: string;
};

const SERVER_ROOT = resolve(import.meta.dirname, "..");

function packageVersion(): string {
  return (JSON.parse(readFileSync(join(SERVER_ROOT, "package.json"), "utf8")) as { version: string }).version;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const port = Number(env.PORT ?? 4600);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`PORT must be a port number, got "${env.PORT}"`);
  return {
    host: env.HOST || "127.0.0.1",
    port,
    dataDir: resolve(env.DATA_DIR || join(SERVER_ROOT, "data")),
    adminPasswordHash: env.ADMIN_PASSWORD_HASH || null,
    allowedTailscaleLogin: env.ALLOWED_TAILSCALE_LOGIN || null,
    secureCookie: env.COOKIE_SECURE !== "false",
    codeVersion: env.CODE_VERSION || packageVersion(),
    logLevel: env.LOG_LEVEL || "info",
  };
}
