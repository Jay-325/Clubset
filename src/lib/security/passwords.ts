import { checkPasswordNotBreached } from "./pwned-passwords.functions";

/**
 * User-facing messages. Both are intentionally generic: they never echo the
 * password, the SHA-1 digest, the HIBP range URL, or an upstream error.
 */
export const BREACHED_PASSWORD_MESSAGE =
  "This password has appeared in a known data breach. Please choose a different password.";

export const PASSWORD_CHECK_UNAVAILABLE_MESSAGE =
  "We couldn't verify this password right now. Please try again.";

/**
 * Refuse a candidate password unless the server confirms it is absent from the
 * Pwned Passwords dataset.
 *
 * Fail-closed: if the check cannot complete (network failure, timeout, HIBP
 * outage, malformed response, or a failed server-function call), the password
 * is rejected with a generic retry message. Silently allowing it would let an
 * attacker bypass the policy by making the check fail.
 *
 * Call this immediately before any Supabase Auth call that sets a password.
 */
export async function assertPasswordNotBreached(password: string): Promise<void> {
  let result: Awaited<ReturnType<typeof checkPasswordNotBreached>>;

  try {
    result = await checkPasswordNotBreached({ data: { password } });
  } catch {
    // Never log the caught error: request/serialization errors can include
    // sensitive arguments. The caller only needs the generic outcome.
    throw new Error(PASSWORD_CHECK_UNAVAILABLE_MESSAGE);
  }

  if (result.status === "unavailable") {
    throw new Error(PASSWORD_CHECK_UNAVAILABLE_MESSAGE);
  }

  if (result.breached) {
    throw new Error(BREACHED_PASSWORD_MESSAGE);
  }
}
