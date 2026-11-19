-- ============================================================================
-- Clubset :: 2026-11-18 -- same-school profile visibility (F-11)
--
-- Profiles RLS is self-only, so cross-user profile reads (members, chat
-- senders, announcement authors, attendance, join requests, leadership
-- applicants) return nothing for other students -- a pilot blocker.
--
-- Broadening profiles SELECT to all same-school rows would expose email /
-- account_type / school_id via `select *`, so column restriction is enforced
-- two ways:
--
--   1. profiles_public is re-created with a same-school WHERE clause and
--      exposes only non-sensitive columns (no email, account_type, school_id).
--      It is security_invoker = false (owned by postgres, bypasses RLS) so the
--      WHERE clause is the enforcement point; current_school_id() is SECURITY
--      DEFINER and reads the caller's own school.
--
--   2. A same-school SELECT policy on profiles lets same-school students read
--      each other's rows. The app must always select only display columns
--      (id, full_name, grade, avatar_url) -- never `select *` -- so sensitive
--      columns never reach the client through the profiles table.
--
-- The two NULL-school_id profiles are not modified: they match neither school
-- and remain visible only to themselves (via profiles_select_self).
--
-- ROLLBACK
--   Restore profiles_public without the WHERE clause and drop the policy.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. profiles_public: same-school scoped, limited columns only
-- ---------------------------------------------------------------------------
create or replace view public.profiles_public
  with (security_invoker = false)
as
  select
    id,
    full_name,
    grade,
    interests,
    commitment_hours,
    avatar_url,
    onboarding_complete,
    created_at,
    updated_at
  from public.profiles
  where school_id = public.current_school_id();

alter view public.profiles_public owner to postgres;
grant select on public.profiles_public to authenticated;

comment on view public.profiles_public is
  'Same-school, limited-column profile view for cross-user reads (members, chat, attendance, etc.). Excludes email, account_type and school_id.';

-- ---------------------------------------------------------------------------
-- 2. profiles: same-school SELECT so embedded joins (memberships, attendance,
--    dues) can read fellow students. Column restriction is the app's duty
--    (limited column selects); profiles_public is the guarded public view.
-- ---------------------------------------------------------------------------
create policy profiles_select_same_school on public.profiles
  for select
  using (school_id = public.current_school_id());

comment on policy profiles_select_same_school on public.profiles
  is 'A student may read profiles in their own school. App must select only display columns; sensitive columns stay off the client.';

commit;
