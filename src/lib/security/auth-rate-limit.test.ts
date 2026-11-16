import { describe, expect, it, vi, beforeEach } from "vitest";

// The rate-limit RPC is reached through a service-role client that may throw on
// construction when the server runtime has no SUPABASE_SERVICE_ROLE_KEY. That
// exception must fail open exactly like an error response does, otherwise every
// email-sending auth flow dies before Supabase Auth is ever called.
const mockRpc = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: mockRpc,
  },
}));

import { AUTH_RATE_LIMITS, checkOne } from "./auth-rate-limit.functions";

const magicLink = AUTH_RATE_LIMITS["magic_link"]!;
const signup = AUTH_RATE_LIMITS["signup"]!;

describe("checkOne", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("fails open when the rate-limit client cannot be constructed", async () => {
    mockRpc.mockRejectedValue(
      new Error("Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY"),
    );

    await expect(
      checkOne(
        "email:student@school.edu",
        "magic_link",
        magicLink.perEmail,
        magicLink.windowSeconds,
      ),
    ).resolves.toBe(true);
  });

  it("fails open when the RPC returns an error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error("db down") });

    await expect(
      checkOne(
        "email:student@school.edu",
        "magic_link",
        magicLink.perEmail,
        magicLink.windowSeconds,
      ),
    ).resolves.toBe(true);
  });

  it("returns the store's verdict when the RPC succeeds", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });

    await expect(
      checkOne(
        "email:student@school.edu",
        "magic_link",
        magicLink.perEmail,
        magicLink.windowSeconds,
      ),
    ).resolves.toBe(false);
  });

  it("passes the caller's limit and window straight to the RPC", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    await checkOne("ip:203.0.113.7", "signup", signup.perIp, signup.windowSeconds);

    expect(mockRpc).toHaveBeenCalledWith("check_rate_limit", {
      p_key: "ip:203.0.113.7",
      p_operation: "signup",
      p_limit: signup.perIp,
      p_window_seconds: signup.windowSeconds,
    });
  });
});
