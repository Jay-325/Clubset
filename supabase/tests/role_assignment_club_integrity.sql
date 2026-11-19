-- ============================================================================
-- Clubset :: role-assignment club integrity (pgTAP)
--
-- Regression: role_assignments carries its own club_id column but nothing ties
-- it to leadership_roles.club_id, so an assignment could link a user to a role
-- that belongs to a different club (denormalized data drift). has_club_permission
-- evaluates ra.club_id consistently today, so there is no demonstrated
-- escalation path, but the invariant "an assignment's club is its role's club"
-- is not enforced at the database level.
--
-- After the fix: leadership_roles(id, club_id) is unique and
-- role_assignments(role_id, club_id) references it, so a mismatched assignment
-- is rejected by a foreign key.
-- ============================================================================

begin;

set local search_path = public, extensions;
create extension if not exists pgtap;

select plan(2);

-- ---------------------------------------------------------------------------
-- Fixtures: two clubs, a leader in club A, one role in each club
-- ---------------------------------------------------------------------------
insert into public.schools (id, name, slug, email_domain)
values (
  '00000000-0000-0000-0000-00000000c4ff',
  'Integrity School',
  'integrity-school',
  'c4.invalid'
)
on conflict (id) do nothing;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-00000000c401', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leader@c4.invalid', '', now())
on conflict (id) do nothing;

update public.profiles
set school_id = '00000000-0000-0000-0000-00000000c4ff',
    account_type = 'student'
where id = '00000000-0000-0000-0000-00000000c401';

insert into public.clubs (id, school_id, name, type, commitment, founder_id, status)
values
  ('00000000-0000-0000-0000-00000000c410', '00000000-0000-0000-0000-00000000c4ff', 'Club A', 'recreational', 'medium', '00000000-0000-0000-0000-00000000c401', 'approved'),
  ('00000000-0000-0000-0000-00000000c411', '00000000-0000-0000-0000-00000000c4ff', 'Club B', 'recreational', 'medium', '00000000-0000-0000-0000-00000000c401', 'approved');

insert into public.memberships (club_id, user_id, status, joined_at)
values
  ('00000000-0000-0000-0000-00000000c410', '00000000-0000-0000-0000-00000000c401', 'active', now());

insert into public.leadership_roles (id, club_id, name, permissions, is_review_supervisor)
values
  ('00000000-0000-0000-0000-00000000c420', '00000000-0000-0000-0000-00000000c410', 'Role A', array['manage_leadership']::public.club_permission[], false),
  ('00000000-0000-0000-0000-00000000c421', '00000000-0000-0000-0000-00000000c411', 'Role B', array['manage_leadership']::public.club_permission[], false);

insert into public.role_assignments (role_id, club_id, user_id, assigned_by)
values (
  '00000000-0000-0000-0000-00000000c420', '00000000-0000-0000-0000-00000000c410', '00000000-0000-0000-0000-00000000c401', '00000000-0000-0000-0000-00000000c401'
);

-- ---------------------------------------------------------------------------
-- A mismatched assignment (club A's column, club B's role) must be rejected
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c401"}', true);

select throws_ok(
  $$insert into public.role_assignments (role_id, club_id, user_id, assigned_by)
    values ('00000000-0000-0000-0000-00000000c421', '00000000-0000-0000-0000-00000000c410', '00000000-0000-0000-0000-00000000c401', '00000000-0000-0000-0000-00000000c401')$$,
  '23503',
  null,
  'a role assignment whose club differs from its role club is rejected'
);
reset role;

select is(
  (select count(*)::integer from public.role_assignments where user_id = '00000000-0000-0000-0000-00000000c401'),
  1,
  'only the original consistent assignment remains'
);

select * from finish();
rollback;
