import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

// A Turnstile widget that cannot load must never be able to lock a student out
// of email/password sign-in: the token is forwarded when it exists, and the
// server decides whether it was required.
const mockSignIn = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockAdminLogin = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/lib/queries", () => ({
  useSignIn: () => ({ mutateAsync: mockSignIn, isPending: false, error: null }),
  useAdminLogin: () => ({ mutateAsync: mockAdminLogin, isPending: false, error: null }),
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
  return render(<RouterProvider router={router} />);
}

describe("student email/password login without a captcha token", () => {
  beforeEach(() => {
    mockSignIn.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("submits the password to Supabase Auth even when Turnstile produced no token", async () => {
    renderLogin();

    const email = await screen.findByLabelText("Email");
    const password = screen.getByLabelText("Password (optional)");

    fireEvent.change(email, { target: { value: "student@school.edu" } });
    fireEvent.change(password, { target: { value: "a-long-unique-passphrase" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith({
        email: "student@school.edu",
        password: "a-long-unique-passphrase",
      }),
    );
  });
});
