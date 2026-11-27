// The one client the admin calls. It talks to the server that serves the admin (or, in
// development, to the one Vite proxies to); `npm run dev:fake` swaps in the in-memory fake, which
// a production build never loads.

import { createApiClient, type Fetch } from "./client";

export const usesFakeServer = Boolean(import.meta.env.VITE_FAKE_API);

// Written on the build flag itself so that the bundler drops the import, and the fake with it.
const fetchImpl: Fetch = import.meta.env.VITE_FAKE_API ? (await import("../fake/devServer")).devServer.fetch : (url, init) => fetch(url, init);

export const api = createApiClient(fetchImpl);
