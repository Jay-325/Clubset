-- ============================================================================
-- Joinin :: 02 Clubs, membership, leadership roles & permissions
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Club lifecycle (PRD 7)
-- ---------------------------------------------------------------------------

create type public.club_status as enum (
  'draft',
  'awaiting_student_verification',
  'awaiting_administrator_verification',
  'approved',
  'rejected',
  'archived'
);

create type public.membership_status as enum (
  'pending',
  'active',
  'rejected',
  'removed'
);

-- Canonical permission slugs. Text[] keeps school-defined additions possible
-- without a migration; the check constraint rejects typos.
create type public.club_permission as enum (
  'manage_settings',
  'manage_membership',
  'manage_events',
  'manage_attendance',
  'manage_finances',
  'manage_forms',
  'manage_data_tables',
  'manage_leadership',
  'send_announcements',
  'moderate_chat'
);

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,

  name text not null,
  description text not null default '',
  type public.club_type not null,
  commitment public.commitment_level not null default 'medium',
  fields text[] not null default '{}',
  room text not null default '',

  -- PRD 7: regular meeting day/time
  meeting_day text,
  meeting_time time,

  status public.club_status not null default 'draft',
  founder_id uuid references public.profiles (id) on delete set null,

  -- PRD 8: club-created pre-membership welcome banner
  welcome_message text,
  welcome_banner_url text,

  -- PRD 12: whether new members receive historical chat access
  new_members_get_chat_history boolean not null default true,

  -- PRD 19: leaders can disable RSVP per event; this is the club default
  rsvp_enabled_by_default boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint clubs_meeting_fields_consistent check (
    (meeting_day is null) = (meeting_time is null)
  )
);

create index clubs_school_idx on public.clubs (school_id);
create index clubs_status_idx on public.clubs (school_id, status);
create index clubs_fields_idx on public.clubs using gin (fields);
create index clubs_name_search_idx on public.clubs using gin (
  to_tsvector('english', name || ' ' || description)
);

create trigger clubs_touch_updated_at
  before update on public.clubs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Administrator <-> club (PRD 38: many-to-many, NOT one admin per club)
-- ---------------------------------------------------------------------------

create table public.club_administrators (
  club_id uuid not null references public.clubs (id) on delete cascade,
  administrator_id uuid not null references public.profiles (id) on delete cascade,
  linked_by uuid references public.profiles (id) on delete set null,
  linked_at timestamptz not null default now(),
  primary key (club_id, administrator_id)
);

-- ---------------------------------------------------------------------------
-- Three-student verification (PRD 7)
--
-- The founder's row is inserted with kind='founder' when the club is created;
-- two more students must add kind='verifier' rows before the club can advance.
-- ---------------------------------------------------------------------------

create type public.verification_kind as enum ('founder', 'verifier');

create table public.club_verifications (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  -- Defaults to the caller so a client can never record a verification on
  -- someone else's behalf. The RLS policy re-checks this on insert.
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind public.verification_kind not null,
  verified_at timestamptz not null default now(),
  unique (club_id, user_id)
);

create index club_verifications_club_idx on public.club_verifications (club_id);

-- A club is student-verified once it has exactly the required number of
-- distinct students on board (founder + 2 verifiers).
create or replace function public.student_verification_count(target_club uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct user_id)::integer
  from public.club_verifications
  where club_id = target_club;
$$;

-- ---------------------------------------------------------------------------
-- Leadership roles (PRD 10)
-- ---------------------------------------------------------------------------

create table public.leadership_roles (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null,
  description text not null default '',
  permissions public.club_permission[] not null default '{}',
  -- PRD 34: applications go to the current holder, else the supervising leader
  is_review_supervisor boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (club_id, name)
);

create index leadership_roles_club_idx on public.leadership_roles (club_id);

create table public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.leadership_roles (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique (role_id, user_id)
);

create index role_assignments_club_idx on public.role_assignments (club_id, user_id);

-- ---------------------------------------------------------------------------
-- Memberships (PRD 9)
-- ---------------------------------------------------------------------------

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  -- Defaults to the caller: joining a club always means joining as yourself.
  -- The RLS policy re-checks this on insert.
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  status public.membership_status not null default 'pending',
  -- PRD 22: organizational priority only, never a permission change
  is_priority boolean not null default false,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One membership record per student per club; reapplying updates the row.
create unique index memberships_user_club_uniq
  on public.memberships (user_id, club_id);
create index memberships_club_status_idx on public.memberships (club_id, status);
create index memberships_user_status_idx on public.memberships (user_id, status);

create trigger memberships_touch_updated_at
  before update on public.memberships
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Announcements (PRD 23)
-- ---------------------------------------------------------------------------

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null default '',
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index announcements_club_idx on public.announcements (club_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Authorization helpers (depend on memberships + role_assignments)
-- ---------------------------------------------------------------------------

create or replace function public.is_club_member(target_club uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.club_id = target_club
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.is_club_admin(target_club uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_administrators ca
    where ca.club_id = target_club
      and ca.administrator_id = auth.uid()
  ) or (
    public.is_administrator()
    and exists (
      select 1 from public.clubs c
      where c.id = target_club
        and c.school_id = public.current_school_id()
    )
  );
$$;

-- True when the user holds *any* leadership role in the club (PRD 3: a leader
-- is per-club, never a global account type).
create or replace function public.is_club_leader(target_club uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.role_assignments ra
    where ra.club_id = target_club
      and ra.user_id = auth.uid()
  );
$$;

-- PRD 10: permissions are granted per role, not per person.
create or replace function public.has_club_permission(
  target_club uuid,
  needed public.club_permission
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.role_assignments ra
    join public.leadership_roles lr on lr.id = ra.role_id
    where ra.club_id = target_club
      and ra.user_id = auth.uid()
      and needed = any (lr.permissions)
  ) or public.is_club_admin(target_club);
$$;

-- Convenience wrapper so RLS policies stay readable.
create or replace function public.can_read_club(target_club uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_club_member(target_club)
      or public.is_club_admin(target_club)
      or exists (
        select 1 from public.clubs c
        where c.id = target_club
          and c.school_id = public.current_school_id()
      );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.clubs enable row level security;
alter table public.club_administrators enable row level security;
alter table public.club_verifications enable row level security;
alter table public.leadership_roles enable row level security;
alter table public.role_assignments enable row level security;
alter table public.memberships enable row level security;
alter table public.announcements enable row level security;

-- Public welcome pages are visible to the whole school (PRD 8); private
-- content is gated per-table below.
create policy clubs_select_school on public.clubs
  for select
  using (school_id = public.current_school_id());

-- Founders draft their club; leaders with manage_settings may edit.
create policy clubs_insert_founder on public.clubs
  for insert
  with check (
    school_id = public.current_school_id()
    and founder_id = auth.uid()
  );

create policy clubs_update_leader on public.clubs
  for update
  using (
    founder_id = auth.uid()
    or public.has_club_permission(id, 'manage_settings')
    or public.is_club_admin(id)
  )
  with check (school_id = public.current_school_id());

-- Administrators approve/reject clubs (PRD 7 step 3). Restricted to
-- administrators of the same school.
create policy clubs_admin_approve on public.clubs
  for update
  using (
    public.is_administrator()
    and school_id = public.current_school_id()
  )
  with check (public.is_administrator() and school_id = public.current_school_id());

create policy club_admins_select on public.club_administrators
  for select
  using (public.can_read_club(club_id));

create policy club_admins_write on public.club_administrators
  for all
  using (public.is_administrator() or public.has_club_permission(club_id, 'manage_settings'))
  with check (public.is_administrator() or public.has_club_permission(club_id, 'manage_settings'));

-- Any same-school student may verify a proposed club (PRD 7 step 2), but only
-- for their own row.
create policy club_verifications_select on public.club_verifications
  for select
  using (public.can_read_club(club_id) or user_id = auth.uid());

create policy club_verifications_insert on public.club_verifications
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.clubs c
      where c.id = club_id
        and c.school_id = public.current_school_id()
        and c.status = 'awaiting_student_verification'
    )
  );

create policy club_verifications_delete on public.club_verifications
  for delete
  using (
    user_id = auth.uid()
    or public.has_club_permission(club_id, 'manage_settings')
  );

create policy leadership_roles_select on public.leadership_roles
  for select
  using (public.can_read_club(club_id));

create policy leadership_roles_write on public.leadership_roles
  for all
  using (public.has_club_permission(club_id, 'manage_leadership') or public.is_club_admin(club_id))
  with check (public.has_club_permission(club_id, 'manage_leadership') or public.is_club_admin(club_id));

create policy role_assignments_select on public.role_assignments
  for select
  using (public.can_read_club(club_id));

create policy role_assignments_write on public.role_assignments
  for all
  using (public.has_club_permission(club_id, 'manage_leadership') or public.is_club_admin(club_id))
  with check (public.has_club_permission(club_id, 'manage_leadership') or public.is_club_admin(club_id));

-- Students see their own membership; leaders see the club roster.
create policy memberships_select on public.memberships
  for select
  using (
    user_id = auth.uid()
    or public.has_club_permission(club_id, 'manage_membership')
    or public.is_club_admin(club_id)
  );

-- Students apply for themselves only (PRD 9).
create policy memberships_insert_self on public.memberships
  for insert
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and exists (
      select 1 from public.clubs c
      where c.id = club_id
        and c.school_id = public.current_school_id()
        and c.status = 'approved'
    )
  );

create policy memberships_update_leader on public.memberships
  for update
  using (
    user_id = auth.uid()
    or public.has_club_permission(club_id, 'manage_membership')
    or public.is_club_admin(club_id)
  )
  with check (
    user_id = auth.uid()
    or public.has_club_permission(club_id, 'manage_membership')
    or public.is_club_admin(club_id)
  );

create policy announcements_select on public.announcements
  for select
  using (public.can_read_club(club_id));

create policy announcements_insert on public.announcements
  for insert
  with check (
    author_id = auth.uid()
    and public.has_club_permission(club_id, 'send_announcements')
  );

create policy announcements_delete on public.announcements
  for delete
  using (author_id = auth.uid() or public.has_club_permission(club_id, 'send_announcements'));

-- ---------------------------------------------------------------------------
-- Club creation RPC (PRD 7 step 1)
--
-- Single transaction so the club and its founder verification cannot diverge.
-- ---------------------------------------------------------------------------

create or replace function public.create_club(
  club_name text,
  club_type public.club_type,
  club_commitment public.commitment_level,
  club_fields text[],
  club_room text,
  club_meeting_day text,
  club_meeting_time time,
  club_description text default ''
)
returns public.clubs
language plpgsql
security invoker
set search_path = public
as $$
declare
  created_club public.clubs;
begin
  insert into public.clubs (
    name, description, type, commitment, fields, room,
    meeting_day, meeting_time, founder_id, school_id, status
  )
  values (
    club_name, club_description, club_type, club_commitment, club_fields,
    club_room, club_meeting_day, club_meeting_time, auth.uid(),
    public.current_school_id(), 'awaiting_student_verification'
  )
  returning * into created_club;

  insert into public.club_verifications (club_id, user_id, kind)
  values (created_club.id, auth.uid(), 'founder');

  return created_club;
end;
$$;

-- ---------------------------------------------------------------------------
-- Submit for administrator review (PRD 7 step 3)
--
-- Refuses to advance until all three students are on board.
-- ---------------------------------------------------------------------------

create or replace function public.submit_club_for_review(target_club uuid)
returns public.clubs
language plpgsql
security invoker
set search_path = public
as $$
declare
  updated_club public.clubs;
  verifier_count integer;
begin
  if not exists (
    select 1 from public.clubs
    where id = target_club and founder_id = auth.uid()
  ) then
    raise exception 'Only the founder can submit this club'
      using errcode = '42501';
  end if;

  select public.student_verification_count(target_club) into verifier_count;

  if verifier_count < 3 then
    raise exception 'Need 3 students total (founder + 2 verifiers); found %', verifier_count
      using errcode = '23514';
  end if;

  update public.clubs
  set status = 'awaiting_administrator_verification'
  where id = target_club
  returning * into updated_club;

  return updated_club;
end;
$$;

-- Administrator decision (PRD 7 step 3).
create or replace function public.review_club(target_club uuid, approved boolean, note text default null)
returns public.clubs
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_club public.clubs;
begin
  if not public.is_administrator() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  update public.clubs
  set status = case when approved then 'approved' else 'rejected' end
  where id = target_club
    and school_id = public.current_school_id()
  returning * into updated_club;

  if updated_club.id is null then
    raise exception 'Club not found in your school' using errcode = 'P0002';
  end if;

  return updated_club;
end;
$$;

-- ---------------------------------------------------------------------------
-- Membership decision (PRD 9)
--
-- Accepting sets joined_at, which is what unlocks internal club access and
-- the automatic chat addition performed by the client in the same flow.
-- ---------------------------------------------------------------------------

create or replace function public.review_membership(target_membership uuid, accept boolean)
returns public.memberships
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_club uuid;
  updated_membership public.memberships;
begin
  select club_id into target_club from public.memberships where id = target_membership;

  if target_club is null then
    raise exception 'Membership request not found' using errcode = 'P0002';
  end if;

  if not (
    public.has_club_permission(target_club, 'manage_membership')
    or public.is_club_admin(target_club)
  ) then
    raise exception 'You do not have permission to review join requests'
      using errcode = '42501';
  end if;

  update public.memberships
  set status = case when accept then 'active' else 'rejected' end,
      joined_at = case when accept then now() else null end
  where id = target_membership
  returning * into updated_membership;

  return updated_membership;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit logging (PRD 42)
--
-- Declared here because later migrations attach triggers to it. RLS policies
-- are added after the log table is populated by triggers.
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id bigint generated always as identity primary key,
  school_id uuid references public.schools (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  object_type text not null,
  object_id uuid,
  -- PRD 42: relevant change data
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_school_idx on public.audit_logs (school_id, created_at desc);
create index audit_logs_object_idx on public.audit_logs (object_type, object_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id);

alter table public.audit_logs enable row level security;

-- Logs are readable by administrators of the school (PRD 37).
create policy audit_logs_select_admin on public.audit_logs
  for select
  using (
    public.is_administrator()
    and school_id = public.current_school_id()
  );

create or replace function public.record_audit(
  p_action text,
  p_object_type text,
  p_object_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (school_id, actor_id, action, object_type, object_id, details)
  values (public.current_school_id(), auth.uid(), p_action, p_object_type, p_object_id, p_details);
end;
$$;