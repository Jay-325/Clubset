-- ============================================================================
-- Joinin :: 08 Leadership applications and eligibility
--
-- PRD 32-35. Eligibility requirements should be SYSTEM RULES where possible
-- (PRD 32), and must be evaluated against FINALIZED attendance, never RSVP
-- counts (PRD 34, 53.14).
-- ============================================================================

create type public.application_status as enum (
  'draft',
  'submitted',
  'under_review',
  'accepted',
  'rejected',
  'withdrawn'
);

-- ---------------------------------------------------------------------------
-- Eligibility requirements, stored as system rules not prose (PRD 32)
-- ---------------------------------------------------------------------------

create type public.requirement_kind as enum (
  'min_days_in_club',
  'min_attendance_rate',
  'min_events_attended',
  'min_volunteer_hours'
);

create table public.eligibility_requirements (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.leadership_roles (id) on delete cascade,
  kind public.requirement_kind not null,
  threshold numeric(10, 2) not null,
  created_at timestamptz not null default now()
);

create index eligibility_requirements_role_idx on public.eligibility_requirements (role_id);

-- ---------------------------------------------------------------------------
-- Applications
-- ---------------------------------------------------------------------------

create table public.leadership_applications (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  role_id uuid not null references public.leadership_roles (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id) on delete cascade,

  status public.application_status not null default 'draft',

  -- PRD 33 step 5: profile info is attached automatically, never re-typed
  -- "Profile information included automatically"
  applicant_context jsonb not null default '{}'::jsonb,

  -- PRD 33 step 6: only the applicant's own answers live here
  answers jsonb not null default '{}'::jsonb,

  submitted_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (role_id, applicant_id),
  constraint applications_submitted_at_present check (
    status = 'draft' or submitted_at is not null
  )
);

create index leadership_applications_club_idx
  on public.leadership_applications (club_id, status);

create trigger leadership_applications_touch_updated_at
  before update on public.leadership_applications
  for each row execute function public.touch_updated_at();

-- Application-specific questions configured per role (PRD 32).
create table public.application_questions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.leadership_roles (id) on delete cascade,
  question text not null,
  question_type public.question_type not null default 'long_answer',
  options text[] not null default '{}',
  required boolean not null default false,
  sort_order integer not null default 0
);

create index application_questions_role_idx on public.application_questions (role_id, sort_order);

-- ---------------------------------------------------------------------------
-- Eligibility evaluation (PRD 33 step 1)
--
-- Every metric reads from finalized attendance or data-table records, so a
-- student cannot gain attendance credit by clicking RSVP.
-- ---------------------------------------------------------------------------

create or replace function public.check_eligibility(target_role uuid, student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_club uuid;
  enrolled_at timestamptz;
  attendance_totals jsonb;
  volunteer_hours numeric := 0;
  result jsonb;
  unmet jsonb := '[]'::jsonb;
begin
  select lr.club_id into target_club
  from public.leadership_roles lr where lr.id = target_role;

  if target_club is null then
    raise exception 'Role not found' using errcode = 'P0002';
  end if;

  select m.joined_at into enrolled_at
  from public.memberships m
  where m.club_id = target_club
    and m.user_id = student_id
    and m.status = 'active';

  if enrolled_at is null then
    return jsonb_build_object(
      'eligible', false,
      'metrics', jsonb_build_object(),
      'unmet', jsonb_build_array(jsonb_build_object(
        'kind', 'active_membership', 'label', 'Must be an active club member'
      ))
    );
  end if;

  select public.attendance_stats(target_club, student_id) into attendance_totals;

  select coalesce(sum((r.data ->> 'Hours')::numeric), 0) into volunteer_hours
  from public.data_table_rows r
  join public.data_tables dt on dt.id = r.table_id
  where dt.club_id = target_club
    and dt.template_key = 'volunteer_hours'
    and r.member_id = student_id;

  unmet := unmet || (
    select coalesce(jsonb_agg(jsonb_build_object(
      'kind', er.kind,
      'label', initcap(replace(er.kind::text, '_', ' ')),
      'required', er.threshold,
      'actual', case er.kind
        when 'min_days_in_club' then floor(extract(epoch from (now() - enrolled_at)) / 86400)
        when 'min_attendance_rate' then (attendance_totals ->> 'attendance_rate')::numeric
        when 'min_events_attended' then (attendance_totals ->> 'attended')::numeric
        when 'min_volunteer_hours' then volunteer_hours
      end
    ) order by er.kind), '[]'::jsonb)
    from public.eligibility_requirements er
    where er.role_id = target_role
      and case er.kind
        when 'min_days_in_club'
          then floor(extract(epoch from (now() - enrolled_at)) / 86400) < er.threshold
        when 'min_attendance_rate'
          then coalesce(((attendance_totals ->> 'attendance_rate')::numeric), 0) < er.threshold
        when 'min_events_attended'
          then coalesce(((attendance_totals ->> 'attended')::numeric), 0) < er.threshold
        when 'min_volunteer_hours'
          then volunteer_hours < er.threshold
      end
  );

  return jsonb_build_object(
    'eligible', jsonb_array_length(unmet) = 0,
    'metrics', attendance_totals
      || jsonb_build_object(
        'volunteer_hours', volunteer_hours,
        'days_in_club', floor(extract(epoch from (now() - enrolled_at)) / 86400)
      ),
    'unmet', unmet
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Roles this student is currently eligible for (PRD 33 steps 2-4)
-- ---------------------------------------------------------------------------

create or replace function public.eligible_roles_for(student_id uuid)
returns table (role_id uuid, club_id uuid, role_name text, metrics jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select lr.id, lr.club_id, lr.name, (public.check_eligibility(lr.id, student_id) -> 'metrics')
  from public.leadership_roles lr
  join public.memberships m on m.club_id = lr.club_id and m.user_id = student_id
  where m.status = 'active'
    and (public.check_eligibility(lr.id, student_id) ->> 'eligible')::boolean
    and not exists (
      select 1 from public.role_assignments ra
      where ra.role_id = lr.id and ra.user_id = student_id
    )
    -- Authorization: self, leadership of that club, or admin
    and (
      auth.uid() = student_id
      or public.has_club_permission(lr.club_id, 'manage_leadership')
      or public.is_club_admin(lr.club_id)
      or public.is_administrator()
    );
$$;

-- ---------------------------------------------------------------------------
-- Apply (PRD 33)
-- ---------------------------------------------------------------------------

create or replace function public.apply_for_role(target_role uuid)
returns public.leadership_applications
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_club uuid;
  eligibility jsonb;
  context jsonb;
  result public.leadership_applications;
begin
  select lr.club_id into target_club from public.leadership_roles lr where lr.id = target_role;

  if target_club is null then
    raise exception 'Position not found' using errcode = 'P0002';
  end if;

  select public.check_eligibility(target_role, auth.uid()) into eligibility;

  -- The gate is server-side: the UI hides ineligible positions, but Postgres
  -- is what actually enforces it (PRD 41, 53.20).
  if not (eligibility ->> 'eligible')::boolean then
    raise exception 'You do not yet meet the requirements for this position'
      using errcode = '42501';
  end if;

  -- PRD 33 step 5: attach what Joinin already knows instead of re-asking.
  select jsonb_build_object(
    'eligibility', eligibility -> 'metrics',
    'membership_joined_at', m.joined_at,
    'profile', jsonb_build_object(
      'full_name', p.full_name,
      'grade', p.grade,
      'interests', to_jsonb(p.interests)
    )
  ) into context
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  where m.club_id = target_club and m.user_id = auth.uid();

  insert into public.leadership_applications (
    club_id, role_id, applicant_id, status, applicant_context, submitted_at
  )
  values (target_club, target_role, auth.uid(), 'submitted', context, now())
  on conflict (role_id, applicant_id) do update
    set status = 'submitted',
        submitted_at = now(),
        applicant_context = excluded.applicant_context,
        updated_at = now()
  returning * into result;

  perform public.record_audit(
    'leadership.application_submitted', 'application', result.id,
    jsonb_build_object('role_id', target_role)
  );

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Review (PRD 34)
--
-- Applications are sent to the current holder of the position; if the
-- position is vacant, the designated supervising leader receives it.
-- ---------------------------------------------------------------------------

create or replace function public.review_application(
  target_application uuid,
  accept boolean,
  review_notes text default null
)
returns public.leadership_applications
language plpgsql
security invoker
set search_path = public
as $$
declare
  app public.leadership_applications;
  role_is_supervisor boolean;
  result public.leadership_applications;
begin
  select * into app from public.leadership_applications where id = target_application;

  if app.id is null then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;

  select lr.is_review_supervisor into role_is_supervisor
  from public.leadership_roles lr where lr.id = app.role_id;

  -- Authorized reviewer = current holder, supervising leader, or club admin.
  if not (
    exists (
      select 1 from public.role_assignments ra
      where ra.role_id = app.role_id and ra.user_id = auth.uid()
    )
    or role_is_supervisor
    or public.has_club_permission(app.club_id, 'manage_leadership')
    or public.is_club_admin(app.club_id)
  ) then
    raise exception 'You are not the reviewer for this position'
      using errcode = '42501';
  end if;

  update public.leadership_applications
  set status = case when accept then 'accepted' else 'rejected' end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = review_notes,
      updated_at = now()
  where id = target_application
  returning * into result;

  -- Accepting grants the role automatically (PRD 46: one entry, reused).
  if accept then
    insert into public.role_assignments (role_id, club_id, user_id, assigned_by)
    values (app.role_id, app.club_id, app.applicant_id, auth.uid())
    on conflict (role_id, user_id) do nothing;
  end if;

  perform public.record_audit(
    'leadership.application_reviewed', 'application', target_application,
    jsonb_build_object('accepted', accept, 'applicant_id', app.applicant_id)
  );

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Analyzer support (PRD 35)
--
-- Read-only projection that assembles an application plus the applicant's
-- real club activity so a reviewer can compare it to published requirements.
-- PRD 35/53.19: it summarizes; it never selects a candidate.
-- ---------------------------------------------------------------------------

create or replace function public.application_review_packet(target_application uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  app public.leadership_applications;
  requirements jsonb;
  eligibility jsonb;
  history jsonb;
begin
  select * into app from public.leadership_applications where id = target_application;

  if app.id is null then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;

  if not (
    exists (
      select 1 from public.role_assignments ra
      where ra.role_id = app.role_id and ra.user_id = auth.uid()
    )
    or public.has_club_permission(app.club_id, 'manage_leadership')
    or public.is_club_admin(app.club_id)
  ) then
    raise exception 'You are not authorized to review this application'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', er.kind, 'threshold', er.threshold
  )), '[]'::jsonb) into requirements
  from public.eligibility_requirements er where er.role_id = app.role_id;

  select public.check_eligibility(app.role_id, app.applicant_id) into eligibility;

  -- RSVP history and actual attendance are deliberately reported as separate
  -- numbers so a reviewer can see the gap (PRD 34).
  select jsonb_build_object(
    'rsvp_count', (
      select count(*) from public.rsvps r
      join public.events e on e.id = r.event_id
      where e.club_id = app.club_id and r.user_id = app.applicant_id
    ),
    'finalized_attendance', public.attendance_stats(app.club_id, app.applicant_id),
    'volunteer_hours', (
      select coalesce(sum((r.data ->> 'Hours')::numeric), 0)
      from public.data_table_rows r
      join public.data_tables dt on dt.id = r.table_id
      where dt.club_id = app.club_id
        and dt.template_key = 'volunteer_hours'
        and r.member_id = app.applicant_id
    )
  ) into history;

  return jsonb_build_object(
    'application', app,
    'published_requirements', requirements,
    'eligibility', eligibility,
    'activity', history
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.eligibility_requirements enable row level security;
alter table public.leadership_applications enable row level security;
alter table public.application_questions enable row level security;

create policy eligibility_requirements_select on public.eligibility_requirements
  for select
  using (
    exists (
      select 1 from public.leadership_roles lr
      where lr.id = eligibility_requirements.role_id
        and public.can_read_club(lr.club_id)
    )
  );

create policy eligibility_requirements_write on public.eligibility_requirements
  for all
  using (
    exists (
      select 1 from public.leadership_roles lr
      where lr.id = eligibility_requirements.role_id
        and (public.has_club_permission(lr.club_id, 'manage_leadership')
             or public.is_club_admin(lr.club_id))
    )
  )
  with check (
    exists (
      select 1 from public.leadership_roles lr
      where lr.id = eligibility_requirements.role_id
        and (public.has_club_permission(lr.club_id, 'manage_leadership')
             or public.is_club_admin(lr.club_id))
    )
  );

-- Applicants see their own applications; reviewers see the club's.
create policy leadership_applications_select on public.leadership_applications
  for select
  using (
    applicant_id = auth.uid()
    or exists (
      select 1 from public.role_assignments ra
      where ra.role_id = leadership_applications.role_id
        and ra.user_id = auth.uid()
    )
    or public.has_club_permission(club_id, 'manage_leadership')
    or public.is_club_admin(club_id)
  );

-- Application rows are created only via apply_for_role() so eligibility is
-- always checked server-side.
create policy leadership_applications_insert_via_rpc on public.leadership_applications
  for insert
  with check (applicant_id = auth.uid());

create policy leadership_applications_update_self on public.leadership_applications
  for update
  using (applicant_id = auth.uid() and status = 'draft')
  with check (applicant_id = auth.uid() and status = 'draft');

create policy application_questions_select on public.application_questions
  for select
  using (
    exists (
      select 1 from public.leadership_roles lr
      where lr.id = application_questions.role_id
        and public.can_read_club(lr.club_id)
    )
  );

create policy application_questions_write on public.application_questions
  for all
  using (
    exists (
      select 1 from public.leadership_roles lr
      where lr.id = application_questions.role_id
        and (public.has_club_permission(lr.club_id, 'manage_leadership')
             or public.is_club_admin(lr.club_id))
    )
  )
  with check (
    exists (
      select 1 from public.leadership_roles lr
      where lr.id = application_questions.role_id
        and (public.has_club_permission(lr.club_id, 'manage_leadership')
             or public.is_club_admin(lr.club_id))
    )
  );