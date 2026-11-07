/**
 * Server-enforced rate limiting for auth email-triggering operations.
 *
 * Server function (TanStack Start). The client calls this BEFORE any Supabase
 * Auth operation that sends an email (signUp, signInWithOtp). If the call
 * returns allowed: false, the client must not proceed and must show a generic
 * retry-later message.
 *
 * The handler runs on the server, reads the client IP from the edge proxy
 * headers (CF-Connecting-IP), normalizes the email, and calls the database
 * RPC `public.check_rate_limit()` via the service-role client. The
 * service-role client is used because rate-limit rows must be readable/writable
 * without being constrained by per-user RLS -- the rate limit itself is the
 * access control and applies equally to anon and authenticated callers.
 *
 * Limits are fixed-window counters keyed by (identifier, operation). Windows
 * are one hour. Limits are modest so legitimate users can retry after a short
 * cooldown while attackers cannot flood inboxes.
 *
 * No PII beyond the caller's own email/IP is stored. The key is a normalized
 * string the caller already knows.
 */

import { createServerFn } from "@tanstack/react-start";

// ---------------------------------------------------------------------------
// Configuration: limits per operation (max requests per window).
//
// All windows are one hour (3600 seconds). Adjust here to tighten or loosen.
// These are shared with the client-side helpers via this module.
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  perEmail: number;
  perIp: number;
  windowSeconds: number;
}

export const AUTH_RATE_LIMITS: Record<string, RateLimitConfig> = {
  signup: { perEmail: 5, perIp: 10, windowSeconds: 3_600 },
  magic_link: { perEmail: 5, perIp: 10, windowSeconds: 3_600 },
  password_reset: { perEmail: 3, perIp: 5, windowSeconds: 3_600 },
  admin_allowlist: { perEmail: 10, perIp: 20, windowSeconds: 3_600 },
};

export type AuthRateLimitOperation = keyof typeof AUTH_RATE_LIMITS;

/** Generic message shown when a rate limit is exceeded. Never names the
 *  specific limit or identifier, to avoid tipping off an attacker. */
export const RATE_LIMITED_MESSAGE = "Too many requests. Please wait a moment and try again.";

/** Validate the incoming request payload. */
function validateInput(data: unknown): { email: string; operation: AuthRateLimitOperation } {
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid rate-limit request");
  }
  const record = data as Record<string, unknown>;
  const email = record["email"];
  if (typeof email !== "string" || !email.includes("@")) {
    throw new Error("Invalid rate-limit request");
  }
  const operation = record["operation"];
  if (
    typeof operation !== "string" ||
    !Object.prototype.hasOwnProperty.call(AUTH_RATE_LIMITS, operation)
  ) {
    throw new Error("Invalid rate-limit operation");
  }
  return { email, operation: operation as AuthRateLimitOperation };
}

async function checkOne(key: string, operation: string, config: RateLimitConfig): Promise<boolean> {
  // Lazy-import server-only dependencies inside the handler so this module
  // can be imported from client code without pulling server-only code into
  // the browser bundle.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // `check_rate_limit` is defined in a migration and is not in the generated
  // Supabase types, so the RPC call is typed through `any`.
  const rpc = supabaseAdmin.rpc as unknown as (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
  const { data: allowed, error } = await rpc("check_rate_limit", {
    p_key: key,
    p_operation: operation,
    p_limit: config.perEmail,
    p_window_seconds: config.windowSeconds,
  });
  if (error) {
    // Fail open: if the rate-limit store is unreachable, do not block
    // legitimate sign-ups. Log server-side only.
    console.error("[auth rate limit] check failed:", String(error));
    return true;
  }
  return allowed === true;
}

export const enforceAuthRateLimit = createServerFn({ method: "POST" })
  .validator(validateInput)
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");

    const config = AUTH_RATE_LIMITS[data.operation];
    if (!config) {
      return { allowed: false };
    }
    const normalizedEmail = data.email.toLowerCase().trim();

    // Extract the client IP from the edge proxy headers.
    const request = getRequest();
    let ip = "unknown";
    if (request?.headers) {
      const cfIp = request.headers.get("CF-Connecting-IP");
      if (cfIp) {
        ip = cfIp.trim();
      } else {
        const forwarded = request.headers.get("x-forwarded-for");
        if (forwarded) {
          ip = forwarded.split(",")[0]?.trim() ?? "unknown";
        }
      }
    }

    // Check both the email bucket and the IP bucket. Both must pass.
    const [emailAllowed, ipAllowed] = await Promise.all([
      checkOne(`email:${normalizedEmail}:${data.operation}`, data.operation, config),
      checkOne(`ip:${ip}:${data.operation}`, data.operation, config),
    ]);

    return { allowed: emailAllowed && ipAllowed };
  });
