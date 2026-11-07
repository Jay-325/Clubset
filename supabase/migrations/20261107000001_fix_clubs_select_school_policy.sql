-- ============================================================================
-- Clubset :: 2026-11-07 -- fix clubs_select_school RLS policy (VULN-001)
--
-- WHY
--   The deployed clubs_select_school policy was overly permissive:
--     (school_id = current_school_id()) AND is_anonymous IS DISTINCT FROM 'true'
--   This let any signed-in same-school student see ALL clubs, including
--   draft, pending, and rejected clubs. Migration 20261026000100 intended a
--   more restrictive policy using can_discover_club() for school-wide discovery
--   plus founder/member/administrator association for restricted clubs.
--
-- WHAT
--   Recreate clubs_select_school with the intended restrictive policy:
--     * School-wide discovery: approved clubs and clubs awaiting student
--       verification (via can_discover_club()).
--     * Restricted clubs: visible only to founder, members, and administrators.
--
-- ROLLBACK
--   Restore the permissive policy:
--     (school_id = current_school_id()) AND is_anonymous IS DISTINCT FROM 'true'
-- ============================================================================

begin;

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

comment on policy clubs_select_school on public.clubs is
  'School-wide discovery of approved/awaiting-verification clubs; restricted clubs visible only to founder, members, and administrators.';

commit;
