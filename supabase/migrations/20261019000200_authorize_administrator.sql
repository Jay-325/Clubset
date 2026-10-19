-- ============================================================================
-- Joinin :: 20261019 -- make arinjaypal@gmail.com a real, live administrator
--
-- WHY THIS MIGRATION EXISTS
-- ---------------------------------------------------------------------------
-- 20261018000000_admin_allowlist_authorization.sql rewrote
-- activate_administrator() to be allowlist-authoritative, and its header
-- asserted (lines 19-21):
--
--     "arinjaypal@gmail.com stays authorized through its existing allowlist
--      row (inserted by 20260101000100 / 20260101000200 and re-seeded in
--      supabase/seed.sql) -- it is deliberately NOT hard-coded here."
--
-- That assumption was FALSE against the live project. Read-only inspection of
-- omcddzmtjqhrsxdxiewn on 2026-10-19 showed:
--
--     select count(*) from public.schools;           -- 0
--     select count(*) from public.admin_allowlist;   -- 0
--
--     select id, email, email_confirmed_at from auth.users;
--     -- a55bfa14-...  arinjaypal@gmail.com  email_confirmed_at 2026-10-04
--
--   * 20260101000100 inserts the allowlist row with
--       "from public.schools s where s.slug = 'ridgeway'"
--     and 20260101000200 does the same. With ZERO rows in public.schools both
--     statements select from an empty set, so they insert nothing and raise
--     nothing. The migrations "succeeded" and seeded zero allowlist rows.
--     That is why the email appears throughout the repository while the live
--     authorisation does not exist.
--   * supabase/seed.sql would have created it, but seed.sql is explicitly
--     "SAFE TO RUN ONLY IN DEVELOPMENT" and was never run against production.
--
-- Net effect: the authenticated account exists and its email IS verified, but
-- it can never activate, because activate_administrator() correctly refuses
-- anyone whose exact email is absent from public.admin_allowlist.
--
-- ============================================================================
-- SCOPE / SAFETY
-- ============================================================================
-- Additive and idempotent. No DROP, no DELETE, no table/column/policy change,
-- no data loss, no reset. Nothing existing is overwritten: every insert is
-- guarded by NOT EXISTS / ON CONFLICT DO NOTHING. Safe to run more than once.
--
-- DESTRUCTIVE CHANGE LOG: NONE.
--
-- ============================================================================
-- THE SCHOOL ROW -- FAIRFIELD, NOT A FABRICATED ONE
-- ============================================================================
-- public.admin_allowlist.school_id is NOT NULL referencing public.schools(id),
-- so a school row must exist before an allowlist row can reference it.
-- public.schools is empty live.
--
-- This migration creates NO 'ridgeway' school. 'ridgeway' / 'ridgeway.edu' was
-- placeholder data invented during early development (it survives only in
-- seed.sql and in superseded migrations) and it is NOT the organisation this
-- app is for.
--
-- The real organisation is the Fairfield school district, whose exact domains
-- are stated by the application's own authorization rules in
-- 20260101000200_update_admin_authorization.sql:
--
--     -- Allowed domains: fairfieldschools.net, fairfieldschools.org (exact)
--
-- Those two domains are therefore the only school domains used here.
-- public.schools.email_domain is a single nullable text column and is purely
-- descriptive -- no function, policy or trigger reads it (verified live:
-- zero functions reference email_domain), so the district's .org sibling is
-- recorded in settings rather than by fabricating a second school row.
--
-- A school row is created ONLY when public.schools is completely empty, so a
-- project that already has a real tenant can never gain a second one here.
--
-- ============================================================================
-- ACCOUNT MODEL THIS MIGRATION PRESERVES (do not widen)
-- ============================================================================
--   * fairfieldschools.net / fairfieldschools.org  -> STUDENT accounts only.
--     Being on a school domain grants NOTHING administrative. Every new user
--     is a student: handle_new_auth_user() inserts profiles with the default
--     account_type ('student') and only links a school when the email matches
--     an active allowlist row.
--   * Administrator status is granted ONLY by an active row in
--     public.admin_allowlist. After this migration the allowlist holds exactly
--     ONE address: arinjaypal@gmail.com. No school domain is added to it.
--   * School-domain users therefore remain permanently unable to activate,
--     which is the entire point of 20261018000000.
--
-- This migration still does not hard-code authorisation into
-- activate_administrator(). It puts a row in the ONE table that function
-- consults, exactly as a school administrator would through the app. If that
-- row is later revoked (revoked_at set), activation stops -- the source file
-- having mentioned the address grants nothing.
--
-- ============================================================================
-- IDEMPOTENT UNIQUENESS
-- ============================================================================
-- The allowlist insert is guarded so a re-run cannot create a duplicate:
--   * explicit NOT EXISTS on lower(email) across the whole table,
--   * ON CONFLICT DO NOTHING without a conflict target, which is valid whether
--     or not the (school_id, email) unique constraint from 20260101000200
--     exists on this database,
--   * and the pre-existing check constraint admin_allowlist_email_normalized
--     (email = lower(email)) so the stored value is canonical lowercase.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Ensure the real (Fairfield) school exists, but ONLY if the table is
--    empty, so an existing production tenant is never shadowed.
-- ---------------------------------------------------------------------------
insert into public.schools (name, slug, email_domain, settings)
select
  'Fairfield Schools',
  'fairfield',
  'fairfieldschools.net',
  '{"allowed_email_domains":["fairfieldschools.net","fairfieldschools.org"]}'::jsonb
where not exists (select 1 from public.schools)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Authorize the administrator.
--
--    school_id is resolved by SELECTING the project's real school (preferring
--    the Fairfield slug, otherwise the oldest row) rather than by hard-coding
--    a uuid, so this binds to whatever school the project actually has.
--
--    email is stored lowercase and the statement is single-row-guarded by
--    NOT EXISTS, so it is a no-op on a database where authorisation already
--    exists.
-- ---------------------------------------------------------------------------
insert into public.admin_allowlist (school_id, email, full_name)
select s.id, 'arinjaypal@gmail.com', 'Arinjay Pal'
from public.schools s
where s.slug = 'fairfield'
  and not exists (
    select 1
    from public.admin_allowlist a
    where lower(a.email) = 'arinjaypal@gmail.com'
  )
order by s.created_at
limit 1
on conflict do nothing;

-- Fallback: if step 1 did not produce a 'fairfield' row because another school
-- already existed, still authorize the administrator against the project's real
-- school rather than leaving the allowlist empty.
insert into public.admin_allowlist (school_id, email, full_name)
select s.id, 'arinjaypal@gmail.com', 'Arinjay Pal'
from public.schools s
where not exists (
    select 1
    from public.admin_allowlist a
    where lower(a.email) = 'arinjaypal@gmail.com'
  )
order by s.created_at
limit 1
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Verification (run manually; expected: exactly one active row, and the
--    allowlist to contain NO school-domain address).
--
--    select a.email, a.revoked_at, s.slug, s.name, s.email_domain
--    from public.admin_allowlist a
--    join public.schools s on s.id = a.school_id
--    order by a.created_at;
--    -- expect exactly: arinjaypal@gmail.com | null | fairfield | Fairfield Schools
--
--    -- No @fairfieldschools.* address may ever appear here:
--    select count(*) from public.admin_allowlist
--    where email like '%@fairfieldschools.net' or email like '%@fairfieldschools.org';
--    -- expect: 0
--
--    -- And the RPC must now succeed when called AS that authenticated user
--    -- from the app after the emailed link is opened:
--    --   select public.activate_administrator();
--    --     -> returns the profile row with account_type = 'administrator'
-- ---------------------------------------------------------------------------

commit;
