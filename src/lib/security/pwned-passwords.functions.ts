import { createServerFn } from "@tanstack/react-start";

/** Upper bound only to reject abusive inputs; Supabase enforces its own policy. */
const MAX_PASSWORD_LENGTH = 4_096;

/**
 * Server-side leaked-password check used before Clubset sets a password.
 *
 * This runs on the existing Nitro/Cloudflare server entry, so the HIBP request
 * is made from the server. It returns only a coarse status; HIBP response
 * details and the underlying error are never serialized to the browser.
 *
 * POST is intentional: the password belongs in a request body, never a URL.
 */
export const checkPasswordNotBreached = createServerFn({ method: "POST" })
  .validator((data: { password?: unknown }) => {
    if (
      typeof data !== "object" ||
      data === null ||
      typeof data.password !== "string" ||
      data.password.length === 0 ||
      data.password.length > MAX_PASSWORD_LENGTH
    ) {
      // Do not echo the supplied value in the error.
      throw new Error("Invalid password input");
    }
    return { password: data.password };
  })
  .handler(async ({ data }) => {
    // Loaded inside the handler so the server-only hashing/HIBP module is
    // never part of the client bundle.
    const { checkPasswordAgainstHibp } = await import("./pwned-passwords.server");
    const result = await checkPasswordAgainstHibp(data.password);

    if (result === "unavailable") {
      return { status: "unavailable" as const };
    }

    return { status: "checked" as const, breached: result === "breached" };
  });
