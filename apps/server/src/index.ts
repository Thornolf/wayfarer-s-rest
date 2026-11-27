// The server that runs on the Pi, reached over Tailscale: it stores the content, publishes it to
// the app and receives the night reports.

import { buildApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig(process.env);
const app = await buildApp(config);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "shutting down");
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ host: config.host, port: config.port });
