// The fake server of `npm run dev:fake`: the starter world, already published, so the admin can be
// worked on without the Pi. What is edited lives in memory and is gone on reload; the session
// stays for the tab.

import { loadStarterCatalog } from "@wayfarers-rest/shared/starter";
import { createFakeServer } from "./fakeServer";

const SESSION_KEY = "wr-fake-session";

export const devServer = createFakeServer({
  catalog: loadStarterCatalog(),
  published: true,
  session: {
    get: () => sessionStorage.getItem(SESSION_KEY) === "1",
    set: (signedIn) => (signedIn ? sessionStorage.setItem(SESSION_KEY, "1") : sessionStorage.removeItem(SESSION_KEY)),
  },
});
