/**
 * Public Supabase endpoint + publishable key.
 *
 * WHY THESE CONSTANTS EXIST
 *   The deployed build does not always receive VITE_SUPABASE_URL /
 *   VITE_SUPABASE_PUBLISHABLE_KEY. Vite inlines those at build time, `.env` is
 *   (correctly) not in git, and the hosting build has no variables configured,
 *   so `import.meta.env` is empty there. Without a value the client refuses to
 *   initialise and every route renders the "Connect Supabase to continue"
 *   screen. These constants are the fallback so a build with no env vars still
 *   starts.
 *
 * WHY THIS IS SAFE
 *   The publishable ("anon") key is designed to be public: it is embedded in
 *   the JavaScript bundle of every Supabase web app. It grants nothing on its
 *   own -- every table here has Row Level Security enabled and every RPC
 *   re-checks permissions server-side, so the database is the enforcement
 *   point, not the secrecy of this key. The service_role key is the opposite:
 *   it must never appear in this file, in a VITE_ variable, or anywhere in the
 *   repository.
 *
 * PRECEDENCE
 *   Environment variables still win (see readEnv in ./client.ts), so a
 *   deployment can point at another project without editing this file.
 */

export const FALLBACK_SUPABASE_URL = "https://omcddzmtjqhrsxdxiewn.supabase.co";

// Public anon/publishable key for the project above.
export const FALLBACK_SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tY2Rkem10anFocnN4ZHhpZXduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NzM1OTQsImV4cCI6MjEwNjU0OTU5NH0.RWjVmU4oyA-u39E72dVt8dBOa_L0Q32zOvEkNwqbaLQ";
