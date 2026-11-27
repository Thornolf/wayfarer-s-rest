// Everything the route handlers work with, built once per server.

import { Devices } from "./auth/devices";
import { Guard } from "./auth/guard";
import { LoginLimiter } from "./auth/loginLimiter";
import { Sessions } from "./auth/sessions";
import type { Clock } from "./clock";
import type { Config } from "./config";
import { Draft } from "./content/draft";
import { ContentStore } from "./content/store";
import type { Database } from "./db/database";
import { Backups } from "./journal/backups";
import { Reports } from "./journal/reports";

export type Services = ReturnType<typeof createServices>;

export function createServices(config: Config, db: Database, now: Clock) {
  const store = new ContentStore(db, now);
  const sessions = new Sessions(db, now);
  const devices = new Devices(db, now);
  return {
    config,
    store,
    draft: new Draft(store),
    sessions,
    devices,
    guard: new Guard(sessions, devices),
    loginLimiter: new LoginLimiter(now),
    reports: new Reports(db, now),
    backups: new Backups(db, now),
  };
}
