import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import { normalizeEmail } from "./queries";

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

const mockIs = vi.fn();
const mockSelect = vi.fn(() => ({ is: mockIs }));
const mockUpdate = vi.fn(() => ({ eq: mockEq }));
const mockEq = vi.fn(() => ({ error: null }));
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  update: mockUpdate,
})) as any;

const mockAssertPasswordNotBreached = vi.hoisted(() => vi.fn());
const mockSignUp = vi.hoisted(() => vi.fn().mockResolvedValue({ data: null, error: null }));
const mockUpdateUser = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
const mockEnforceAuthRateLimit = vi.hoisted(() => vi.fn().mockResolvedValue({ allowed: true }));
const mockOAuthRedirectUrl = vi.hoisted(() => vi.fn(() => "http://localhost/login"));

vi.mock("@/lib/security/passwords", () => ({
  assertPasswordNotBreached: mockAssertPasswordNotBreached,
}));

vi.mock("@/lib/security/auth-rate-limit.functions", () => ({
  enforceAuthRateLimit: mockEnforceAuthRateLimit,
  RATE_LIMITED_MESSAGE: "Too many requests. Please wait a moment and try again.",
}));

vi.mock("@/lib/auth/oauth", () => ({
  OAUTH_PROVIDER: "google",
  oauthRedirectUrl: mockOAuthRedirectUrl,
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: vi.fn(() => ({
    from: mockFrom,
    auth: {
      signUp: mockSignUp,
      updateUser: mockUpdateUser,
    },
  })),
}));

import { getSupabaseClient } from "@/lib/supabase/client";
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationRead,
  useSignUp,
  useChangePassword,
  normalizeAuthError,
  useGoogleSignIn,
} from "./queries";

const mockedGetSupabaseClient = vi.mocked(getSupabaseClient);
const mockedEnforceAuthRateLimit = vi.mocked(mockEnforceAuthRateLimit);
const mockedOAuthRedirectUrl = vi.mocked(mockOAuthRedirectUrl);

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIs.mockReturnValue({ count: 3, error: null });
  mockSelect.mockReturnValue({ is: mockIs });
  mockFrom.mockReturnValue({
    select: mockSelect,
    update: mockUpdate,
  });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ error: null });
  mockedGetSupabaseClient.mockReturnValue({
    from: mockFrom,
    auth: { signUp: mockSignUp, updateUser: mockUpdateUser },
  } as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// normalizeEmail (existing tests)
// ---------------------------------------------------------------------------

describe("normalizeEmail", () => {
  it("lowercases an uppercase email", () => {
    expect(normalizeEmail("USER@SCHOOL.EDU")).toBe("user@school.edu");
  });

  it("lowercases a mixed-case email", () => {
    expect(normalizeEmail("User.Name@School.Edu")).toBe("user.name@school.edu");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeEmail("  user@school.edu  ")).toBe("user@school.edu");
  });

  it("trims and lowercases combined", () => {
    expect(normalizeEmail("  USER@SCHOOL.EDU  ")).toBe("user@school.edu");
  });

  it("leaves an already-normalized email unchanged", () => {
    expect(normalizeEmail("user@school.edu")).toBe("user@school.edu");
  });

  it("returns an empty string for empty input", () => {
    expect(normalizeEmail("")).toBe("");
  });

  it("trims whitespace-only input to an empty string", () => {
    expect(normalizeEmail("   ")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// useUnreadNotificationCount
// ---------------------------------------------------------------------------

describe("useUnreadNotificationCount", () => {
  it("returns the unread count from the database", async () => {
    mockIs.mockReturnValue({ count: 3, error: null });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const wrapper = makeWrapper(queryClient);

    const { result } = renderHook(() => useUnreadNotificationCount(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBe(3);
    expect(mockFrom).toHaveBeenCalledWith("notifications");
    expect(mockSelect).toHaveBeenCalledWith("*", {
      count: "exact",
      head: true,
    });
    expect(mockIs).toHaveBeenCalledWith("read_at", null);
  });

  it("returns zero when the database reports no unread notifications", async () => {
    mockIs.mockReturnValue({ count: 0, error: null });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const wrapper = makeWrapper(queryClient);

    const { result } = renderHook(() => useUnreadNotificationCount(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBe(0);
  });

  it("returns zero when count is null", async () => {
    mockIs.mockReturnValue({ count: null, error: null });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const wrapper = makeWrapper(queryClient);

    const { result } = renderHook(() => useUnreadNotificationCount(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBe(0);
  });

  it("does not fetch full notification records (head-only count query)", async () => {
    mockIs.mockReturnValue({ count: 5, error: null });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const wrapper = makeWrapper(queryClient);

    const { result } = renderHook(() => useUnreadNotificationCount(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // `head: true` means no data rows are requested
    expect(mockSelect).toHaveBeenCalledWith("*", {
      count: "exact",
      head: true,
    });
  });

  it("throws on database error", async () => {
    mockIs.mockReturnValue({ count: null, error: new Error("DB down") });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const wrapper = makeWrapper(queryClient);

    const { result } = renderHook(() => useUnreadNotificationCount(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe("DB down");
  });
});

// ---------------------------------------------------------------------------
// useMarkNotificationRead invalidation
// ---------------------------------------------------------------------------

describe("useMarkNotificationRead invalidation", () => {
  it("invalidates both the full-list and unread-count query keys", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = makeWrapper(queryClient);

    const { result } = renderHook(() => useMarkNotificationRead(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync("notif-123");
    });

    expect(mockUpdate).toHaveBeenCalledWith({ read_at: expect.any(String) });
    expect(mockEq).toHaveBeenCalledWith("id", "notif-123");

    // Both keys must be invalidated so the badge and the full list stay in sync.
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["notifications"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["notifications", "unread-count"],
    });
  });
});

// ---------------------------------------------------------------------------
// Leaked-password guard wiring: signup and password change
// ---------------------------------------------------------------------------

describe("useSignUp runs assertPasswordNotBreached before Supabase Auth", () => {
  const wrapper = makeWrapper(
    new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    }),
  );

  beforeEach(() => {
    mockAssertPasswordNotBreached.mockResolvedValue(undefined);
    mockSignUp.mockResolvedValue({ data: null, error: null });
  });

  it("calls the HIBP guard before signUp and proceeds when the password is not breached", async () => {
    const { result } = renderHook(() => useSignUp(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        email: "student@school.edu",
        password: "a-long-unique-passphrase",
      });
    });

    expect(mockAssertPasswordNotBreached).toHaveBeenCalledWith("a-long-unique-passphrase");
    expect(mockSignUp).toHaveBeenCalled();
    // The guard must complete before Supabase Auth is asked to create the account.
    expect(mockAssertPasswordNotBreached.mock.invocationCallOrder[0]!).toBeLessThan(
      mockSignUp.mock.invocationCallOrder[0]!,
    );
  });

  it("rejects signup and never calls signUp when the password is breached", async () => {
    mockAssertPasswordNotBreached.mockRejectedValue(
      new Error(
        "This password has appeared in a known data breach. Please choose a different password.",
      ),
    );

    const { result } = renderHook(() => useSignUp(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          email: "student@school.edu",
          password: "password",
        });
      }),
    ).rejects.toThrow();

    expect(mockAssertPasswordNotBreached).toHaveBeenCalled();
    expect(mockSignUp).not.toHaveBeenCalled();
  });
});

describe("useChangePassword runs assertPasswordNotBreached before updateUser", () => {
  const wrapper = makeWrapper(
    new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    }),
  );

  beforeEach(() => {
    mockAssertPasswordNotBreached.mockResolvedValue(undefined);
    mockUpdateUser.mockResolvedValue({ error: null });
  });

  it("calls the HIBP guard before updateUser and proceeds when the password is not breached", async () => {
    const { result } = renderHook(() => useChangePassword(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ password: "a-long-unique-passphrase" });
    });

    expect(mockAssertPasswordNotBreached).toHaveBeenCalledWith("a-long-unique-passphrase");
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "a-long-unique-passphrase" });
    expect(mockAssertPasswordNotBreached.mock.invocationCallOrder[0]!).toBeLessThan(
      mockUpdateUser.mock.invocationCallOrder[0]!,
    );
  });

  it("rejects the password change and never calls updateUser when the password is breached", async () => {
    mockAssertPasswordNotBreached.mockRejectedValue(
      new Error(
        "This password has appeared in a known data breach. Please choose a different password.",
      ),
    );

    const { result } = renderHook(() => useChangePassword(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ password: "password" });
      }),
    ).rejects.toThrow();

    expect(mockAssertPasswordNotBreached).toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Rate limiting on signup
// ---------------------------------------------------------------------------

describe("useSignUp rate limiting", () => {
  const wrapper = makeWrapper(
    new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    }),
  );

  beforeEach(() => {
    mockAssertPasswordNotBreached.mockResolvedValue(undefined);
    mockSignUp.mockResolvedValue({ data: null, error: null });
    mockedEnforceAuthRateLimit.mockResolvedValue({ allowed: true });
  });

  it("calls enforceAuthRateLimit before signUp", async () => {
    const { result } = renderHook(() => useSignUp(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        email: "student@school.edu",
        password: "a-long-unique-passphrase",
      });
    });

    expect(mockedEnforceAuthRateLimit).toHaveBeenCalledWith({
      data: { email: "student@school.edu", operation: "signup" },
    });
    expect(mockedEnforceAuthRateLimit.mock.invocationCallOrder[0]!).toBeLessThan(
      mockAssertPasswordNotBreached.mock.invocationCallOrder[0]!,
    );
  });

  it("rejects signup and never calls signUp when rate limited", async () => {
    mockedEnforceAuthRateLimit.mockResolvedValue({ allowed: false });

    const { result } = renderHook(() => useSignUp(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          email: "student@school.edu",
          password: "a-long-unique-passphrase",
        });
      }),
    ).rejects.toThrow("Too many requests. Please wait a moment and try again.");

    expect(mockedEnforceAuthRateLimit).toHaveBeenCalled();
    expect(mockAssertPasswordNotBreached).not.toHaveBeenCalled();
    expect(mockSignUp).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useGoogleSignIn
// ---------------------------------------------------------------------------

describe("useGoogleSignIn", () => {
  const mockSignInWithOAuth = vi.fn().mockResolvedValue({ error: null });

  const wrapper = makeWrapper(
    new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    }),
  );

  beforeEach(() => {
    mockSignInWithOAuth.mockClear();
    mockedOAuthRedirectUrl.mockReturnValue("http://localhost/login");
    mockedGetSupabaseClient.mockReturnValue({
      auth: { signInWithOAuth: mockSignInWithOAuth },
    } as any);
  });

  it("calls signInWithOAuth with provider google and the default redirect URL", async () => {
    const { result } = renderHook(() => useGoogleSignIn(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mockedOAuthRedirectUrl).toHaveBeenCalledWith();
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "http://localhost/login",
        queryParams: { prompt: "select_account" },
      },
    });
  });

  it("uses an override redirect URL when supplied", async () => {
    const { result } = renderHook(() => useGoogleSignIn(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ redirectTo: "https://clubset.lovable.app/login?tab=admin" });
    });

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://clubset.lovable.app/login?tab=admin",
        queryParams: { prompt: "select_account" },
      },
    });
  });

  it("rejects when Supabase cannot start the OAuth flow", async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: new Error("OAuth provider not configured") });

    const { result } = renderHook(() => useGoogleSignIn(), { wrapper });

    await expect(act(async () => await result.current.mutateAsync())).rejects.toThrow(
      "OAuth provider not configured",
    );
  });
});

// ---------------------------------------------------------------------------
// normalizeAuthError
// ---------------------------------------------------------------------------

describe("normalizeAuthError", () => {
  it("maps 'already registered' to a generic sign-in prompt", () => {
    expect(normalizeAuthError(new Error("User already registered"))).toBe(
      "An account already exists for this email address. Please sign in instead.",
    );
    expect(normalizeAuthError(new Error("user already exists"))).toBe(
      "An account already exists for this email address. Please sign in instead.",
    );
  });

  it("maps invalid credentials to a generic message", () => {
    expect(normalizeAuthError(new Error("Invalid login credentials"))).toBe(
      "Unable to sign in. Please check your email and password.",
    );
    expect(normalizeAuthError(new Error("Incorrect password"))).toBe(
      "Unable to sign in. Please check your email and password.",
    );
  });

  it("maps unconfirmed email to a verification prompt", () => {
    expect(normalizeAuthError(new Error("Email not confirmed"))).toBe(
      "Please verify your email address before signing in. Check your inbox for the verification link.",
    );
  });

  it("maps rate-limit errors to the generic retry message", () => {
    expect(normalizeAuthError(new Error("Too many requests"))).toBe(
      "Too many requests. Please wait a moment and try again.",
    );
  });

  it("returns a generic message for unknown errors", () => {
    expect(normalizeAuthError(new Error("Some unexpected error"))).toBe(
      "Something went wrong. Please try again.",
    );
    expect(normalizeAuthError(null)).toBe("Something went wrong. Please try again.");
  });
});
