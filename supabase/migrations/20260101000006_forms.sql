-- ============================================================================
-- Joinin :: 06 Forms and form responses
--
-- PRD 25: leaders build forms by choosing questions; members complete them.
-- PRD 29: responses are structured so they can flow into data tables.
-- ============================================================================

create type public.form_status as enum ('draft', 'published', 'closed');

create type public.question_type as enum (
  'short_answer',
  'long_answer',
  'multiple_choice',
  'checkbox',
  'yes_no',
  'number',
  'date'
);

create table public.forms (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,

  title text not null,
  description text not null default '',
  status public.form_status not null default 'draft',
  -- Optional deadline (PRD 25 step 4)
  closes_at timestamptz,

  -- PRD 29: which structured table responses flow into, when configured
  target_table_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index forms_club_idx on public.forms (club_id, status);

create trigger forms_touch_updated_at
  before update on public.forms
  for each row execute function public.touch_updated_at();

create table public.form_questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete cascade,
  type public.question_type not null,
  question text not null,
  options text[] not null default '{}',
  required boolean not null default false,
  sort_order integer not null default 0,

  -- Choice questions must carry options; open questions must not invent them.
  constraint question_options_consistent check (
    (type in ('multiple_choice', 'checkbox') and array_length(options, 1) is not null)
    or (type not in ('multiple_choice', 'checkbox') and array_length(options, 1) is null)
  )
);

create index form_questions_form_idx on public.form_questions (form_id, sort_order);

-- Answers stay a flat jsonb map of question_id -> value so the set of
-- questions can change without reshaping the responses table.
create table public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  unique (form_id, user_id)
);

create index form_responses_form_idx on public.form_responses (form_id, submitted_at desc);

-- ---------------------------------------------------------------------------
-- Publish (PRD 25 step 5)
--
-- Refuses to publish a form with no questions -- a leader should never
-- publish an empty form by accident.
-- ---------------------------------------------------------------------------

create or replace function public.publish_form(target_form uuid)
returns public.forms
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_club uuid;
  question_count integer;
  updated_form public.forms;
begin
  select f.club_id into target_club from public.forms f where f.id = target_form;

  if target_club is null then
    raise exception 'Form not found' using errcode = 'P0002';
  end if;

  if not (
    public.has_club_permission(target_club, 'manage_forms')
    or public.is_club_admin(target_club)
  ) then
    raise exception 'You do not have permission to publish forms'
      using errcode = '42501';
  end if;

  select count(*) into question_count
  from public.form_questions where form_id = target_form;

  if question_count = 0 then
    raise exception 'Add at least one question before publishing'
      using errcode = '23514';
  end if;

  update public.forms
  set status = 'published', updated_at = now()
  where id = target_form
  returning * into updated_form;

  perform public.record_audit('form.published', 'form', target_form, '{}'::jsonb);

  return updated_form;
end;
$$;

-- ---------------------------------------------------------------------------
-- Submit a response (PRD 25: members complete, never build)
-- ---------------------------------------------------------------------------

create or replace function public.submit_form_response(
  target_form uuid,
  response_answers jsonb
)
returns public.form_responses
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_club uuid;
  form_status public.form_status;
  result public.form_responses;
  missing_required text;
begin
  select f.club_id, f.status into target_club, form_status
  from public.forms f where f.id = target_form;

  if target_club is null then
    raise exception 'Form not found' using errcode = 'P0002';
  end if;

  if form_status <> 'published' then
    raise exception 'This form is not open for responses' using errcode = '23514';
  end if;

  if not public.is_club_member(target_club) then
    raise exception 'Only club members can respond to this form'
      using errcode = '42501';
  end if;

  -- Reject incomplete submissions before they can pollute the dataset.
  select string_agg(q.question, ', ') into missing_required
  from public.form_questions q
  where q.form_id = target_form
    and q.required
    and (response_answers ->> q.id::text) is null;

  if missing_required is not null then
    raise exception 'Missing required answers: %', missing_required
      using errcode = '23514';
  end if;

  insert into public.form_responses (form_id, user_id, answers)
  values (target_form, auth.uid(), response_answers)
  on conflict (form_id, user_id) do update
    set answers = excluded.answers,
        submitted_at = now()
  returning * into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.forms enable row level security;
alter table public.form_questions enable row level security;
alter table public.form_responses enable row level security;

-- Members see published forms they can fill in; leaders see drafts too.
create policy forms_select on public.forms
  for select
  using (
    public.can_read_club(club_id)
    and (
      status = 'published'
      or public.has_club_permission(club_id, 'manage_forms')
      or public.is_club_admin(club_id)
    )
  );

create policy forms_write on public.forms
  for all
  using (public.has_club_permission(club_id, 'manage_forms') or public.is_club_admin(club_id))
  with check (public.has_club_permission(club_id, 'manage_forms') or public.is_club_admin(club_id));

create policy form_questions_select on public.form_questions
  for select
  using (
    exists (
      select 1 from public.forms f
      where f.id = form_questions.form_id
        and (
          public.can_read_club(f.club_id)
          or public.has_club_permission(f.club_id, 'manage_forms')
        )
    )
  );

create policy form_questions_write on public.form_questions
  for all
  using (
    exists (
      select 1 from public.forms f
      where f.id = form_questions.form_id
        and (public.has_club_permission(f.club_id, 'manage_forms')
             or public.is_club_admin(f.club_id))
    )
  )
  with check (
    exists (
      select 1 from public.forms f
      where f.id = form_questions.form_id
        and (public.has_club_permission(f.club_id, 'manage_forms')
             or public.is_club_admin(f.club_id))
    )
  );

-- Students see only their OWN answers; leaders review the full set.
create policy form_responses_select on public.form_responses
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.forms f
      where f.id = form_responses.form_id
        and (public.has_club_permission(f.club_id, 'manage_forms')
             or public.is_club_admin(f.club_id))
    )
  );

create policy form_responses_insert_self on public.form_responses
  for insert
  with check (user_id = auth.uid());