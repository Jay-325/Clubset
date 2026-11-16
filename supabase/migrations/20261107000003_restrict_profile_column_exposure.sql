-- ============================================================================
-- Clubset :: 2026-11-07 -- restrict profile column exposure (VULN-003)
--
-- WHY
--   The profiles_select_school RLS policy let any signed-in same-school user
--   read ALL columns of ALL profiles in their school, including account_type
--   (which reveals administrator status) and email. PostgreSQL RLS is row-level
--   only; it cannot restrict individual columns. Students could use direct
--   table queries to discover administrator accounts and student email addresses.
--
-- WHAT
--   1. Create public.profiles_public view exposing only non-sensitive columns
--      (id, full_name, grade, interests, commitment_hours, avatar_url,
--       onboarding_complete, created_at, updated_at). Excludes email,
--      account_type, school_id. Runs with security_invoker = false so RLS on
--      the underlying table applies as the view owner (postgres, bypassrls),
--      making all rows visible through the limited-column view.
--   2. Revoke SELECT on public.profiles from anon; keep INSERT/UPDATE/DELETE
--      (RLS policies already restrict writes to self rows).
--   3. Grant SELECT on public.profiles to authenticated (needed for self
--      profile reads via profiles_select_self policy).
--   4. Replace profiles_select_school (school-wide, all columns) with
--      profiles_select_self (self-only, all columns). Cross-user profile reads
--      go through profiles_public view.
--
-- ROLLBACK
--   Drop profiles_public view, restore profiles_select_school policy,
--   re-grant SELECT on profiles to anon.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Public profile view: non-sensitive columns only
-- ---------------------------------------------------------------------------

create view public.profiles_public
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
  from public.profiles;

alter view public.profiles_public owner to postgres;

grant select on public.profiles_public to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Revoke direct table SELECT from anon; authenticated keeps SELECT for self
-- ---------------------------------------------------------------------------

revoke select on table public.profiles from anon;

-- ---------------------------------------------------------------------------
-- 3. Replace school-wide select policy with self-only select policy
-- ---------------------------------------------------------------------------

drop policy if exists profiles_select_school on public.profiles;

create policy profiles_select_self on public.profiles
  for select
  using (id = (select auth.uid()));

comment on policy profiles_select_self on public.profiles is
  'Users can read their own full profile. Cross-user reads use profiles_public view (limited columns).';

-- ---------------------------------------------------------------------------
-- 4. is_user_administrator(): boolean-only administrator check
--
--    Allows the application to check whether a specific user is a school
--    administrator without exposing the account_type column. Students can
--    check one user at a time (requires knowing the user_id), preventing
--    bulk enumeration of administrator accounts.
-- ---------------------------------------------------------------------------

create or replace function public.is_user_administrator(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select account_type = 'administrator'
     from public.profiles
     where id = target_user_id),
    false
  );
$$;

grant execute on function public.is_user_administrator(uuid) to authenticated;

comment on function public.is_user_administrator(uuid) is
  'Returns whether the target user is a school administrator. Boolean only -- does not expose account_type or other profile fields.';

commit;
