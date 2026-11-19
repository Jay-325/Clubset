-- ============================================================================
-- Clubset :: F-11 same-school profile visibility (pgTAP)
--
-- Regression: profiles RLS is self-only, so cross-user profile reads (members,
-- chat senders, announcement authors, attendance, join requests, leadership
-- applicants) return nothing for other students. Broadening profiles SELECT to
-- all same-school rows would expose email / account_type / school_id via
-- `select *`, so column restriction must come from the dedicated
-- `profiles_public` view and from limited column selects in the app.
--
-- This test pins the database-level behaviour:
--   * a student can read same-school profiles (limited columns)
--   * a student cannot read cross-school profiles (RLS + view scoping)
--   * profiles_public exposes only non-sensitive columns
--   * profiles_public is same-school scoped
-- ============================================================================

begin;

set local search_path = public, extensions;
create extension if not exists pgtap;

select plan(7);

-- ---------------------------------------------------------------------------
-- Fixtures: two schools, two students each
-- ---------------------------------------------------------------------------
insert into public.schools (id, name, slug, email_domain) values
  ('00000000-0000-0000-0000-00000000c5ff', 'School One', 'school-one', 's1.invalid'),
  ('00000000-0000-0000-0000-00000000c5f0', 'School Two', 'school-two', 's2.invalid')
on conflict (id) do nothing;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-00000000c501', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's1-alpha@s1.invalid', '', now()),
  ('00000000-0000-0000-0000-00000000c502', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's1-beta@s1.invalid', '', now()),
  ('00000000-0000-0000-0000-00000000c503', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's2-alpha@s2.invalid', '', now())
on conflict (id) do nothing;

update public.profiles
set school_id = '00000000-0000-0000-0000-00000000c5ff',
    account_type = 'student',
    full_name = 'Alpha One'
where id = '00000000-0000-0000-0000-00000000c501';

update public.profiles
set school_id = '00000000-0000-0000-0000-00000000c5ff',
    account_type = 'student',
    full_name = 'Beta One'
where id = '00000000-0000-0000-0000-00000000c502';

update public.profiles
set school_id = '00000000-0000-0000-0000-00000000c5f0',
    account_type = 'student',
    full_name = 'Alpha Two'
where id = '00000000-0000-0000-0000-00000000c503';

-- ---------------------------------------------------------------------------
-- A. Same-school profile is visible via profiles (limited columns)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c501"}', true);

select is(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000c502'),
  'Beta One',
  'a student can read a same-school profile'
);
reset role;

-- ---------------------------------------------------------------------------
-- B. Cross-school profile is hidden by profiles RLS
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c501"}', true);

select is(
  (select count(*)::integer from public.profiles where id = '00000000-0000-0000-0000-00000000c503'),
  0,
  'a student cannot read a cross-school profile'
);
reset role;

-- ---------------------------------------------------------------------------
-- C. profiles_public is same-school scoped and limited-column
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::integer from public.profiles_public where id = '00000000-0000-0000-0000-00000000c502'),
  1,
  'profiles_public shows a same-school profile'
);

select is(
  (select count(*)::integer from public.profiles_public where id = '00000000-0000-0000-0000-00000000c503'),
  0,
  'profiles_public hides a cross-school profile'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles_public'
      and column_name = 'email'
  ),
  'profiles_public excludes email'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles_public'
      and column_name = 'account_type'
  ),
  'profiles_public excludes account_type'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles_public'
      and column_name = 'school_id'
  ),
  'profiles_public excludes school_id'
);

select * from finish();
rollback;
