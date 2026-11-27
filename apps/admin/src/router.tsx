// The router and the query cache, built once. A call refused for lack of a session, wherever it
// comes from, sends back to the login screen.

import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { isFailure } from "./api/client";
import { routeTree } from "./routeTree.gen";

export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (!isFailure(error, "unauthorized") || router.state.location.pathname === "/login") return;
      queryClient.clear();
      void router.navigate({ to: "/login", search: { redirect: router.state.location.href } });
    },
  }),
  defaultOptions: {
    queries: { retry: (count, error) => !isFailure(error) && count < 2, staleTime: 5_000, refetchOnWindowFocus: false },
  },
});

export const router = createRouter({ routeTree, context: { queryClient }, defaultPreload: "intent", defaultPreloadStaleTime: 0 });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
