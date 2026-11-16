import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
} from "@tanstack/react-router";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/lib/auth/context";

// A session produced by an emailed link is the app's input here: the Supabase
// client has already consumed the URL fragment, and AuthProvider must route the
// verified student into onboarding.
const mockGetSession = vi.hoisted(() => vi.fn());
const mockGetUser = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());
const mockSingle = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: { getSession: mockGetSession, getUser: mockGetUser },
    from: () => ({ select: () => ({ eq: () => ({ single: mockSingle }) }) }),
    rpc: mockRpc,
  }),
  isSupabaseConfigured: () => true,
}));

const session = {
  user: { id: "student-1", email_confirmed_at: "2026-11-15T00:00:00.000Z" },
};

function buildRouter() {
  const rootRoute = createRootRoute({
    component: () => (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
  });
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: () => null,
  });
  const onboardingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/onboarding",
    component: () => null,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([loginRoute, onboardingRoute]),
    history: createMemoryHistory({ initialEntries: ["/login"] }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session } });
  mockGetUser.mockResolvedValue({ data: { user: session.user } });
  mockSingle.mockResolvedValue({
    data: {
      id: "student-1",
      account_type: "student",
      onboarding_complete: false,
    },
    error: null,
  });
  // Not on the administrator allowlist: the handshake runs and refuses.
  mockRpc.mockResolvedValue({ error: { message: "not on the allowlist" } });
});

afterEach(() => {
  cleanup();
});

describe("a verified email session", () => {
  it("routes an incomplete student profile into onboarding and still runs the activation handshake", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = buildRouter();

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(router.state.location.pathname).toBe("/onboarding"));
    expect(mockRpc).toHaveBeenCalledWith("activate_administrator");
  });
});
