/**
 * Google OAuth (PKCE-agnostic) helpers shared by /login and /signup.
 *
 * The Supabase client is created with `detectSessionInUrl: true`, so it owns
 * the return trip: Google -> Supabase `/auth/v1/callback` -> this app, and the
 * client turns the returned credentials into a session on the next
 * `getSession()`. That means the app never handles tokens itself -- it only
 * chooses where Supabase should send the browser back to.
 *
 * Everything here is a pure function so the redirect target and the error
 * copy can be unit tested without a browser or a Supabase project.
 */

/** The single provider this app offers as a one-click sign-in. */
export const OAUTH_PROVIDER = "google" as const;

/**
 * Where Supabase should return the browser after Google.
 *
 * Always `/login`, never the page the button was clicked from:
 *
 *   * AuthProvider -- not the page -- decides where a signed-in user goes next
 *     (onboarding for an incomplete student profile, the saved `next` target,
 *     or home). Returning to /login hands control straight to it.
 *   * /signup unconditionally redirects every session to /onboarding, which
 *     would bounce a returning Google user with a complete profile into the
 *     onboarding form.
 *   * The `next` path survives the round trip because login.tsx parks it in
 *     sessionStorage, which is per-tab and outlives the external redirect.
 *
 * In production `origin` is the Supabase `site_url` (https://clubset.lovable.app),
 * which Supabase accepts for `/auth/v1/authorize`; in development the dev-server
 * origin is accepted too.
 */
export function oauthRedirectUrl(origin?: string): string {
  const base = (origin ?? (typeof window === "undefined" ? "" : window.location.origin)).replace(
    /\/+$/,
    "",
  );
  return `${base}/login`;
}

/** Query/fragment keys GoTrue uses to report a failed or cancelled OAuth trip. */
const OAUTH_ERROR_KEYS = ["error", "error_description", "error_code", "error_uri"] as const;

export interface OAuthUrlError {
  code: string;
  description: string | null;
}

/**
 * Read `error` / `error_description` out of a query string or fragment.
 *
 * Implicit flow (the client default) reports OAuth failures in the fragment
 * (`#error=access_denied&...`), while PKCE reports them in the query string, so
 * both are accepted. Success payloads are ignored: they are the Supabase
 * client's to consume, not this function's.
 */
export function parseOAuthError(raw: string): OAuthUrlError | null {
  const trimmed = raw.replace(/^[?#]/, "");
  if (!trimmed.includes("=")) return null;

  const params = new URLSearchParams(trimmed);
  const code = params.get("error");
  if (!code) return null;

  const description = params.get("error_description");
  return { code, description: description ? description.replace(/\+/g, " ") : null };
}

/**
 * User-facing copy for a returned OAuth error.
 *
 * Deliberately does not echo `error_description`: it is provider-controlled
 * text, and the app's convention is to never surface upstream auth text
 * (see normalizeAuthError). Cancelling the Google chooser is the common case
 * and is not an error the user needs to worry about.
 */
export function oauthErrorMessage(error: OAuthUrlError): string {
  if (error.code === "access_denied") {
    return "Google sign-in was cancelled. You can try again, or use your email address instead.";
  }
  if (error.code === "temporarily_unavailable" || error.code === "server_error") {
    return "Google sign-in is temporarily unavailable. Please try again in a moment.";
  }
  return "Google sign-in didn't complete. Please try again, or use your email address instead.";
}

/**
 * Remove OAuth error parameters from an href, leaving everything else intact.
 *
 * Returns the input unchanged when there is nothing to strip, so callers can
 * skip a pointless `history.replaceState`. A successful implicit-flow return
 * (`#access_token=...`) deliberately survives: those keys are not touched, and
 * the Supabase client is the component that clears them.
 */
export function removeOAuthErrorParams(href: string): string {
  const url = new URL(href);
  let changed = false;

  for (const key of OAUTH_ERROR_KEYS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }

  const rawHash = url.hash.replace(/^#/, "");
  let hashChanged = false;
  if (rawHash.includes("=")) {
    const hashParams = new URLSearchParams(rawHash);
    for (const key of OAUTH_ERROR_KEYS) {
      if (hashParams.has(key)) {
        hashParams.delete(key);
        hashChanged = true;
      }
    }
    if (hashChanged) {
      const remaining = hashParams.toString();
      url.hash = remaining ? `#${remaining}` : "";
      changed = true;
    }
  }

  return changed ? url.toString() : href;
}

/**
 * Find the OAuth error carried by the current document URL, if any.
 *
 * Takes the location object rather than reading `window` so it can be tested
 * with plain objects.
 */
export function readOAuthError(location: {
  search: string;
  hash: string;
}): OAuthUrlError | null {
  return parseOAuthError(location.search) ?? parseOAuthError(location.hash);
}
