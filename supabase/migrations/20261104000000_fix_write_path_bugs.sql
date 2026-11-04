-- ============================================================================
-- Clubset :: 2026-11-04 -- fix write-path bugs discovered in testing
--
-- Fixes confirmed against the local Docker Supabase stack:
--
--  1. public.record_audit() lacks EXECUTE for `authenticated`. finalize_attendance()
--     is SECURITY INVOKER and calls public.record_audit() as the caller, so
--     attendance finalization fails with 42501 permission denied.
--     correct_attendance() calls private.record_audit() which already carries
--     the grant, so it is unaffected.
--
--  2. add_manual_attendance() has `note = note` in the ON CONFLICT DO UPDATE
--     SET clause, which is ambiguous between the table column and the PL/pgSQL
--     parameter (42702). Changed to `note = excluded.note`.
--
--  3. finalize_attendance() migration source (20260101000003_events_attendance.sql)
--     references nonexistent column attendance_finalized_at; the actual column
--     is finalized_at. Recreate the function with the correct reference so the
--     deployed function and migration source stay in sync. Idempotent.
--
-- RLS: All table-level grants already exist for `authenticated`; RLS policies
-- remain unchanged. No RLS is weakened, no table is newly exposed, and
-- admin_allowlist is never granted to authenticated or anon.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Grant EXECUTE on public.record_audit to authenticated
-- ---------------------------------------------------------------------------
grant execute on function public.record_audit(text, text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Fix add_manual_attendance(): ambiguous column reference "note"
-- ---------------------------------------------------------------------------
create or replace function public.add_manual_attendance(
  target_event uuid,
  student_id uuid,
  present boolean default true,
  note text default null
)
returns public.attendance
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_club uuid;
  result public.attendance;
begin
  select club_id into target_club from public.events where id = target_event;

  if target_club is null then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  if not (
    public.has_club_permission(target_club, 'manage_attendance')
    or public.is_club_admin(target_club)
  ) then
    raise exception 'You do not have permission to manage attendance'
      using errcode = '42501';
  end if;

  insert into public.attendance (event_id, user_id, source, status, note, finalized_by, finalized_at)
  values (
    target_event, student_id, 'manual',
    case when present then 'attended'::public.attendance_status else 'did_not_attend'::public.attendance_status end,
    note, auth.uid(), now()
  )
  on conflict (event_id, user_id) do update
    set source = 'manual',
        status = case when present then 'attended'::public.attendance_status else 'did_not_attend'::public.attendance_status end,
        note = excluded.note,
        finalized_by = auth.uid(),
        finalized_at = now(),
        updated_at = now()
  returning * into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Recreate finalize_attendance() with correct column reference
-- ---------------------------------------------------------------------------
create or replace function public.finalize_attendance(target_event uuid)
returns jsonb
language plpgsql
security invoker
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

  perform public.record_audit(
    'attendance.finalized', 'event', target_event, summary
  );

  return summary;
end;
$$;

comment on function public.finalize_attendance(uuid) is
  'Finalizes attendance for an event. SECURITY INVOKER: requires manage_attendance or is_club_admin. Calls public.record_audit (EXECUTE granted to authenticated in this migration).';

commit;
