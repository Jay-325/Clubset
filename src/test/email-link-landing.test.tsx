import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

vi.mock("@/lib/queries", () => ({
  useSignIn: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useAdminLogin: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useGoogleSignIn: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  normalizeAuthError: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong. Please try again.",
}));

vi.mock("@/lib/auth/context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useIsSignedOut: () => true,
  useAuth: () => ({
    session: null,
    profile: null,
    isLoading: false,
    isConfigured: true,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

function renderLogin() {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ["/login"] }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("an expired email link lands on /login", () => {
  it("explains the expired link instead of reporting a failed Google sign-in", async () => {
    window.history.replaceState({}, "", "/login#error=access_denied&error_code=otp_expired");
    renderLogin();

    expect(await screen.findByText(/link is invalid or has expired/i)).toBeTruthy();
    expect(screen.queryByText(/Google sign-in didn't complete/i)).toBeNull();
  });
});
