import { describe, expect, it, vi, beforeEach } from "vitest";

// `supabaseAdmin` is a Proxy over a lazily-created SupabaseClient. Its `rpc` is
// a prototype method that reads `this.rest`, and the Proxy's `get` returns that
// method unbound. Both facts are load-bearing: a detached
// `const rpc = supabaseAdmin.rpc` throws
// "Cannot read properties of undefined (reading 'rest')". The mock reproduces
// the real shape so that bug cannot pass the suite again.
const mockRestRpc = vi.hoisted(() => vi.fn());
const mockState = vi.hoisted(() => ({ constructionError: null as Error | null }));

vi.mock("@/integrations/supabase/client.server", () => {
  class FakeSupabaseClient {
    rest = { rpc: mockRestRpc };
    rpc(name: string, params: Record<string, unknown>) {
      return this.rest.rpc(name, params);
    }
  }
  let client: FakeSupabaseClient | undefined;
  return {
    supabaseAdmin: new Proxy({} as FakeSupabaseClient, {
      get(_target, prop, receiver) {
        if (mockState.constructionError) throw mockState.constructionError;
        if (!client) client = new FakeSupabaseClient();
        return Reflect.get(client, prop, receiver);
      },
    }),
  };
});

import { AUTH_RATE_LIMITS, checkOne } from "./auth-rate-limit.functions";

const magicLink = AUTH_RATE_LIMITS["magic_link"]!;
const signup = AUTH_RATE_LIMITS["signup"]!;

describe("checkOne", () => {
  beforeEach(() => {
    mockRestRpc.mockReset();
    mockState.constructionError = null;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("fails open when the rate-limit client cannot be constructed", async () => {
    mockState.constructionError = new Error(
      "Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY",
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
    mockRestRpc.mockResolvedValue({ data: null, error: new Error("db down") });

    await expect(
      checkOne(
        "email:student@school.edu",
        "magic_link",
        magicLink.perEmail,
        magicLink.windowSeconds,
      ),
    ).resolves.toBe(true);
  });

  it("fails open when the RPC call throws", async () => {
    mockRestRpc.mockRejectedValue(new TypeError("fetch failed"));

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
    mockRestRpc.mockResolvedValue({ data: false, error: null });

    await expect(
      checkOne(
        "email:student@school.edu",
        "magic_link",
        magicLink.perEmail,
        magicLink.windowSeconds,
      ),
    ).resolves.toBe(false);
  });

  it("invokes the RPC with the client bound as `this`", async () => {
    mockRestRpc.mockResolvedValue({ data: true, error: null });

    await checkOne("ip:203.0.113.7", "signup", signup.perIp, signup.windowSeconds);

    // Reachable only when `this.rest` resolved, i.e. `this` was the client.
    expect(mockRestRpc).toHaveBeenCalledTimes(1);
  });

  it("passes the caller's limit and window straight to the RPC", async () => {
    mockRestRpc.mockResolvedValue({ data: true, error: null });

    await checkOne("ip:203.0.113.7", "signup", signup.perIp, signup.windowSeconds);

    expect(mockRestRpc).toHaveBeenCalledWith("check_rate_limit", {
      p_key: "ip:203.0.113.7",
      p_operation: "signup",
      p_limit: signup.perIp,
      p_window_seconds: signup.windowSeconds,
    });
  });
});
