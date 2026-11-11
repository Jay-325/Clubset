/**
 * Cloudflare Turnstile (PRD 41: bots must not be able to hammer the auth
 * endpoints).
 *
 * Two halves, and only the second one is security:
 *
 *   1. The browser renders a widget from the *public* site key and receives a
 *      short-lived token. That token proves nothing on its own -- a script can
 *      request one too.
 *   2. Supabase Auth verifies the token server-side against the widget's
 *      *secret* on every sign-up / sign-in / OTP call that carries it, and
 *      rejects the request when it is missing, expired or replayed.
 *
 * So the app never trusts the token; it only forwards it. `TURNSTILE_SECRET_KEY`
 * must never reach this file or the bundle.
 */

/**
 * Public site key.
 *
 * The key is safe to ship (the same as the Supabase anon key pattern in
 * public-config.ts) and is the fallback for builds whose host does not inject
 * `VITE_TURNSTILE_SITE_KEY` -- which is every Lovable-hosted build, because
 * Lovable runs its own build pipeline. Without a resolved key the widget cannot
 * render and every enforced auth call would fail closed, so a working default
 * matters here.
 */
export const FALLBACK_TURNSTILE_SITE_KEY = "0x4AAAAAAF76helKiOEKD9yk";

/** `render=explicit` -- we render each widget into its own container. */
export const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export interface TurnstileRenderOptions {
  sitekey: string;
  theme?: "auto" | "light" | "dark";
  action?: string;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
  "error-callback"?: () => void;
}

/** The slice of the Turnstile global this app uses. */
export interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type PublicEnv = Record<string, string | undefined>;

/**
 * Resolve the site key from the environment, falling back to the checked-in
 * public key. An explicitly empty value disables the widget (useful for local
 * work against a project with captcha turned off).
 */
export function turnstileSiteKey(env: PublicEnv = import.meta.env as PublicEnv): string {
  const candidates = [env["VITE_TURNSTILE_SITE_KEY"], env["PUBLIC_TURNSTILE_SITE_KEY"]];
  for (const candidate of candidates) {
    if (candidate === "") return "";
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return FALLBACK_TURNSTILE_SITE_KEY;
}

/** True when a widget can be rendered at all. */
export function isTurnstileConfigured(env?: PublicEnv): boolean {
  return Boolean(turnstileSiteKey(env));
}

let scriptPromise: Promise<void> | null = null;

/**
 * Load the Turnstile script once per document.
 *
 * Failures are not cached: a blocked script (ad-blocker, offline) should be
 * retried if the user tries again, not poisoned for the whole session.
 */
export function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Turnstile requires a browser"));
  }
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const fail = () => {
      scriptPromise = null;
      reject(new Error("Could not load the Turnstile script"));
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${TURNSTILE_SCRIPT_SRC}"]`,
    );

    if (existing) {
      if (window.turnstile) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", fail, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", fail, { once: true });
    document.head.appendChild(script);
  });

  return scriptPromise;
}
