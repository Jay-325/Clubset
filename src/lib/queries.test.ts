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

vi.mock("@/lib/security/passwords", () => ({
  assertPasswordNotBreached: mockAssertPasswordNotBreached,
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
} from "./queries";

const mockedGetSupabaseClient = vi.mocked(getSupabaseClient);

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
