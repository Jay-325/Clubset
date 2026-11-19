-- ============================================================================
-- Clubset :: 2026-11-17 -- finalize_attendance() back to SECURITY DEFINER (F-04)
--
-- 20261104000000 recreated finalize_attendance() as SECURITY INVOKER. It writes
-- two tables:
--
--   * events.attendance_finalized -- events_update_leader requires
--     manage_events, so a leader holding only manage_attendance updates ZERO
--     rows and the event is silently left unfinalized while the RPC returns a
--     summary;
--   * attendance.status -- the manage_attendance policy allows this one.
--
-- This restores the shape 20261026000200 deliberately introduced: SECURITY
-- DEFINER with an explicit internal manage_attendance / club-admin gate, and
-- the private audit writer. Authorization is unchanged -- the explicit gate is
-- the single check, and events_update_leader is not widened.
--
-- Pending RSVPs are still auto-confirmed (status rsvp_pending, finalized_at
-- null). A vetoed RSVP is did_not_attend with finalized_at set, so it is never
-- overwritten, and its attendance_corrections row remains the evidence.
--
-- ROLLBACK
--   Recreate finalize_attendance() from 20261104000000_fix_write_path_bugs.sql
--   as SECURITY INVOKER (the pre-fix behaviour).
-- ============================================================================

begin;

create or replace function public.finalize_attendance(target_event uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_club uuid;
  summary jsonb;
begin
  select club_id into target_club from public.events where id = target_event;

  if target_club is null then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  if not (
    public.has_club_permission(target_club, 'manage_attendance')
    or public.is_club_admin(target_club)
  ) then
    raise exception 'You do not have permission to finalize attendance'
      using errcode = '42501';
  end if;

  update public.events set attendance_finalized = true where id = target_event;

  -- Lock in whatever the leader left as 'rsvp_pending' by confirming it.
  update public.attendance
  set status = 'attended'::public.attendance_status,
      finalized_by = auth.uid(),
      finalized_at = now()
  where event_id = target_event
    and status = 'rsvp_pending'
    and finalized_at is null;

  select jsonb_build_object(
    'attended', count(*) filter (where status = 'attended'),
    'did_not_attend', count(*) filter (where status = 'did_not_attend'),
    'not_applicable', count(*) filter (where status = 'not_applicable')
  ) into summary
  from public.attendance
  where event_id = target_event;

  perform private.record_audit(
    'attendance.finalized', 'event', target_event, summary
  );

  return summary;
end;
$$;

comment on function public.finalize_attendance(uuid) is
  'Finalizes attendance for one event. SECURITY DEFINER with an explicit manage_attendance / club-admin gate so a leader without manage_events can still finalize the event row.';

revoke all on function public.finalize_attendance(uuid) from public, anon;
grant execute on function public.finalize_attendance(uuid)
  to authenticated, service_role;

commit;
