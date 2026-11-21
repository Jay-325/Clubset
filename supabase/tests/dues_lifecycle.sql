-- ============================================================================
-- Clubset :: dues lifecycle authorization (pgTAP)
--
-- Covers:
--   * a leader with manage_finances can insert dues for a club member
--   * an ordinary member cannot insert dues (42501)
--   * cross-club dues insertion is denied (42501)
--   * amount must be >= 0 (23514 check constraint)
-- ============================================================================

begin;

set local search_path = public, extensions;
create extension if not exists pgtap;

select plan(5);

-- ---------------------------------------------------------------------------
-- Fixtures: two clubs in one school, a leader and a member in club A
-- ---------------------------------------------------------------------------
insert into public.schools (id, name, slug, email_domain)
values (
  '00000000-0000-0000-0000-00000000c5ff',
  'Dues School',
  'dues-school',
  'c5.invalid'
)
on conflict (id) do nothing;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-00000000c501', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leader@c5.invalid', '', now()),
  ('00000000-0000-0000-0000-00000000c502', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@c5.invalid', '', now()),
  ('00000000-0000-0000-0000-00000000c503', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'otherclub@c5.invalid', '', now())
on conflict (id) do nothing;

update public.profiles
set school_id = '00000000-0000-0000-0000-00000000c5ff',
    account_type = 'student'
where id in (
  '00000000-0000-0000-0000-00000000c501',
  '00000000-0000-0000-0000-00000000c502',
  '00000000-0000-0000-0000-00000000c503'
);

insert into public.clubs (id, school_id, name, type, commitment, founder_id, status)
values
  ('00000000-0000-0000-0000-00000000c510', '00000000-0000-0000-0000-00000000c5ff', 'Club A', 'recreational', 'medium', '00000000-0000-0000-0000-00000000c501', 'approved'),
  ('00000000-0000-0000-0000-00000000c511', '00000000-0000-0000-0000-00000000c5ff', 'Club B', 'recreational', 'medium', '00000000-0000-0000-0000-00000000c503', 'approved');

insert into public.memberships (club_id, user_id, status, joined_at)
values
  ('00000000-0000-0000-0000-00000000c510', '00000000-0000-0000-0000-00000000c501', 'active', now()),
  ('00000000-0000-0000-0000-00000000c510', '00000000-0000-0000-0000-00000000c502', 'active', now());

insert into public.leadership_roles (id, club_id, name, permissions, is_review_supervisor)
values
  ('00000000-0000-0000-0000-00000000c520', '00000000-0000-0000-0000-00000000c510', 'Treasurer', array['manage_finances']::public.club_permission[], false);

insert into public.role_assignments (role_id, club_id, user_id, assigned_by)
values (
  '00000000-0000-0000-0000-00000000c520', '00000000-0000-0000-0000-00000000c510', '00000000-0000-0000-0000-00000000c501', '00000000-0000-0000-0000-00000000c501'
);

-- ---------------------------------------------------------------------------
-- A. Leader with manage_finances can insert dues for a club member
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c501"}', true);

select lives_ok(
  $$insert into public.dues (club_id, user_id, amount, status, due_date)
    values (
      '00000000-0000-0000-0000-00000000c510',
      '00000000-0000-0000-0000-00000000c502',
      25.00,
      'unknown'::public.dues_status,
      (current_date + interval '14 days')::date
    )$$,
  'a leader can create dues for a club member'
);
reset role;

-- ---------------------------------------------------------------------------
-- B. An ordinary member cannot insert dues (RLS denies)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c502"}', true);

select throws_ok(
  $$insert into public.dues (club_id, user_id, amount, status, due_date)
    values (
      '00000000-0000-0000-0000-00000000c510',
      '00000000-0000-0000-0000-00000000c501',
      25.00,
      'unknown'::public.dues_status,
      null
    )$$,
  '42501',
  null,
  'a member cannot create dues in their own club'
);
reset role;

-- ---------------------------------------------------------------------------
-- C. Cross-club dues insertion is denied (leader of Club A cannot target Club B)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c501"}', true);

select throws_ok(
  $$insert into public.dues (club_id, user_id, amount, status, due_date)
    values (
      '00000000-0000-0000-0000-00000000c511',
      '00000000-0000-0000-0000-00000000c503',
      25.00,
      'unknown'::public.dues_status,
      null
    )$$,
  '42501',
  null,
  'a leader cannot create dues in another club'
);
reset role;

-- ---------------------------------------------------------------------------
-- D. Amount must be >= 0 (check constraint)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c501"}', true);

select throws_ok(
  $$insert into public.dues (club_id, user_id, amount, status, due_date)
    values (
      '00000000-0000-0000-0000-00000000c510',
      '00000000-0000-0000-0000-00000000c502',
      -5.00,
      'unknown'::public.dues_status,
      null
    )$$,
  '23514',
  null,
  'a negative amount is rejected by the check constraint'
);
reset role;

-- ---------------------------------------------------------------------------
-- E. Authorized dues record exists and has expected defaults
-- ---------------------------------------------------------------------------
select is(
  (select status from public.dues where user_id = '00000000-0000-0000-0000-00000000c502'),
  'unknown'::public.dues_status,
  'new dues record defaults to unknown status'
);

select * from finish();
rollback;
