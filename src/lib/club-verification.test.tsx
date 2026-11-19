import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// queries.ts also pulls in auth helpers that need a browser-only server
// function; only the club verification paths are under test here.
vi.mock("@/lib/security/passwords", () => ({
  assertPasswordNotBreached: vi.fn(),
  BREACHED_PASSWORD_MESSAGE: "breached",
  PASSWORD_CHECK_UNAVAILABLE_MESSAGE: "unavailable",
}));
vi.mock("@/lib/security/auth-rate-limit.functions", () => ({
  enforceAuthRateLimit: vi.fn(),
  RATE_LIMITED_MESSAGE: "rate limited",
}));
vi.mock("@/lib/auth/oauth", () => ({
  OAUTH_PROVIDER: "google",
  oauthRedirectUrl: vi.fn(),
  emailRedirectUrl: vi.fn(),
}));

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));

import { usePendingClubs, useVerifyClub } from "./queries";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("pending club discovery", () => {
  beforeEach(() => mockFrom.mockReset());

  it("reads the pending clubs and their confirming students", async () => {
    const rows = [
      {
        id: "club-1",
        name: "Robotics",
        club_verifications: [{ user_id: "founder" }, { user_id: "verifier" }],
      },
    ];
    const select = vi.fn();
    const eq = vi.fn();
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const builder = { select, eq, order };
    select.mockReturnValue(builder);
    eq.mockReturnValue(builder);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => usePendingClubs(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(rows));
    expect(mockFrom).toHaveBeenCalledWith("clubs");
    expect(select).toHaveBeenCalledWith("*, club_verifications(user_id)");
    expect(eq).toHaveBeenCalledWith("status", "awaiting_student_verification");
  });
});

describe("useVerifyClub", () => {
  beforeEach(() => mockFrom.mockReset());

  it("treats a repeat confirmation as already verified", async () => {
    mockFrom.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: { code: "23505", message: "duplicate key" } }),
    });

    const { result } = renderHook(() => useVerifyClub(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("club-1")).resolves.toBeUndefined();
    });
  });

  it("surfaces every other failure", async () => {
    mockFrom.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: { code: "42501", message: "denied" } }),
    });

    const { result } = renderHook(() => useVerifyClub(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("club-1")).rejects.toMatchObject({ code: "42501" });
    });
  });
});
