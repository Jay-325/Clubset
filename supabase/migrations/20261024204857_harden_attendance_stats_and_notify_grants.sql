-- ============================================================================
-- Joinin :: 2026-10-24 -- close two SECURITY DEFINER RPC gaps
--
-- READ THIS FIRST (grant invariant, learned the hard way):
--   A function referenced inside an RLS policy expression must keep EXECUTE
--   for every role that can query the table, including `anon`, because
--   Postgres evaluates the policy as the querying role. This migration
--   therefore touches no policy helper. See 20261019000100.
--
-- FINDING 1 -- public.attendance_stats(target_club, student_id)
--   SECURITY DEFINER, executable by `authenticated`, with no caller check.
--   Any signed-in student could read any other student's attendance totals in
--   any club. Proven on a rolled-back transaction (2026-10-24): a non-member
--   of the club read {"attended": 1, "attendance_rate": 1.000} for another
--   student.
--
--   Fix: gate inside the function. Allowed callers are
--     * the student themselves,
--     * any leader of that club (role_assignments -- this covers
--       manage_attendance, manage_leadership and the
--       application_review_packet -> check_eligibility -> attendance_stats
--       path, which calls it for a different student),
--     * a linked club administrator,
--     * a school administrator.
--   Every legitimate caller keeps the same result shape; only unauthorised
--   callers now receive 42501.
--
-- FINDING 2 -- public.notify_user() / public.notify_club_leaders()
--   SECURITY DEFINER, executable by `authenticated`, with no caller check.
--   Any signed-in user could insert arbitrary notifications into any inbox
--   (phishing / spam). Proven: a non-member injected a notification row into
--   another student's inbox.
--
--   Both functions are only invoked from SECURITY DEFINER trigger functions
--   owned by postgres (notify_on_application_submitted,
--   notify_on_membership_decided, notify_on_join_request, notify_on_rsvp,
--   notify_on_announcement). A SECURITY DEFINER function executes with the
--   owner's privileges, so postgres keeps EXECUTE and the triggers keep
--   working. No application code calls either function through RPC.
--
-- DELIBERATELY NOT CHANGED
--   * record_audit() stays executable by `authenticated`: six SECURITY
--     INVOKER RPCs (add_transaction, apply_for_role, correct_attendance,
--     finalize_attendance, publish_form, review_application) call it as the
--     caller, so revoking the grant would break those features. A caller can
--     only forge rows attributed to their own auth.uid(), and only school
--     administrators can read audit_logs. Residual risk is accepted and
--     documented in the audit report.
--   * Policy predicates (can_read_club, current_profile, current_school_id,
--     has_club_permission, is_administrator, is_club_admin, is_club_leader,
--     is_club_member) keep EXECUTE for anon. Removing it breaks signed-out
--     reads with 42501.
--
-- TABLE PRIVILEGES
--   anon/authenticated hold the Supabase default ALL grant on public tables,
--   which includes TRUNCATE, REFERENCES and TRIGGER. PostgREST never issues
--   any of those, but they are not needed by the application and TRUNCATE is
--   not filtered by RLS, so they are revoked. SELECT/INSERT/UPDATE/DELETE are
--   untouched (RLS governs them), and service_role is untouched.
--
-- ROLLBACK
--   create or replace function public.attendance_stats(uuid, uuid) ...   -- restore from 20260101000003_events_attendance.sql
--   grant execute on function public.notify_user(uuid, notification_type, text, text, text) to authenticated;
--   grant execute on function public.notify_club_leaders(uuid, notification_type, text, text, text) to authenticated;
--   grant truncate, references, trigger on all tables in schema public to anon, authenticated;
--
-- No table, column, policy, row or index is touched.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. attendance_stats: add the missing caller authorization
-- ---------------------------------------------------------------------------
create or replace function public.attendance_stats(target_club uuid, student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  totals jsonb;
begin
  if not (
    student_id = auth.uid()
    or public.is_club_leader(target_club)
    or public.is_club_admin(target_club)
    or public.is_administrator()
  ) then
    raise exception 'You are not allowed to view this attendance summary'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'attended', count(*) filter (where status = 'attended'),
    'missed', count(*) filter (where status = 'did_not_attend'),
    'attendance_rate',
      case
        when count(*) filter (where status in ('attended', 'did_not_attend')) = 0 then null
        else round(
          count(*) filter (where status = 'attended')::numeric
          / count(*) filter (where status in ('attended', 'did_not_attend'))::numeric,
          3
        )
      end
  )
  into totals
  from public.finalized_attendance fa
  where fa.club_id = target_club
    and fa.user_id = student_id;

  return totals;
end;
$$;

comment on function public.attendance_stats(uuid, uuid) is
  'Attendance totals for one student. SECURITY DEFINER with an explicit caller gate: self, club leader, linked club administrator, or school administrator.';

-- CREATE OR REPLACE preserves the existing ACL, but state the intended grant
-- explicitly so this function cannot drift back to anon-callable.
revoke execute on function public.attendance_stats(uuid, uuid) from public, anon;
grant execute on function public.attendance_stats(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. notification writers: remove the client-facing EXECUTE grant
--    (trigger functions run as the definer, so they keep working)
-- ---------------------------------------------------------------------------
revoke execute on function public.notify_user(uuid, notification_type, text, text, text)
  from public, anon, authenticated;
grant execute on function public.notify_user(uuid, notification_type, text, text, text)
  to service_role;

revoke execute on function public.notify_club_leaders(uuid, notification_type, text, text, text)
  from public, anon, authenticated;
grant execute on function public.notify_club_leaders(uuid, notification_type, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. drop table privileges the Data API never uses
-- ---------------------------------------------------------------------------
revoke truncate, references, trigger on all tables in schema public
  from anon, authenticated;

commit;
