/**
 * Public Supabase endpoint + publishable key.
 *
 * These are fallbacks only. They are intentionally empty so that a build or
 * deployment without `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`
 * fails clearly instead of silently connecting to a live project. The checked-in
 * values are placeholders, not credentials -- every table has RLS enabled and
 * every RPC re-checks permissions server-side, so the database is the
 * enforcement point, not the secrecy of this key.
 *
 * The service_role key must never appear here, in a VITE_ variable, or
 * anywhere in the repository.
 *
 * PRECEDENCE
 *   Environment variables still win (see readEnv in ./client.ts), so a
 *   deployment can point at another project without editing this file.
 */

export const FALLBACK_SUPABASE_URL = "";

export const FALLBACK_SUPABASE_PUBLISHABLE_KEY = "";
