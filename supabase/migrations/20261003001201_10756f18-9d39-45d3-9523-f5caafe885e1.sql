-- ============================================================================
-- Joinin :: 09 Notifications, discovery, recommendations, audit triggers, seeds
--
-- The 'receipts' bucket itself is created through the storage API (buckets
-- cannot be inserted through a migration); this file carries only its
-- access rules.
--
-- Deviations from supabase/migrations/20260101000009_notifications.sql, both
-- inside search_clubs:
--   1. it compared `p.commitment`, which does not exist -- profiles stores
--      availability as commitment_hours (numeric). The bands below are the ones
--      the app publishes in src/lib/domain.ts COMMITMENT_LEVELS:
--      low < 1, medium 1-2, high 3+.
--   2. it ordered by the bare alias `match_reasons`. In a function declared
--      `returns table (...)` that alias is the function's own output column and
--      cannot be referenced from the body, so the reasons are now computed in a
--      CTE and ordered through a qualified column reference.
-- ============================================================================

create type public.notification_type as enum (
  'join_request',
  'join_accepted',
  'event_reminder',
  'rsvp',
  'form_assignment',
  'leadership_eligible',
  'leadership_application',
  'admin_club_change',
  'announcement',
  'role_message'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  school_id uuid references public.schools (id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text not null default '',
  -- Where tapping the notification takes the user
  link_path text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select
  using (user_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Notification fan-out (PRD 19, 36, 46)
--
-- Created in the same transaction as the action that caused it, so an
-- important action can never finish without notifying the right people.
-- ---------------------------------------------------------------------------

create or replace function public.notify_club_leaders(
  target_club uuid,
  note_type public.notification_type,
  title text,
  body text default '',
  link_path text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, school_id, type, title, body, link_path)
  select ra.user_id, c.school_id, note_type, title, body, link_path
  from public.role_assignments ra
  join public.clubs c on c.id = ra.club_id
  where ra.club_id = target_club;

  -- Linked administrators are notified of significant club activity.
  insert into public.notifications (user_id, school_id, type, title, body, link_path)
  select ca.administrator_id, c.school_id, 'admin_club_change', title, body, link_path
  from public.club_administrators ca
  join public.clubs c on c.id = ca.club_id
  where ca.club_id = target_club
    and note_type in ('rsvp', 'join_request', 'leadership_application');
end;
$$;

create or replace function public.notify_user(
  target_user uuid,
  note_type public.notification_type,
  title text,
  body text default '',
  link_path text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, school_id, type, title, body, link_path)
  select target_user, school_id, note_type, title, body, link_path
  from public.profiles where id = target_user;
end;
$$;

-- PRD 19: RSVP notifies club leadership.
create or replace function public.notify_on_rsvp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_club uuid;
  student_name text;
  event_title text;
begin
  select e.club_id, e.title into target_club, event_title
  from public.events e where e.id = new.event_id;

  select full_name into student_name from public.profiles where id = new.user_id;

  perform public.notify_club_leaders(
    target_club,
    'rsvp',
    'New RSVP',
    student_name || ' RSVPed to ' || event_title,
    '/clubs/' || target_club || '/events/' || new.event_id
  );

  return new;
end;
$$;

create trigger rsvps_notify_leaders
  after insert or update on public.rsvps
  for each row execute function public.notify_on_rsvp();

-- PRD 9: leaders are notified of join requests; PRD 36.
create or replace function public.notify_on_join_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  student_name text;
begin
  select full_name into student_name from public.profiles where id = new.user_id;

  perform public.notify_club_leaders(
    new.club_id,
    'join_request',
    'New join request',
    student_name || ' wants to join ' || (select name from public.clubs where id = new.club_id),
    '/clubs/' || new.club_id || '/members'
  );

  return new;
end;
$$;

create trigger memberships_notify_leaders
  after insert on public.memberships
  for each row execute function public.notify_on_join_request();

-- PRD 36: join accepted.
create or replace function public.notify_on_membership_decided()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and old.status = 'pending' then
    perform public.notify_user(
      new.user_id, 'join_accepted', 'Welcome to the club!',
      'You have been accepted into ' || (select name from public.clubs where id = new.club_id)
        || '. Your group chat is ready.',
      '/clubs/' || new.club_id
    );
  end if;

  return new;
end;
$$;

create trigger memberships_notify_applicant
  after update on public.memberships
  for each row execute function public.notify_on_membership_decided();

-- PRD 36: announcements reach the whole club.
create or replace function public.notify_on_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_club_leaders(new.club_id, 'announcement', new.title, new.body,
    '/clubs/' || new.club_id);

  insert into public.notifications (user_id, school_id, type, title, body, link_path)
  select m.user_id, c.school_id, 'announcement', a.title, a.body, '/clubs/' || a.club_id
  from public.memberships m
  join public.clubs c on c.id = m.club_id
  cross join (select new.title, new.body, new.club_id) a
  where m.club_id = new.club_id and m.status = 'active' and m.user_id <> new.author_id;

  return new;
end;
$$;

create trigger announcements_notify_members
  after insert on public.announcements
  for each row execute function public.notify_on_announcement();

-- PRD 33 step 2: notify a student when they become eligible for a position.
create or replace function public.notify_on_application_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role_name text;
begin
  select name into role_name from public.leadership_roles where id = new.role_id;

  perform public.notify_user(
    new.applicant_id, 'leadership_application', 'Application sent',
    'Your application for ' || role_name || ' was sent to the reviewers.',
    '/clubs/' || new.club_id || '/leadership'
  );

  return new;
end;
$$;

create trigger applications_notify_applicant
  after insert on public.leadership_applications
  for each row execute function public.notify_on_application_submitted();

-- ============================================================================
-- Club discovery (PRD 20) and recommendations (PRD 21)
-- ============================================================================

create or replace function public.search_clubs(
  search_text text default null,
  filter_type public.club_type default null,
  filter_field text default null,
  filter_commitment public.commitment_level default null
)
returns table (
  id uuid,
  name text,
  description text,
  type public.club_type,
  commitment public.commitment_level,
  fields text[],
  room text,
  meeting_day text,
  meeting_time time,
  welcome_message text,
  member_count bigint,
  is_member boolean,
  match_reasons text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    select c.* from public.clubs c
    where c.status = 'approved'
      and c.school_id = public.current_school_id()
  ),
  scored as (
    select
      c.id, c.name, c.description, c.type, c.commitment, c.fields, c.room,
      c.meeting_day, c.meeting_time, c.welcome_message,
      (select count(*) from public.memberships m
        where m.club_id = c.id and m.status = 'active') as member_count,
      public.is_club_member(c.id) as is_member,
      -- PRD 21: recommendations must explain WHY, not just appear.
      coalesce(
        (select array_agg(distinct reason)
         from unnest(
           case
             when p.interests && c.fields
               then array['Matches your interests: ' || array_to_string(c.fields, ', ')]
             else '{}'::text[]
           end
           || case
                -- profiles stores availability as weekly hours; the bands are
                -- the ones the app publishes: low < 1, medium 1-2, high 3+.
                when p.commitment_hours is not null and (
                  (c.commitment = 'low'      and p.commitment_hours < 1)
                  or (c.commitment = 'medium' and p.commitment_hours >= 1 and p.commitment_hours < 3)
                  or (c.commitment = 'high'   and p.commitment_hours >= 3)
                )
                  then array['Matches your commitment level']
                else '{}'::text[]
              end
         ) as reason),
        '{}'::text[]
      ) as match_reasons
    from visible c
    cross join public.profiles p
    where p.id = auth.uid()
      and (
        search_text is null
        or c.name ilike '%' || search_text || '%'
        or c.description ilike '%' || search_text || '%'
      )
      and (filter_type is null or c.type = filter_type)
      and (filter_field is null or filter_field = any (c.fields))
      and (filter_commitment is null or c.commitment = filter_commitment)
      and not public.is_club_member(c.id)
  )
  select
    s.id, s.name, s.description, s.type, s.commitment, s.fields, s.room,
    s.meeting_day, s.meeting_time, s.welcome_message, s.member_count,
    s.is_member, s.match_reasons
  from scored s
  order by array_length(s.match_reasons, 1) desc nulls last, s.name;
$$;

-- PRD 20: combined upcoming view across all joined clubs.
create or replace function public.upcoming_events(limit_count integer default 20)
returns table (
  id uuid,
  club_id uuid,
  club_name text,
  title text,
  kind public.event_kind,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  priority public.event_priority,
  rsvp_enabled boolean,
  my_rsvp public.rsvp_status,
  conflict_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id, e.club_id, c.name, e.title, e.kind, e.location,
    e.starts_at, e.ends_at, e.priority, e.rsvp_enabled,
    (select r.status from public.rsvps r
      where r.event_id = e.id and r.user_id = auth.uid()),
    -- PRD 15: flag the overlap, never resolve it.
    (
      select count(*)
      from public.events other
      where public.is_club_member(other.club_id)
        and other.id <> e.id
        and tstzrange(other.starts_at, other.ends_at, '[)')
            && tstzrange(e.starts_at, e.ends_at, '[)')
    ) as conflict_count
  from public.events e
  join public.clubs c on c.id = e.club_id
  where public.is_club_member(e.club_id)
    and e.starts_at >= now() - interval '1 day'
  order by e.starts_at
  limit limit_count;
$$;

-- ============================================================================
-- Administrator oversight (PRD 37)
-- ============================================================================

create or replace function public.admin_club_overview()
returns table (
  club_id uuid,
  name text,
  status public.club_status,
  founder_name text,
  member_count bigint,
  administrator_count bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.name, c.status,
    (select p.full_name from public.profiles p where p.id = c.founder_id),
    (select count(*) from public.memberships m where m.club_id = c.id and m.status = 'active'),
    (select count(*) from public.club_administrators ca where ca.club_id = c.id),
    c.created_at
  from public.clubs c
  where public.is_administrator()
    and c.school_id = public.current_school_id()
  order by c.created_at desc;
$$;

-- ============================================================================
-- Audit triggers (PRD 42)
--
-- Attendance corrections, membership changes, permissions, and financials are
-- all logged by the database so a client cannot skip the log.
-- ============================================================================

create or replace function public.audit_club_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.record_audit(
      'club.status_changed', 'club', new.id,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return new;
end;
$$;

create trigger clubs_audit
  after update on public.clubs
  for each row execute function public.audit_club_changes();

create or replace function public.audit_permission_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.permissions is distinct from old.permissions then
    perform public.record_audit(
      'role.permissions_changed', 'leadership_role', new.id,
      jsonb_build_object('from', to_jsonb(old.permissions), 'to', to_jsonb(new.permissions))
    );
  end if;
  return new;
end;
$$;

create trigger roles_audit_permissions
  after update on public.leadership_roles
  for each row execute function public.audit_permission_changes();

create or replace function public.audit_role_assignment_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  record_id uuid;
begin
  record_id := case when tg_op = 'DELETE' then old.id else new.id end;

  perform public.record_audit(
    case when tg_op = 'DELETE' then 'role.revoked' else 'role.granted' end,
    'role_assignment', record_id,
    jsonb_build_object(
      'user_id', case when tg_op = 'DELETE' then old.user_id else new.user_id end,
      'club_id', case when tg_op = 'DELETE' then old.club_id else new.club_id end
    )
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger role_assignments_audit
  after insert or delete on public.role_assignments
  for each row execute function public.audit_role_assignment_changes();

-- ============================================================================
-- Storage: protected receipt bucket (PRD 41)
-- ============================================================================

-- Receipts are private. Paths are namespaced "<club_id>/<file>" so the
-- club is derived from the path, and a malformed path simply does not match
-- any transaction rather than raising a cast error.
create policy receipts_read on storage.objects
  for select
  using (
    bucket_id = 'receipts'
    and exists (
      select 1
      from public.transactions t
      join public.clubs c on c.id = t.club_id
      where t.receipt_path = name
        and (
          public.has_club_permission(t.club_id, 'manage_finances')
          or public.is_club_admin(t.club_id)
        )
    )
  );

create policy receipts_insert on storage.objects
  for insert
  with check (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.clubs c
      where c.id::text = (storage.foldername(name))[1]
        and (public.has_club_permission(c.id, 'manage_finances')
             or public.is_club_admin(c.id))
    )
  );

create policy receipts_delete on storage.objects
  for delete
  using (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.clubs c
      where c.id::text = (storage.foldername(name))[1]
        and (public.has_club_permission(c.id, 'manage_finances')
             or public.is_club_admin(c.id))
    )
  );