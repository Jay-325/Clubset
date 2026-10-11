-- ============================================================================
-- Joinin :: 01 Core schema
-- Schools, profiles, administrator allowlist, and the authorization helpers
-- that every later migration depends on.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- NOTE: "leader" is deliberately NOT an account type. A student becomes a
-- leader only inside a specific club (PRD 3, 53.21).
create type public.account_type as enum ('student', 'administrator');

create type public.grade_level as enum (
  'freshman',
  'sophomore',
  'junior',
  'senior',
  'other'
);

-- PRD 7: club types, with room for school-defined additions later.
create type public.club_type as enum ('volunteer', 'competitive', 'recreational');

-- PRD 14
create type public.commitment_level as enum ('low', 'medium', 'high');

-- PRD 14 / 15
create type public.event_priority as enum ('low', 'normal', 'high');

create type public.event_kind as enum ('meeting', 'event', 'deadline', 'other');

-- ---------------------------------------------------------------------------
-- Schools
-- ---------------------------------------------------------------------------

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  email_domain text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.schools is
  'Organizational boundary. Every user and club belongs to exactly one school.';

-- ---------------------------------------------------------------------------
-- Profiles
--
-- Mirrors auth.users. "profiles" rather than "users" because auth.users is
-- owned by Supabase Auth (PRD 43 "Users").
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  school_id uuid references public.schools (id) on delete set null,
  email text not null,
  full_name text not null default '',
  grade public.grade_level,
  account_type public.account_type not null default 'student',

  -- PRD 4: preset interests + student-defined extras.
  interests text[] not null default '{}',
  -- Hours/week the student is willing to commit (PRD 4).
  commitment_hours numeric(4, 1),

  avatar_url text,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_school_idx on public.profiles (school_id);
create index profiles_email_idx on public.profiles (lower(email));
create index profiles_interests_idx on public.profiles using gin (interests);

-- ---------------------------------------------------------------------------
-- Administrator allowlist (PRD 5)
--
-- Security-critical. The frontend never holds this list; it only asks the
-- backend "is this email allowed?". Students must never be able to read or
-- write it (PRD 41, 53.20-21).
-- ---------------------------------------------------------------------------

create table public.admin_allowlist (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  email text not null,
  full_name text,
  created_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint admin_allowlist_email_normalized check (email = lower(email))
);

create unique index admin_allowlist_school_email_uniq
  on public.admin_allowlist (school_id, email);
create index admin_allowlist_lookup_idx on public.admin_allowlist (email)
  where revoked_at is null;

-- Records the administrator activation handshake from PRD 5: the teacher
-- confirms the emailed link, and only then does the account gain the role.
create table public.admin_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade,
  allowlist_id uuid references public.admin_allowlist (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'activated', 'revoked')),
  activated_at timestamptz,
  created_at timestamptz not null default now()
);

create index admin_verifications_user_idx on public.admin_verifications (user_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-provision a profile whenever an auth user is created
--
-- account_type starts as 'student'. The ONLY path to 'administrator' is
-- activate_administrator(), which requires a matching allowlist row.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_school uuid;
  resolved_name text;
begin
  resolved_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    split_part(new.email, '@', 1)
  );

  -- Infer school from the allowlisted domain when possible.
  select s.id into resolved_school
  from public.schools s
  join public.admin_allowlist al on al.school_id = s.id
  where new.email is not null
    and lower(new.email) = al.email
    and al.revoked_at is null
  limit 1;

  insert into public.profiles (id, school_id, email, full_name)
  values (
    new.id,
    resolved_school,
    lower(new.email),
    resolved_name
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Administrator activation (PRD 5)
--
-- SECURITY DEFINER so it can read admin_allowlist, which has no client policy.
-- Raises when the email is not allowlisted: unauthorized users cannot promote
-- themselves (PRD 53.21).
-- ---------------------------------------------------------------------------

create or replace function public.activate_administrator()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_email text;
  target_school uuid;
  allowlisted_id uuid;
  updated_profile public.profiles;
begin
  select lower(email) into caller_email
  from public.profiles
  where id = auth.uid();

  if caller_email is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select al.school_id, al.id into target_school, allowlisted_id
  from public.admin_allowlist al
  where al.email = caller_email
    and al.revoked_at is null
  order by created_at
  limit 1;

  if target_school is null then
    raise exception 'This email is not on the administrator allowlist'
      using errcode = '42501';
  end if;

  update public.profiles
  set account_type = 'administrator',
      school_id = coalesce(school_id, target_school)
  where id = auth.uid()
  returning * into updated_profile;

  insert into public.admin_verifications (user_id, school_id, allowlist_id, status, activated_at)
  values (auth.uid(), target_school, allowlisted_id, 'activated', now());

  return updated_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Authorization helpers
--
-- All SECURITY DEFINER + STABLE so they can read tables the caller cannot
-- select directly, and so RLS policies do not recurse.
-- ---------------------------------------------------------------------------

create or replace function public.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select school_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_administrator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select account_type = 'administrator'
       from public.profiles
      where id = auth.uid()),
    false
  );
$$;

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where id = auth.uid() limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.admin_allowlist enable row level security;
alter table public.admin_verifications enable row level security;

-- profiles: readable by same-school users (needed to render member lists),
-- writable only by the owner. Admin allowlist gets NO client policy at all.
create policy profiles_select_school on public.profiles
  for select
  using (
    id = auth.uid()
    or (school_id is not null and school_id = public.current_school_id())
  );

create policy profiles_insert_self on public.profiles
  for insert
  with check (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy schools_select on public.schools
  for select
  using (id = public.current_school_id());

-- An administrator manages their own school's allowlist (PRD 5, 37).
create policy admin_allowlist_admin_all on public.admin_allowlist
  for all
  using (
    public.is_administrator()
    and school_id = public.current_school_id()
  )
  with check (
    public.is_administrator()
    and school_id = public.current_school_id()
  );

create policy admin_verifications_select_own on public.admin_verifications
  for select
  using (user_id = auth.uid() or public.is_administrator());

create policy admin_verifications_admin_all on public.admin_verifications
  for all
  using (
    public.is_administrator()
    and school_id = public.current_school_id()
  )
  with check (
    public.is_administrator()
    and school_id = public.current_school_id()
  );