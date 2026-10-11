import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Keep freshly loaded data usable for a short window so moving between
        // screens renders instantly instead of flashing a skeleton every time.
        // Mutations still invalidate explicitly, so writes are never stale.
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        // A failed read is usually a real problem (RLS, missing row) rather
        // than a blip, so show the error immediately instead of retrying.
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload a route's loader as soon as the user hovers a link so the data
    // request is already in flight by the time the click lands.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
