-- ============================================================================
-- Joinin :: 20261019 -- restore EXECUTE for policy helper functions
--
-- REGRESSION FIX for 20261003001241 (project-wide grant hardening).
--
-- That migration rebuilt function grants from the catalogue and granted a
-- function only to `authenticated, service_role`:
--
--     execute format('revoke all on function %s from public, anon', sig);
--     execute format('grant execute on function %s to authenticated, service_role', sig);
--
-- That is correct for functions the *client* calls. It is wrong for the eight
-- helpers that appear inside row-level-security policies, because a policy
-- predicate is evaluated AS THE QUERYING ROLE. Any query arriving as `anon`
-- -- which includes the very first dashboard/PostgREST request before the
-- user's JWT is attached, and every signed-out page load -- makes PostgreSQL
-- demand EXECUTE on those helpers for `anon`, and the request dies with:
--
--     {"code":"42501","message":"permission denied for function current_school_id"}
--
-- Live proof (project omcddzmtjqhrsxdxiewn, observed 2026-10-19):
--     GET /rest/v1/schools?select=slug   (apikey only, no bearer)
--       -> 401 42501 permission denied for function current_school_id
--     POST /rest/v1/rpc/current_school_id (apikey only, no bearer)
--       -> 401 42501 permission denied for function current_school_id
--
-- Before 20261003001241 these helpers were PUBLIC-executable (Postgres grants
-- EXECUTE to PUBLIC by default), which is exactly why the policies worked.
--
-- ---------------------------------------------------------------------------
-- WHY RESTORING ANON EXECUTE HERE IS NOT A PRIVILEGE ESCALATION
-- ---------------------------------------------------------------------------
-- These eight are read-only predicates, never writers:
--
--   * all eight are `language sql` + `stable` + `security definer` +
--     `set search_path = public`;
--   * none takes a target-user parameter -- every one resolves the caller
--     through auth.uid();
--   * every one RETURNS a boolean or a uuid. There is no INSERT/UPDATE/DELETE,
--     no DDL, and no way to name another user;
--   * for `anon`, auth.uid() is NULL by definition, so every predicate returns
--     false / NULL. Restoring EXECUTE lets the policy be *evaluated* and
--     correctly deny; it does not let a signed-out visitor read a single row.
--
-- The escalation surface stays closed where it actually matters: the two
-- helpers that can WRITE (`activate_administrator`, which flips account_type,
-- and `handle_new_auth_user`, which inserts profiles) keep anon revoked, and
-- `public.profiles` self-update still cannot change account_type / school_id /
-- email (20260101000300, 20261018000000).
--
-- All statements are idempotent: GRANT/REVOKE converge, nothing is dropped.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Restore EXECUTE to anon for every RLS policy predicate.
--
--    PostgreSQL is explicit that this is required: "users who are using a given
--    policy must be able to access any tables or functions referenced in the
--    expression or they will simply receive a permission denied error when
--    attempting to query the table that has row-level security enabled."
--
--    is_club_admin() is included even though it is the broadest predicate: it
--    is referenced from ~50 policies, so leaving it revoked would leave those
--    policies throwing for anon instead of evaluating to false.
-- ---------------------------------------------------------------------------
grant execute on function
  public.current_school_id(),
  public.current_profile(),
  public.is_administrator(),
  public.is_club_member(uuid),
  public.is_club_leader(uuid),
  public.is_club_admin(uuid),
  public.has_club_permission(uuid, public.club_permission),
  public.can_read_club(uuid)
to anon;

-- ---------------------------------------------------------------------------
-- 2. Keep EXECUTE for authenticated / service_role / postgres.
--    (Already held; restated so this migration is self-contained and re-runnable.)
-- ---------------------------------------------------------------------------
grant execute on function
  public.current_school_id(),
  public.current_profile(),
  public.is_administrator(),
  public.is_club_member(uuid),
  public.is_club_leader(uuid),
  public.is_club_admin(uuid),
  public.has_club_permission(uuid, public.club_permission),
  public.can_read_club(uuid)
to authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- 3. Re-assert the boundary that actually protects privilege escalation.
--
--    The two helpers that can WRITE stay revoked from anon:
--
--      activate_administrator() -- flips account_type to 'administrator'
--      handle_new_auth_user()   -- inserts a profiles row on signup
--
--    Both need `authenticated` (the app calls activate_administrator after the
--    emailed link is opened; the signup trigger runs as the signing-up role),
--    and neither is referenced by any policy, so revoking anon breaks nothing.
--
--    These are the only functions in this migration that an unauthenticated
--    caller could have turned into a state change, and they remain closed.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.activate_administrator(),
  public.handle_new_auth_user()
from public, anon;

grant execute on function public.activate_administrator()
  to authenticated, service_role, postgres;

-- handle_new_auth_user() is a trigger function: it runs as the role that
-- performed the signup, never as a browser client.
grant execute on function public.handle_new_auth_user()
  to service_role, supabase_auth_admin, postgres, authenticator;

-- ---------------------------------------------------------------------------
-- 4. Verification queries (run manually against the live project to confirm).
--
--    -- Should list the eight policy predicates for grantee = 'anon':
--    select p.proname, r.rolname
--    from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--    cross join lateral aclexplode(coalesce(p.proacl, '{}')) a
--    join pg_roles r on r.oid = a.grantee
--    where n.nspname = 'public'
--      and r.rolname in ('anon','authenticated')
--      and p.proname in ('current_school_id','current_profile',
--                        'is_administrator','is_club_member','is_club_leader',
--                        'is_club_admin','has_club_permission','can_read_club')
--    order by 1, 2;
--
--    -- Should return NO rows (these must never be anon-executable):
--    select p.proname
--    from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--    cross join lateral aclexplode(coalesce(p.proacl, '{}')) a
--    join pg_roles r on r.oid = a.grantee
--    where n.nspname = 'public'
--      and r.rolname = 'anon'
--      and p.proname in ('activate_administrator','handle_new_auth_user');
--
--    -- Post-fix live check that previously failed with 42501:
--    --   GET /rest/v1/schools?select=slug   (apikey only, no bearer)
--    --   expect 200 [] (zero rows, because anon owns nothing) -- not 42501.
-- ---------------------------------------------------------------------------
