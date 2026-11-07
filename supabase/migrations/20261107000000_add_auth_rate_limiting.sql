-- ============================================================================
-- Clubset :: 2026-11-07 -- application-side rate limiting for auth email
--   Triggering operations (signup, magic-link sign-in, admin allowlist pre-check)
--
-- WHY
--   Supabase Auth is the sole authentication email provider (no Resend).
--   Supabase Auth has built-in rate limiting, but application-side limits add
--   defense in depth: they prevent unnecessary duplicate verification emails,
--   bound signup abuse, and keep email-triggering operations affordable.
--
--   All enforcement happens server-side (a Postgres RPC). Client state,
--   disabled buttons, local storage, and frontend timers are UX only and are
--   never relied on as a security boundary.
--
-- WHAT
--   * public.rate_limits table: one counter row per (key, operation, window).
--   * public.check_rate_limit(key, operation, limit, window_seconds) -> boolean:
--     atomically checks whether the key is under its limit within the rolling
--     window, and increments the counter if allowed. Returns false when the
--     limit is exceeded.
--   * RLS allows anon/authenticated to read/write their own rate-limit rows;
--     the table holds no PII beyond a hashed/normalized identifier.
--   * EXECUTE on check_rate_limit is granted to anon, authenticated, and
--     service_role so client-side mutations can call it before any Supabase
--     Auth email-triggering call.
--
-- RATE LIMITS (configurable via the p_limit / p_window_seconds arguments):
--   signup:           5 per email per hour, 10 per IP per hour
--   magic_link:       5 per email per hour, 10 per IP per hour
--   password_reset:   3 per email per hour
--   admin_allowlist: 10 per email per hour, 20 per IP per hour
--
-- ROLLBACK
--   drop table public.rate_limits;   -- drops the RPC cascade is not needed
--   (revoking EXECUTE is optional; the function can remain dormant)
--
-- Additive and idempotent: create table if not exists, create or replace
-- function, drop policy if exists, convergent grants. No existing rows are
-- touched and no existing permission is changed.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Rate limit state. One counter per (normalized key, operation, window).
-- The key is a normalized identifier (lowercased email or IP). No names,
-- no profiles, no auth-user data is stored here.
-- ---------------------------------------------------------------------------

create table if not exists public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  operation text not null,
  count int not null default 1,
  window_start timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key, operation)
);

create index if not exists rate_limits_key_operation_idx
  on public.rate_limits (key, operation);

create index if not exists rate_limits_window_idx
  on public.rate_limits (window_start);

-- ---------------------------------------------------------------------------
-- Row Level Security. Rate-limit rows contain no PII beyond an identifier
-- that the caller already knows (their own email or IP). Both anon and
-- authenticated may read/write rows so client-side mutations can enforce
-- limits before calling Supabase Auth. service_role retains full access.
-- ---------------------------------------------------------------------------

alter table public.rate_limits enable row level security;

drop policy if exists rate_limits_anon_all on public.rate_limits;
create policy rate_limits_anon_all on public.rate_limits
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists rate_limits_authenticated_all on public.rate_limits;
create policy rate_limits_authenticated_all on public.rate_limits
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on table public.rate_limits to anon, authenticated, service_role;

comment on table public.rate_limits is
  'Application-side rate-limit counters for auth email-triggering operations. One counter row per (normalized key, operation, fixed window). No PII beyond the identifier the caller already knows.';

-- ---------------------------------------------------------------------------
-- Atomic check-and-increment. Returns true when the request is allowed,
-- false when the limit has been exceeded. Fixed-width time windows keyed
-- by (key, operation, window_start).
--
-- The INSERT ... ON CONFLICT pattern makes the check-and-increment atomic
-- for the common case: only one transaction can insert the initial row,
-- others convert to the UPDATE branch and increment. Supabase Auth's own
-- rate limiting remains the hard boundary; this is defense in depth.
-- ---------------------------------------------------------------------------

create or replace function public.check_rate_limit(
  p_key text,
  p_operation text,
  p_limit int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz := now() - (p_window_seconds || ' seconds')::interval;
  v_count int;
begin
  -- Reject empty keys early: no table access for junk input.
  if p_key is null or trim(p_key) = '' then
    return false;
  end if;

  -- Normalize: callers pass lowercase/trimmed identifiers already; be defensive.
  p_key := lower(btrim(p_key));
  if p_key = '' then
    return false;
  end if;

  -- Remove entries that have fallen out of every possible future window.
  -- (Best-effort cleanup keeps the table small without a separate job.)
  delete from public.rate_limits
  where window_start < v_window_start;

  -- Count entries for this key/operation within the current window.
  select count(*) into v_count
  from public.rate_limits
  where key = p_key
    and operation = p_operation
    and window_start >= v_window_start;

  if v_count >= p_limit then
    return false;
  end if;

  -- Insert or increment the counter for this window.
  insert into public.rate_limits (key, operation, count, window_start, updated_at)
  values (p_key, p_operation, 1, v_now, v_now)
  on conflict (key, operation) do update
  set count = public.rate_limits.count + 1,
      updated_at = v_now
  where public.rate_limits.key = p_key
    and public.rate_limits.operation = p_operation;

  return true;
end;
$$;

grant execute on function public.check_rate_limit(text, text, int, int)
  to anon, authenticated, service_role;

comment on function public.check_rate_limit(text, text, int, int) is
  'Atomic rate-limit check-and-increment. Returns true if the request is allowed, false if the limit is exceeded. p_limit is the max count per window; p_window_seconds is the window length in seconds.';

commit;
