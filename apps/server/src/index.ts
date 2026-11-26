// The server that runs on the Pi, reached over Tailscale: it will store the content and the
// sounds, convert uploads and receive the night reports. For now it only answers a health check.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 4600);

createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  response.writeHead(404).end();
}).listen(port, () => {
  console.log(`Wayfarer's Rest server on http://localhost:${port}`);
});
