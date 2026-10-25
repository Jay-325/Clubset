import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { FALLBACK_SUPABASE_PUBLISHABLE_KEY, FALLBACK_SUPABASE_URL } from "./public-config";

/**
 * Supabase client factory (PRD 41).
 *
 * The anon key is safe to ship to the browser ONLY because every table has RLS
 * enabled and every RPC re-checks permissions server-side. Nothing in this app
 * is authorized by hiding UI -- the database is the enforcement point
 * (PRD 41, 53.20).
 */

let cachedClient: SupabaseClient<Database> | null = null;

function readEnv(): { url: string; anonKey: string } {
  // Vite exposes env vars on import.meta.env. Support both the VITE_ prefixed
  // public vars and the Lovable-style project.json fallback, then fall back to
  // the checked-in public project config. The fallback is what keeps a build
  // without any env vars (no .env in the repo, none configured on the host)
  // from rendering "Connect Supabase to continue" on every route.
  const env = import.meta.env as Record<string, string | undefined>;

  const url = env["VITE_SUPABASE_URL"] ?? env["PUBLIC_SUPABASE_URL"] ?? FALLBACK_SUPABASE_URL;
  const anonKey =
    env["VITE_SUPABASE_ANON_KEY"] ??
    env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
    env["PUBLIC_SUPABASE_ANON_KEY"] ??
    FALLBACK_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured: set VITE_SUPABASE_URL and " +
        "VITE_SUPABASE_PUBLISHABLE_KEY (or edit src/lib/supabase/public-config.ts).",
    );
  }

  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  // Resolved through the same path as the client, so this can never disagree
  // with getSupabaseClient(). With the checked-in public fallback this is true
  // unless a deployment explicitly sets an empty value.
  const { url, anonKey } = readEnv();
  return Boolean(url && anonKey);
}

export function getSupabaseClient(): SupabaseClient<Database> {
  if (!cachedClient) {
    const { url, anonKey } = readEnv();
    cachedClient = createClient<Database>(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return cachedClient;
}
