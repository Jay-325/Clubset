-- ============================================================================
-- Joinin :: 03 Events, RSVPs, attendance, corrections, calendar conflicts
--
-- This is the PRD's signature flow (PRD 47):
--   Event -> RSVP -> Expected Attendance -> Meeting -> Leader corrects
--   -> Final Attendance -> Club Activity Data
--
-- The invariants live here, not in the client:
--   * RSVP means INTENT, not confirmed attendance (PRD 53.10)
--   * An RSVP auto-creates an expected-attendance record (PRD 16)
--   * A veto removes the RSVP-derived credit only (PRD 17)
--   * Stats use FINALIZED attendance, never RSVP counts (PRD 34, 53.14)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'events'
  ) then
    create table public.events (
      id uuid primary key default gen_random_uuid(),
      club_id uuid not null references public.clubs (id) on delete cascade,
      created_by uuid references public.profiles (id) on delete set null,
      title text not null,
      description text not null default '',
      kind public.event_kind not null default 'meeting',
      location text not null default '',
      starts_at timestamptz not null,
      ends_at timestamptz not null,
      priority public.event_priority not null default 'normal',
      rsvp_enabled boolean not null default true,
      attendance_finalized boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint events_time_order check (ends_at > starts_at)
    );
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'events' and indexname = 'events_club_time_idx'
  ) then
    create index events_club_time_idx on public.events (club_id, starts_at);
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'events' and indexname = 'events_time_idx'
  ) then
    create index events_time_idx on public.events using gist (tstzrange(starts_at, ends_at, '[)'));
  end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'events' and t.tgname = 'events_touch_updated_at'
  ) then
    create trigger events_touch_updated_at
      before update on public.events
      for each row execute function public.touch_updated_at();
  end if;
end$$;

-- trigger handled above in guarded block

-- ---------------------------------------------------------------------------
-- RSVPs
-- ---------------------------------------------------------------------------

create type public.rsvp_status as enum ('going', 'maybe', 'not_going');

create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.rsvp_status not null default 'going',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One RSVP per student per event; changing it updates the row.
  unique (event_id, user_id)
);

create index rsvps_event_idx on public.rsvps (event_id, status);
create index rsvps_user_idx on public.rsvps (user_id);

create trigger rsvps_touch_updated_at
  before update on public.rsvps
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Attendance
--
-- Four distinct states (PRD 18). "rsvp_pending" exists so an unreviewed RSVP
-- is never mistaken for confirmed real-world attendance.
-- ---------------------------------------------------------------------------

create type public.attendance_status as enum (
  'attended',
  'did_not_attend',
  'rsvp_pending',
  'not_applicable'
);

create type public.attendance_source as enum ('rsvp', 'manual');

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  source public.attendance_source not null,
  status public.attendance_status not null,
  note text,
  finalized_by uuid references public.profiles (id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (event_id, user_id)
);

create index attendance_event_idx on public.attendance (event_id, status);
create index attendance_user_idx on public.attendance (user_id, status);

create trigger attendance_touch_updated_at
  before update on public.attendance
  for each row execute function public.touch_updated_at();

-- Attendance counts toward leadership eligibility ONLY when finalized and
-- marked attended (PRD 34). This view is the single source of truth for
-- eligibility checks, so a raw RSVP can never leak into the numbers.
create or replace view public.finalized_attendance
with (security_invoker = true) as
select
  a.user_id,
  e.club_id,
  a.event_id,
  a.status,
  e.starts_at
from public.attendance a
join public.events e on e.id = a.event_id
where e.attendance_finalized = true
  and a.status in ('attended', 'did_not_attend');

-- ---------------------------------------------------------------------------
-- Attendance corrections (PRD 42)
--
-- Corrections are auditable because they change student activity records.
-- ---------------------------------------------------------------------------

create table public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  original_status public.attendance_status not null,
  new_status public.attendance_status not null,
  corrected_by uuid references public.profiles (id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index attendance_corrections_event_idx
  on public.attendance_corrections (event_id, created_at desc);
create index attendance_corrections_user_idx
  on public.attendance_corrections (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Event preferences (PRD 15: "preferred club/event" for conflict display)
-- ---------------------------------------------------------------------------

create table public.event_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  is_preferred boolean not null default true,
  primary key (user_id, club_id)
);

-- ---------------------------------------------------------------------------
-- Automatic attendance generation from RSVPs (PRD 16)
--
-- "RSVP -> initially counted toward attendance". Deliberately does NOT set
-- status='attended'; it sets 'rsvp_pending' so the record is present for the
-- leader but is not yet a claim about reality (PRD 18).
-- ---------------------------------------------------------------------------

create or replace function public.apply_rsvp_to_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_event uuid := coalesce(new.event_id, old.event_id);
  attendee uuid := coalesce(new.user_id, old.user_id);
  rsvp_state public.rsvp_status;
begin
  select status into rsvp_state from public.rsvps where id = coalesce(new.id, old.id);

  if rsvp_state = 'going' then
    insert into public.attendance (event_id, user_id, source, status)
    values (target_event, attendee, 'rsvp', 'rsvp_pending')
    on conflict (event_id, user_id) do update
      set source = 'rsvp',
          -- A vetoed record must not silently revert to pending when the
          -- student re-RSVPs; leadership re-added it manually.
          status = case
            when attendance.source = 'manual' then attendance.status
            else 'rsvp_pending'
          end,
          updated_at = now();
  else
    -- Cancelling an RSVP withdraws the RSVP-derived expectation.
    delete from public.attendance
    where event_id = target_event
      and user_id = attendee
      and source = 'rsvp'
      and status = 'rsvp_pending';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger rsvps_apply_attendance
  after insert or update or delete on public.rsvps
  for each row execute function public.apply_rsvp_to_attendance();

-- ---------------------------------------------------------------------------
-- Set an RSVP (PRD 16, 19)
-- ---------------------------------------------------------------------------

create or replace function public.set_rsvp(target_event uuid, going boolean)
returns public.rsvps
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_club uuid;
  rsvp_enabled boolean;
  result public.rsvps;
begin
  select e.club_id, e.rsvp_enabled into target_club, rsvp_enabled
  from public.events e where e.id = target_event;

  if target_club is null then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  -- Only members of the club the event belongs to may RSVP.
  if not public.is_club_member(target_club) then
    raise exception 'Join this club before RSVPing to its events'
      using errcode = '42501';
  end if;

  if not rsvp_enabled then
    raise exception 'RSVP is turned off for this event' using errcode = '23514';
  end if;

  insert into public.rsvps (event_id, user_id, status)
  values (target_event, auth.uid(), case when going then 'going' else 'not_going' end)
  on conflict (event_id, user_id) do update
    set status = case when going then 'going' else 'not_going' end,
        updated_at = now()
  returning * into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Attendance correction / veto (PRD 17)
--
-- A veto means ONLY "this RSVP should not count as attendance because the
-- student did not show up". It is explicitly NOT a ban and carries no
-- penalty (PRD 17, 53.13) -- which is why nothing here writes a
-- consequence onto the student's profile.
-- ---------------------------------------------------------------------------

create or replace function public.correct_attendance(
  target_attendance uuid,
  new_status public.attendance_status,
  correction_reason text default null
)
returns public.attendance
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_event uuid;
  target_club uuid;
  record_row public.attendance;
  previous_status public.attendance_status;
begin
  select a.event_id, e.club_id into target_event, target_club
  from public.attendance a
  join public.events e on e.id = a.event_id
  where a.id = target_attendance;

  if target_event is null then
    raise exception 'Attendance record not found' using errcode = 'P0002';
  end if;

  if not (
    public.has_club_permission(target_club, 'manage_attendance')
    or public.is_club_admin(target_club)
  ) then
    raise exception 'You do not have permission to correct attendance'
      using errcode = '42501';
  end if;

  select status into previous_status
  from public.attendance where id = target_attendance;

  update public.attendance
  set status = new_status,
      source = 'manual',
      finalized_by = auth.uid(),
      finalized_at = now(),
      note = correction_reason
  where id = target_attendance
  returning * into record_row;

  insert into public.attendance_corrections (
    attendance_id, event_id, user_id, original_status, new_status, corrected_by, reason
  )
  values (
    target_attendance, target_event, record_row.user_id,
    previous_status, new_status, auth.uid(), correction_reason
  );

  perform public.record_audit(
    'attendance.corrected',
    'attendance',
    target_attendance,
    jsonb_build_object(
      'event_id', target_event,
      'user_id', record_row.user_id,
      'from', previous_status,
      'to', new_status,
      'reason', correction_reason
    )
  );

  return record_row;
end;
$$;

-- Veto shorthand (PRD 17): remove the RSVP-derived credit.
create or replace function public.veto_rsvp(target_attendance uuid, correction_reason text default null)
returns public.attendance
language plpgsql
security invoker
set search_path = public
as $$
begin
  return public.correct_attendance(target_attendance, 'did_not_attend', correction_reason);
end;
$$;

-- Leader adds a student who attended without an RSVP (PRD 18), when the club
-- permits it.
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
    case when present then 'attended' else 'did_not_attend' end,
    note, auth.uid(), now()
  )
  on conflict (event_id, user_id) do update
    set source = 'manual',
        status = case when present then 'attended' else 'did_not_attend' end,
        note = note,
        finalized_by = auth.uid(),
        finalized_at = now(),
        updated_at = now()
  returning * into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Attendance finalization (PRD 18)
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
  set status = 'attended',
      finalized_by = auth.uid(),
      finalized_at = now()
  where event_id = target_event
    and status = 'rsvp_pending'
    and attendance_finalized_at is null;

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

-- ---------------------------------------------------------------------------
-- Calendar conflict detection (PRD 15)
--
-- Flags overlaps; it does NOT auto-RSVP the student to the higher-priority
-- event (PRD 53.15).
-- ---------------------------------------------------------------------------

create or replace function public.find_calendar_conflicts(
  from_time timestamptz,
  to_time timestamptz
)
returns table (
  event_id uuid,
  conflicting_event_id uuid,
  club_name text,
  conflicting_club_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_preferred boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with my_events as (
    select e.*, c.name as club_name
    from public.events e
    join public.clubs c on c.id = e.club_id
    where e.starts_at < to_time
      and e.ends_at > from_time
      and public.is_club_member(e.club_id)
  )
  select
    a.id,
    b.id,
    a.club_name,
    b.club_name,
    greatest(a.starts_at, b.starts_at),
    least(a.ends_at, b.ends_at),
    coalesce(
      (select ep.is_preferred from public.event_preferences ep
        where ep.user_id = auth.uid() and ep.club_id = a.club_id),
      false
    )
  from my_events a
  join my_events b
    on a.id < b.id
    and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(b.starts_at, b.ends_at, '[)')
  order by greatest(a.starts_at, b.starts_at);
$$;

-- ---------------------------------------------------------------------------
-- Attendance statistics (PRD 18)
--
-- Built on finalized attendance only (PRD 34).
-- ---------------------------------------------------------------------------

create or replace function public.attendance_stats(target_club uuid, student_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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
  from public.finalized_attendance fa
  where fa.club_id = target_club
    and fa.user_id = student_id;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.events enable row level security;
alter table public.rsvps enable row level security;
alter table public.attendance enable row level security;
alter table public.attendance_corrections enable row level security;
alter table public.event_preferences enable row level security;

-- Members see their club's events (PRD 13: the calendar combines clubs the
-- student has joined).
create policy events_select_member on public.events
  for select
  using (public.can_read_club(club_id));

create policy events_insert_leader on public.events
  for insert
  with check (
    created_by = auth.uid()
    and public.has_club_permission(club_id, 'manage_events')
  );

create policy events_update_leader on public.events
  for update
  using (
    public.has_club_permission(club_id, 'manage_events')
    or public.is_club_admin(club_id)
  )
  with check (
    public.has_club_permission(club_id, 'manage_events')
    or public.is_club_admin(club_id)
  );

create policy events_delete_leader on public.events
  for delete
  using (
    public.has_club_permission(club_id, 'manage_events')
    or public.is_club_admin(club_id)
  );

-- Students see only their own RSVP; leaders see who is coming (PRD 19).
create policy rsvps_select on public.rsvps
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = rsvps.event_id
        and (public.has_club_permission(e.club_id, 'manage_events')
             or public.has_club_permission(e.club_id, 'manage_attendance')
             or public.is_club_admin(e.club_id))
    )
  );

-- RSVPs are written only through set_rsvp() so the RSVP->attendance trigger
-- always fires and membership is always checked.
create policy rsvps_insert_via_rpc on public.rsvps
  for insert
  with check (user_id = auth.uid());

create policy rsvps_update_own on public.rsvps
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Students see their own record; leaders review the roster.
create policy attendance_select on public.attendance
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = attendance.event_id
        and (public.has_club_permission(e.club_id, 'manage_attendance')
             or public.is_club_admin(e.club_id))
    )
  );

-- Writes only via correct_attendance / add_manual_attendance / finalize.
create policy attendance_insert_leader on public.attendance
  for insert
  with check (
    exists (
      select 1 from public.events e
      where e.id = attendance.event_id
        and (public.has_club_permission(e.club_id, 'manage_attendance')
             or public.is_club_admin(e.club_id))
    )
  );

create policy attendance_update_leader on public.attendance
  for update
  using (
    exists (
      select 1 from public.events e
      where e.id = attendance.event_id
        and (public.has_club_permission(e.club_id, 'manage_attendance')
             or public.is_club_admin(e.club_id))
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = attendance.event_id
        and (public.has_club_permission(e.club_id, 'manage_attendance')
             or public.is_club_admin(e.club_id))
    )
  );

-- Only the leader who corrected it, plus the affected student, sees the log
-- entry -- a veto is not a public event and carries no shame mechanic.
create policy attendance_corrections_select on public.attendance_corrections
  for select
  using (
    user_id = auth.uid()
    or corrected_by = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = attendance_corrections.event_id
        and public.has_club_permission(e.club_id, 'manage_attendance')
    )
  );

-- Students manage only their own conflict preference (organizational, not a
-- permission change).
create policy event_preferences_own on public.event_preferences
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());