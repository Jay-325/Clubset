-- ============================================================================
-- Clubset :: 2026-11-10 -- lock public.rate_limits behind the definer RPC
--
-- WHY
--   The Supabase Security Advisor flagged 20261107000000's access model:
--
--     * policies rate_limits_anon_all / rate_limits_authenticated_all are
--       `for all ... using (true) with check (true)`, and both roles hold
--       SELECT/INSERT/UPDATE/DELETE on the table. Any visitor could read
--       every counter row -- the `key` column is `email:<address>:<op>`,
--       which is an email-enumeration oracle -- and write arbitrary rows
--       (e.g. inflate a victim's `email:<addr>:signup` counter and deny
--       them sign-in).
--
--   The original comment said the open policies existed so client-side
--   mutations could enforce limits, but the shipped code never does that:
--   `enforceAuthRateLimit` (src/lib/security/auth-rate-limit.functions.ts)
--   is a TanStack server function that calls `check_rate_limit` through the
--   service-role client. No client ever touches the table.
--
-- WHAT
--   * Drop both permissive policies. RLS stays enabled; with no policies the
--     table is client-inaccessible (same deliberate model as admin_allowlist).
--   * Revoke all table privileges from anon and authenticated. service_role
--     keeps its grants (the server-function path) and postgres stays owner.
--   * Revoke EXECUTE on check_rate_limit from PUBLIC, anon and
--     authenticated, and grant it to service_role only. The RPC is called
--     exclusively server-side; leaving it browser-callable let anonymous
--     scripts hammer a SECURITY DEFINER endpoint that deletes and inserts
--     rate-limit rows. No policy anywhere references this function (verified
--     against pg_policies before revoking), so no policy predicate loses
--     access -- the 42501 failure mode of 20261003001241 cannot recur.
--
-- ROLLBACK
--   create policy rate_limits_anon_all on public.rate_limits
--     for all to anon using (true) with check (true);
--   create policy rate_limits_authenticated_all on public.rate_limits
--     for all to authenticated using (true) with check (true);
--   grant select, insert, update, delete on table public.rate_limits
--     to anon, authenticated;
--   grant execute on function public.check_rate_limit(text, text, int, int)
--     to public, anon, authenticated;
--
-- Additive/idempotent: drop policy if exists, convergent grants. No rows are
-- read, written or deleted; existing counters are untouched.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Clients lose direct access to the counter table.
-- ---------------------------------------------------------------------------

drop policy if exists rate_limits_anon_all on public.rate_limits;

drop policy if exists rate_limits_authenticated_all on public.rate_limits;

revoke all on table public.rate_limits from anon, authenticated;

-- RLS is already enabled (20261107000000); restate for idempotency.
alter table public.rate_limits enable row level security;

-- ---------------------------------------------------------------------------
-- 2. The check-and-increment RPC becomes service-role only.
-- ---------------------------------------------------------------------------

revoke execute on function public.check_rate_limit(text, text, int, int)
  from public, anon, authenticated;

grant execute on function public.check_rate_limit(text, text, int, int)
  to service_role;

comment on function public.check_rate_limit(text, text, int, int) is
  'Atomic rate-limit check-and-increment. Returns true if the request is allowed, false if the limit is exceeded. p_limit is the max count per window; p_window_seconds is the window length in seconds. Service-role only: the server-side rate limiter (enforceAuthRateLimit) is the sole caller.';

commit;
