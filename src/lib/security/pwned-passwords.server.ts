import "@tanstack/react-start/server-only";

import { createHash } from "node:crypto";

/**
 * Server-only Pwned Passwords check.
 *
 * The candidate password is hashed here with SHA-1, and only the first five
 * hexadecimal characters of the hash ever leave this process (as the HIBP
 * range endpoint's path). The plaintext password and the complete hash are
 * never logged, stored, or included in a response.
 */

export const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";
export const HIBP_TIMEOUT_MS = 3_000;
export const HIBP_USER_AGENT = "Clubset-Password-Security";

export type PasswordBreachResult = "breached" | "not_found" | "unavailable";

/** Uppercase SHA-1 hex digest of a password. Kept in memory only. */
export function sha1Hex(value: string): string {
  return createHash("sha1").update(value, "utf8").digest("hex").toUpperCase();
}

/** Split a complete SHA-1 digest into the 5-character prefix and 35-character suffix. */
export function splitSha1(hash: string): { prefix: string; suffix: string } {
  const normalized = hash.toUpperCase();
  if (!/^[0-9A-F]{40}$/.test(normalized)) {
    throw new Error("Invalid SHA-1 digest");
  }
  return { prefix: normalized.slice(0, 5), suffix: normalized.slice(5) };
}

/**
 * Parse an HIBP range response into a suffix -> count map.
 *
 * Returns `null` when the body is not a recognisable range response at all
 * (for example an HTML block page or an empty body), so callers can fail
 * closed instead of mistaking a malformed 200 for "no match".
 *
 * HIBP returns one `SUFFIX:COUNT` line per match. Requests carry
 * `Add-Padding: true`, so the response also contains padded entries with a
 * count of 0; those are not breaches and must be ignored.
 */
export function parseHibpRange(body: string): Map<string, number> | null {
  const entries = new Map<string, number>();
  let validLines = 0;

  for (const line of body.split(/\r?\n/)) {
    const match = /^([0-9A-Fa-f]{35}):(\d+)$/.exec(line.trim());
    if (!match) continue;

    validLines += 1;
    entries.set(match[1]!.toUpperCase(), Number.parseInt(match[2]!, 10));
  }

  return validLines > 0 ? entries : null;
}

/**
 * Look for the complete hash's suffix in an HIBP range response.
 *
 * Returns `null` for a malformed response, `true` for a real match, and
 * `false` for a well-formed response that does not contain the suffix.
 */
export function rangeContainsSuffix(body: string, suffix: string): boolean | null {
  const target = suffix.trim().toUpperCase();
  if (!/^[0-9A-F]{35}$/.test(target)) return null;

  const entries = parseHibpRange(body);
  if (!entries) return null;

  return (entries.get(target) ?? 0) > 0;
}

/**
 * Check a password against the HIBP Pwned Passwords range API.
 *
 * Failure behavior is deliberately fail-closed: any network error, non-2xx
 * response, timeout, or unreadable/malformed body resolves to `"unavailable"`
 * so the caller can refuse the password rather than silently allowing it.
 */
export async function checkPasswordAgainstHibp(
  password: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<PasswordBreachResult> {
  const { fetchImpl = fetch, timeoutMs = HIBP_TIMEOUT_MS } = options;

  let prefix: string;
  let suffix: string;
  try {
    ({ prefix, suffix } = splitSha1(sha1Hex(password)));
  } catch {
    return "unavailable";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${HIBP_RANGE_URL}${prefix}`, {
      method: "GET",
      headers: {
        // Padding keeps the response size from revealing the real match count.
        "Add-Padding": "true",
        // HIBP asks clients to identify themselves.
        "User-Agent": HIBP_USER_AGENT,
      },
      signal: controller.signal,
    });

    if (!response.ok) return "unavailable";

    const body = await response.text();
    const breached = rangeContainsSuffix(body, suffix);

    // A malformed 200 response is not proof that the password is safe.
    if (breached === null) return "unavailable";

    return breached ? "breached" : "not_found";
  } catch {
    // Never surface the underlying error: it may contain the range URL or
    // implementation details. Callers receive a generic message.
    return "unavailable";
  } finally {
    clearTimeout(timeout);
  }
}
