-- ============================================================================
-- Joinin :: 07 Data tables
--
-- PRD 26-29. "Joinin should not become Excel." The goal is the useful part of
-- a spreadsheet without spreadsheet knowledge: templates over blank grids,
-- and a plain-English question instead of schema design (PRD 28).
-- ============================================================================

create table public.data_tables (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,

  name text not null,
  -- PRD 26: which preset was used, or 'custom' for a hand-built table
  template_key text,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index data_tables_club_idx on public.data_tables (club_id);

create trigger data_tables_touch_updated_at
  before update on public.data_tables
  for each row execute function public.touch_updated_at();

-- Forward reference from migration 06: a form may feed its responses into a
-- table (PRD 29).
alter table public.forms
  add constraint forms_target_table_fk
  foreign key (target_table_id) references public.data_tables (id) on delete set null;

create table public.data_table_columns (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.data_tables (id) on delete cascade,
  name text not null,
  -- PRD 44: plain language, not database terminology
  column_type text not null default 'text'
    check (column_type in ('text', 'number', 'date', 'boolean', 'member', 'event')),
  -- For 'member' columns: resolve the name to a club member at read time
  -- instead of freezing a copy of it in each row.
  sort_order integer not null default 0,
  is_required boolean not null default false,
  unique (table_id, name)
);

create index data_table_columns_table_idx on public.data_table_columns (table_id, sort_order);

-- Rows are a column->value jsonb map so adding a column later never requires
-- rewriting existing rows.
create table public.data_table_rows (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.data_tables (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  -- Links a volunteer-hours row back to the member it belongs to.
  member_id uuid references public.profiles (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index data_table_rows_table_idx on public.data_table_rows (table_id, created_at desc);
create index data_table_rows_member_idx on public.data_table_rows (member_id);
create index data_table_rows_event_idx on public.data_table_rows (event_id);

create trigger data_table_rows_touch_updated_at
  before update on public.data_table_rows
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Preset templates (PRD 26)
--
-- Joinin proposes the structure; the leader approves it (PRD 28). No blank
-- spreadsheet is ever presented as the starting point.
-- ---------------------------------------------------------------------------

create or replace function public.apply_table_template(target_table uuid, template_key text)
returns public.data_table_columns
language plpgsql
security definer
set search_path = public
as $$
declare
  target_club uuid;
  created_columns public.data_table_columns;
begin
  select dt.club_id into target_club from public.data_tables dt where dt.id = target_table;

  if target_club is null then
    raise exception 'Table not found' using errcode = 'P0002';
  end if;

  if not (
    public.has_club_permission(target_club, 'manage_data_tables')
    or public.is_club_admin(target_club)
  ) then
    raise exception 'You do not have permission to create tables'
      using errcode = '42501';
  end if;

  -- Replace any proposed-but-unapproved columns.
  delete from public.data_table_columns where table_id = target_table;

  insert into public.data_table_columns (table_id, name, column_type, sort_order, is_required)
  values
    (target_table, 'Member', 'member', 0, true),
    (target_table, 'Event', 'event', 1, true),
    (target_table, 'Date', 'date', 2, true),
    (target_table, 'Hours', 'number', 3, false),
    (target_table, 'Notes', 'text', 4, false)
  returning * into created_columns;

  update public.data_tables
  set template_key = template_key, updated_at = now()
  where id = target_table;

  return created_columns;
end;
$$;

-- ---------------------------------------------------------------------------
-- Create a table from a plain-English intent (PRD 28)
--
-- Maps common tracking intents to a proposed structure. This is deliberately
-- a fixed, predictable mapping rather than anything generative: PRD 31 and
-- 53.18 require that suggestions be proposed and confirmed by the user, and
-- PRD 53.19 forbids AI making decisions. This function only ever proposes.
-- ---------------------------------------------------------------------------

create or replace function public.propose_table_structure(intent_text text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  with lowered as (select lower(coalesce(intent_text, '')) as t)
  select case
    when lowered.t like '%volunteer%' or lowered.t like '%hour%' then
      jsonb_build_object(
        'template_key', 'volunteer_hours',
        'name', 'Volunteer Hours',
        'columns', jsonb_build_array(
          jsonb_build_object('name', 'Member', 'type', 'member'),
          jsonb_build_object('name', 'Event', 'type', 'event'),
          jsonb_build_object('name', 'Date', 'type', 'date'),
          jsonb_build_object('name', 'Hours', 'type', 'number'),
          jsonb_build_object('name', 'Notes', 'type', 'text')
        )
      )
    when lowered.t like '%attend%' then
      jsonb_build_object(
        'template_key', 'attendance',
        'name', 'Attendance',
        'columns', jsonb_build_array(
          jsonb_build_object('name', 'Member', 'type', 'member'),
          jsonb_build_object('name', 'Event', 'type', 'event'),
          jsonb_build_object('name', 'Status', 'type', 'text')
        )
      )
    when lowered.t like '%signup%' or lowered.t like '%sign up%' or lowered.t like '%participant%' then
      jsonb_build_object(
        'template_key', 'event_signups',
        'name', 'Event Signups',
        'columns', jsonb_build_array(
          jsonb_build_object('name', 'Member', 'type', 'member'),
          jsonb_build_object('name', 'Event', 'type', 'event'),
          jsonb_build_object('name', 'Availability', 'type', 'text'),
          jsonb_build_object('name', 'Volunteer Role', 'type', 'text')
        )
      )
    when lowered.t like '%fundrais%' then
      jsonb_build_object(
        'template_key', 'fundraiser_tracking',
        'name', 'Fundraiser Tracking',
        'columns', jsonb_build_array(
          jsonb_build_object('name', 'Member', 'type', 'member'),
          jsonb_build_object('name', 'Event', 'type', 'event'),
          jsonb_build_object('name', 'Amount Raised', 'type', 'number'),
          jsonb_build_object('name', 'Notes', 'type', 'text')
        )
      )
    when lowered.t like '%competition%' or lowered.t like '%team%' or lowered.t like '%roster%' then
      jsonb_build_object(
        'template_key', 'competition_participants',
        'name', 'Competition Participants',
        'columns', jsonb_build_array(
          jsonb_build_object('name', 'Member', 'type', 'member'),
          jsonb_build_object('name', 'Event', 'type', 'event'),
          jsonb_build_object('name', 'Role', 'type', 'text')
        )
      )
    else
      jsonb_build_object(
        'template_key', 'custom',
        'name', 'Custom Table',
        'columns', jsonb_build_array(
          jsonb_build_object('name', 'Name', 'type', 'text'),
          jsonb_build_object('name', 'Date', 'type', 'date'),
          jsonb_build_object('name', 'Notes', 'type', 'text')
        )
      )
  end from lowered;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.data_tables enable row level security;
alter table public.data_table_columns enable row level security;
alter table public.data_table_rows enable row level security;

create policy data_tables_select on public.data_tables
  for select
  using (public.can_read_club(club_id));

create policy data_tables_write on public.data_tables
  for all
  using (public.has_club_permission(club_id, 'manage_data_tables') or public.is_club_admin(club_id))
  with check (public.has_club_permission(club_id, 'manage_data_tables') or public.is_club_admin(club_id));

create policy data_table_columns_select on public.data_table_columns
  for select
  using (
    exists (
      select 1 from public.data_tables dt
      where dt.id = data_table_columns.table_id and public.can_read_club(dt.club_id)
    )
  );

create policy data_table_columns_write on public.data_table_columns
  for all
  using (
    exists (
      select 1 from public.data_tables dt
      where dt.id = data_table_columns.table_id
        and (public.has_club_permission(dt.club_id, 'manage_data_tables')
             or public.is_club_admin(dt.club_id))
    )
  )
  with check (
    exists (
      select 1 from public.data_tables dt
      where dt.id = data_table_columns.table_id
        and (public.has_club_permission(dt.club_id, 'manage_data_tables')
             or public.is_club_admin(dt.club_id))
    )
  );

create policy data_table_rows_select on public.data_table_rows
  for select
  using (
    exists (
      select 1 from public.data_tables dt
      where dt.id = data_table_rows.table_id and public.can_read_club(dt.club_id)
    )
  );

create policy data_table_rows_write on public.data_table_rows
  for all
  using (
    exists (
      select 1 from public.data_tables dt
      where dt.id = data_table_rows.table_id
        and (public.has_club_permission(dt.club_id, 'manage_data_tables')
             or public.is_club_admin(dt.club_id))
    )
  )
  with check (
    exists (
      select 1 from public.data_tables dt
      where dt.id = data_table_rows.table_id
        and (public.has_club_permission(dt.club_id, 'manage_data_tables')
             or public.is_club_admin(dt.club_id))
    )
  );