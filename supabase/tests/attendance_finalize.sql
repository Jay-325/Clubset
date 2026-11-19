-- ============================================================================
-- Clubset :: Phase 1 attendance finalization (pgTAP)
--
-- Regression for F-04: finalize_attendance() was SECURITY INVOKER, so its
-- UPDATE of events.attendance_finalized ran under events_update_leader and
-- silently matched zero rows for a leader holding only manage_attendance.
-- The event was left unfinalized while the RPC returned a summary.
--
-- Also pins the veto behaviour: a vetoed RSVP is already finalized and keeps
-- its attendance_corrections evidence, so finalization never overwrites it.
-- ============================================================================

begin;

set local search_path = public, extensions;
create extension if not exists pgtap;

select plan(6);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into public.schools (id, name, slug, email_domain)
values (
  '00000000-0000-0000-0000-00000000c2ff',
  'pgTAP Attendance School',
  'pgtap-attendance',
  'pgtap.invalid'
)
on conflict (id) do nothing;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-00000000c201', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'attendance-leader@pgtap.invalid', '', now()),
  ('00000000-0000-0000-0000-00000000c202', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'attendance-member@pgtap.invalid', '', now()),
  ('00000000-0000-0000-0000-00000000c203', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'attendance-vetoed@pgtap.invalid', '', now())
on conflict (id) do nothing;

update public.profiles
set school_id = '00000000-0000-0000-0000-00000000c2ff',
    account_type = 'student'
where id in (
  '00000000-0000-0000-0000-00000000c201',
  '00000000-0000-0000-0000-00000000c202',
  '00000000-0000-0000-0000-00000000c203'
);

insert into public.clubs (id, school_id, name, type, commitment, founder_id, status)
values (
  '00000000-0000-0000-0000-00000000c210',
  '00000000-0000-0000-0000-00000000c2ff',
  'Attendance Club',
  'recreational',
  'medium',
  '00000000-0000-0000-0000-00000000c201',
  'approved'
);

insert into public.memberships (club_id, user_id, status, joined_at)
values
  ('00000000-0000-0000-0000-00000000c210', '00000000-0000-0000-0000-00000000c201', 'active', now()),
  ('00000000-0000-0000-0000-00000000c210', '00000000-0000-0000-0000-00000000c202', 'active', now()),
  ('00000000-0000-0000-0000-00000000c210', '00000000-0000-0000-0000-00000000c203', 'active', now());

-- A role with manage_attendance ONLY: no manage_events.
insert into public.leadership_roles (id, club_id, name, permissions, is_review_supervisor)
values (
  '00000000-0000-0000-0000-00000000c220',
  '00000000-0000-0000-0000-00000000c210',
  'Attendance Manager',
  array['manage_attendance']::public.club_permission[],
  false
);

insert into public.role_assignments (role_id, club_id, user_id, assigned_by)
values (
  '00000000-0000-0000-0000-00000000c220',
  '00000000-0000-0000-0000-00000000c210',
  '00000000-0000-0000-0000-00000000c201',
  '00000000-0000-0000-0000-00000000c201'
);

insert into public.events (id, club_id, created_by, title, starts_at, ends_at)
values (
  '00000000-0000-0000-0000-00000000c230',
  '00000000-0000-0000-0000-00000000c210',
  '00000000-0000-0000-0000-00000000c201',
  'Weekly meeting',
  now() - interval '2 hours',
  now() - interval '1 hour'
);

insert into public.attendance (event_id, user_id, source, status, finalized_at)
values
  ('00000000-0000-0000-0000-00000000c230', '00000000-0000-0000-0000-00000000c202', 'rsvp', 'rsvp_pending', null),
  ('00000000-0000-0000-0000-00000000c230', '00000000-0000-0000-0000-00000000c203', 'manual', 'did_not_attend', now());

insert into public.attendance_corrections (
  attendance_id, event_id, user_id, original_status, new_status, corrected_by, reason
)
select
  a.id,
  a.event_id,
  a.user_id,
  'rsvp_pending'::public.attendance_status,
  'did_not_attend'::public.attendance_status,
  '00000000-0000-0000-0000-00000000c201',
  'Did not turn up'
from public.attendance a
where a.event_id = '00000000-0000-0000-0000-00000000c230'
  and a.user_id = '00000000-0000-0000-0000-00000000c203';

-- ---------------------------------------------------------------------------
-- A leader with only manage_attendance finalizes the event
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c201"}', true);

select lives_ok(
  $$select public.finalize_attendance('00000000-0000-0000-0000-00000000c230')$$,
  'an attendance-only leader can finalize'
);
reset role;

select is(
  (select attendance_finalized from public.events where id = '00000000-0000-0000-0000-00000000c230'),
  true,
  'the event itself is marked finalized'
);

select is(
  (
    select status
    from public.attendance
    where event_id = '00000000-0000-0000-0000-00000000c230'
      and user_id = '00000000-0000-0000-0000-00000000c202'
  ),
  'attended'::public.attendance_status,
  'a pending RSVP is confirmed as attended'
);

select is(
  (
    select status
    from public.attendance
    where event_id = '00000000-0000-0000-0000-00000000c230'
      and user_id = '00000000-0000-0000-0000-00000000c203'
  ),
  'did_not_attend'::public.attendance_status,
  'a vetoed RSVP is not overwritten'
);

select ok(
  exists (
    select 1
    from public.attendance_corrections ac
    where ac.event_id = '00000000-0000-0000-0000-00000000c230'
      and ac.user_id = '00000000-0000-0000-0000-00000000c203'
      and ac.reason = 'Did not turn up'
  ),
  'the veto evidence survives finalization'
);

select ok(
  exists (
    select 1 from public.audit_logs
    where action = 'attendance.finalized'
      and object_id = '00000000-0000-0000-0000-00000000c230'
  ),
  'finalization is audited'
);

select * from finish();
rollback;
