-- ============================================================================
-- Clubset :: 2026-10-26 -- separate club discovery from private club reads
--
-- WHY
--   public.can_read_club(target_club) used to return true for every signed-in
--   user in the same school:
--
--     is_club_member(target_club)
--     OR is_club_admin(target_club)
--     OR EXISTS (club is in the caller's school)
--
--   That third branch made every private club table school-wide readable:
--   transactions, budgets, data_table_rows, forms, events, announcements,
--   leadership_roles, role_assignments, chat_banners, club_administrators,
--   eligibility_requirements and application_questions.
--
--   can_read_club() is a policy predicate, so it cannot be revoked from anon /
--   authenticated. The fix is to narrow the predicate itself and add a separate
--   discovery predicate for the only rows that are genuinely school-wide.
--
-- WHAT THIS MIGRATION DOES
--   1. can_read_club() = active member OR linked/school administrator of that
--      club. This is the private-club predicate used by every existing policy
--      that already calls it.
--   2. can_discover_club() = same-school approved club, plus a club still
--      collecting its three student verifications (the verification flow needs
--      the proposed club row visible to same-school verifiers). It never grants
--      access to a private club table.
--   3. clubs_select_school keeps school-wide discovery of approved clubs but
--      stops exposing draft/rejected club rows to unrelated students. Founders,
--      members and administrators still see their own/unapproved clubs.
--   4. club_verifications_select keeps the proposed-club verification flow:
--      a student can see the verifier list of a same-school club that is still
--      awaiting student verification, but not the verifier list of an approved
--      club they have not joined.
--
-- WHY THE POLICY HELPERS KEEP EXECUTE FOR anon
--   PostgreSQL evaluates an RLS policy as the querying role, so every function
--   referenced in a policy needs EXECUTE for every role that can query the
--   table. Both helpers are read-only predicates that resolve the caller
--   through auth.uid()/current_school_id(); for anon they return false / no
--   rows. This is the grant invariant from 20261019000100.
--
-- ROLLBACK
--   Restore can_read_club() from 20260101000002_clubs.sql (including the
--   school branch), drop can_discover_club(), and recreate clubs_select_school
--   / club_verifications_select from that migration. No table or row changes.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Private club read predicate
-- ---------------------------------------------------------------------------
create or replace function public.can_read_club(target_club uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_club_member(target_club)
      or public.is_club_admin(target_club);
$$;

comment on function public.can_read_club(uuid) is
  'Private club read predicate: active member, linked club administrator, or school administrator for that club. School-wide discovery is can_discover_club().';

-- ---------------------------------------------------------------------------
-- 2. School-wide discovery predicate
--
--    Approved clubs are the discovery surface. A club that is still collecting
--    its student verifications must also be visible to same-school verifiers,
--    otherwise the verification step cannot complete. Neither case exposes
--    financial, data-table, event, form, announcement or leadership rows.
-- ---------------------------------------------------------------------------
create or replace function public.can_discover_club(target_club uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clubs c
    where c.id = target_club
      and c.school_id = public.current_school_id()
      and c.status in ('approved', 'awaiting_student_verification')
  );
$$;

comment on function public.can_discover_club(uuid) is
  'School-wide discovery predicate: same-school approved clubs and clubs awaiting student verification. Never grants access to private club tables.';

-- ---------------------------------------------------------------------------
-- 3. Club discovery stays school-wide for approved clubs; drafts and rejected
--    clubs are visible only to their founder, members and administrators.
-- ---------------------------------------------------------------------------
drop policy if exists clubs_select_school on public.clubs;

create policy clubs_select_school on public.clubs
  for select
  using (
    school_id = (select public.current_school_id())
    and (
      public.can_discover_club(id)
      or founder_id = (select auth.uid())
      or public.is_club_member(id)
      or public.is_club_admin(id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Student verification of a proposed club
--
--    The founder sees their own verification row; same-school students can see
--    the verifier list only while the club is awaiting student verification.
--    Once the club is approved, that list is private to members/administrators.
-- ---------------------------------------------------------------------------
drop policy if exists club_verifications_select on public.club_verifications;

create policy club_verifications_select on public.club_verifications
  for select
  using (
    user_id = (select auth.uid())
    or public.is_club_member(club_id)
    or public.is_club_admin(club_id)
    or exists (
      select 1
      from public.clubs c
      where c.id = club_verifications.club_id
        and c.school_id = (select public.current_school_id())
        and c.status = 'awaiting_student_verification'
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Grants (policy predicates must be executable by every querying role)
-- ---------------------------------------------------------------------------
revoke all on function public.can_read_club(uuid) from public;
grant execute on function public.can_read_club(uuid)
  to anon, authenticated, service_role, postgres;

revoke all on function public.can_discover_club(uuid) from public;
grant execute on function public.can_discover_club(uuid)
  to anon, authenticated, service_role, postgres;

commit;
