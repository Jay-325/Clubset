-- ============================================================================
-- Clubset :: Phase 1 club lifecycle (pgTAP)
--
-- Covers:
--   * student-only club creation and the closed direct-approved-insert bypass
--   * student-only verification inserts
--   * founder immutability for postgres, service_role and an administrator
--   * the account-deletion cascade (founder_id -> NULL only after the profile
--     is gone)
--   * approval provisioning (membership + President role + assignment)
--   * rejection revocation and audit
--   * reapproval restoring membership/assignment while preserving a customized
--     role's permissions
--   * fail-closed approval when the founder is no longer a student
--
-- Run with: supabase test db
-- ============================================================================

begin;

set local search_path = public, extensions;
create extension if not exists pgtap;

select plan(33);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into public.schools (id, name, slug, email_domain)
values (
  '00000000-0000-0000-0000-00000000c1ff',
  'pgTAP School',
  'pgtap-school',
  'pgtap.invalid'
)
on conflict (id) do nothing;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'founder@pgtap.invalid', '', now()),
  ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'verifier@pgtap.invalid', '', now()),
  ('00000000-0000-0000-0000-00000000c103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@pgtap.invalid', '', now()),
  ('00000000-0000-0000-0000-00000000c104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cascade@pgtap.invalid', '', now()),
  ('00000000-0000-0000-0000-00000000c110', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@pgtap.invalid', '', now())
on conflict (id) do nothing;

update public.profiles
set school_id = '00000000-0000-0000-0000-00000000c1ff',
    account_type = 'student'
where id in (
  '00000000-0000-0000-0000-00000000c101',
  '00000000-0000-0000-0000-00000000c102',
  '00000000-0000-0000-0000-00000000c103',
  '00000000-0000-0000-0000-00000000c104'
);

update public.profiles
set school_id = '00000000-0000-0000-0000-00000000c1ff',
    account_type = 'administrator'
where id = '00000000-0000-0000-0000-00000000c110';

-- ---------------------------------------------------------------------------
-- A. A student can create a club; it starts awaiting student verification
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c101"}', true);

select lives_ok(
  $$select public.create_club(
      'Robotics Club', 'recreational', 'medium', '{}', 'Room 1', null, null, ''
    )$$,
  'a student can create a club'
);
reset role;

select is(
  (select status from public.clubs where name = 'Robotics Club'),
  'awaiting_student_verification'::public.club_status,
  'a new club starts awaiting student verification'
);

select is(
  public.student_verification_count((select id from public.clubs where name = 'Robotics Club')),
  1,
  'the founder is counted once'
);

-- ---------------------------------------------------------------------------
-- B. An administrator cannot found a club
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c110"}', true);

select throws_ok(
  $$select public.create_club(
      'Admin Club', 'recreational', 'medium', '{}', 'Room 1', null, null, ''
    )$$,
  '42501',
  'Only students can create clubs',
  'an administrator cannot create a club'
);
reset role;

-- ---------------------------------------------------------------------------
-- C. A direct insert cannot skip straight to approved
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c102"}', true);

select throws_ok(
  $$insert into public.clubs (name, type, commitment, founder_id, school_id, status)
    values ('Sneaky Club', 'recreational', 'medium', auth.uid(), public.current_school_id(), 'approved')$$,
  '42501',
  null,
  'a direct insert cannot enter the approved state'
);
reset role;

-- ---------------------------------------------------------------------------
-- D. Founder immutability (data-based, not identity-based)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update public.clubs
       set founder_id = '00000000-0000-0000-0000-00000000c102'
     where name = 'Robotics Club'$$,
  '42501',
  'Club founder cannot be changed',
  'postgres cannot rewrite the founder'
);

set local role service_role;

select throws_ok(
  $$update public.clubs
       set founder_id = '00000000-0000-0000-0000-00000000c102'
     where name = 'Robotics Club'$$,
  '42501',
  null,
  'service_role cannot rewrite the founder'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c110"}', true);

select throws_ok(
  $$update public.clubs
       set founder_id = '00000000-0000-0000-0000-00000000c102'
     where name = 'Robotics Club'$$,
  '42501',
  'Club founder cannot be changed',
  'an administrator cannot rewrite the founder'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c101"}', true);
select lives_ok(
  $$update public.clubs set description = 'We build robots.' where name = 'Robotics Club'$$,
  'a normal club update that omits founder_id still works'
);
reset role;

-- ---------------------------------------------------------------------------
-- E. Account deletion: the founder column clears only because the profile is
--    gone. This is the ON DELETE SET NULL cascade, exercised for real.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c104"}', true);
select lives_ok(
  $$select public.create_club(
      'Cascade Club', 'recreational', 'medium', '{}', 'Room 2', null, null, ''
    )$$,
  'the cascade fixture club is created by a student'
);
reset role;

-- Account deletion is a server-side action: no end-user JWT is present, so
-- audits written during the cascade have no actor. Clear the fixture claims.
select set_config('request.jwt.claims', '', true);

select lives_ok(
  $$delete from auth.users where id = '00000000-0000-0000-0000-00000000c104'$$,
  'deleting the account runs the profile -> club cascade'
);

select is(
  (select founder_id from public.clubs where name = 'Cascade Club'),
  null::uuid,
  'founder_id is cleared after the founder profile is deleted'
);

select is(
  (select count(*)::integer from public.clubs where name = 'Cascade Club'),
  1,
  'the club itself survives its founder'
);

-- ---------------------------------------------------------------------------
-- F. Approval provisions the founder membership, President role, assignment
-- ---------------------------------------------------------------------------
update public.clubs
set status = 'awaiting_administrator_verification'
where name = 'Robotics Club';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c110"}', true);

select lives_ok(
  $$select public.review_club((select id from public.clubs where name = 'Robotics Club'), true)$$,
  'an administrator approves the club'
);
reset role;

select is(
  (select status from public.clubs where name = 'Robotics Club'),
  'approved'::public.club_status,
  'the club is approved'
);

select is(
  (
    select m.status
    from public.memberships m
    join public.clubs c on c.id = m.club_id
    where c.name = 'Robotics Club'
      and m.user_id = '00000000-0000-0000-0000-00000000c101'
  ),
  'active'::public.membership_status,
  'the founder becomes an active member'
);

select is(
  (
    select count(*)::integer
    from public.leadership_roles lr
    join public.clubs c on c.id = lr.club_id
    where c.name = 'Robotics Club' and lr.name = 'President'
  ),
  1,
  'exactly one President role exists'
);

select is(
  (
    select array_length(lr.permissions, 1)
    from public.leadership_roles lr
    join public.clubs c on c.id = lr.club_id
    where c.name = 'Robotics Club' and lr.name = 'President'
  ),
  10,
  'the President role carries all ten permissions'
);

select is(
  (
    select lr.is_review_supervisor
    from public.leadership_roles lr
    join public.clubs c on c.id = lr.club_id
    where c.name = 'Robotics Club' and lr.name = 'President'
  ),
  false,
  'the President role is not a review supervisor'
);

select is(
  (
    select count(*)::integer
    from public.role_assignments ra
    join public.clubs c on c.id = ra.club_id
    where c.name = 'Robotics Club'
      and ra.user_id = '00000000-0000-0000-0000-00000000c101'
  ),
  1,
  'the founder holds exactly one assignment'
);

-- ---------------------------------------------------------------------------
-- G. Rejection of an approved club revokes membership and assignments
-- ---------------------------------------------------------------------------
select lives_ok(
  $$update public.leadership_roles lr
       set permissions = array['manage_settings']::public.club_permission[]
     from public.clubs c
     where c.id = lr.club_id
       and c.name = 'Robotics Club'
       and lr.name = 'President'$$,
  'the club customizes the President permissions'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c110"}', true);

select lives_ok(
  $$select public.review_club((select id from public.clubs where name = 'Robotics Club'), false)$$,
  'an administrator rejects the approved club'
);
reset role;

select is(
  (select status from public.clubs where name = 'Robotics Club'),
  'rejected'::public.club_status,
  'the club is rejected'
);

select is(
  (
    select m.status
    from public.memberships m
    join public.clubs c on c.id = m.club_id
    where c.name = 'Robotics Club'
      and m.user_id = '00000000-0000-0000-0000-00000000c101'
  ),
  'removed'::public.membership_status,
  'the founder membership is removed'
);

select is(
  (
    select count(*)::integer
    from public.role_assignments ra
    join public.clubs c on c.id = ra.club_id
    where c.name = 'Robotics Club'
      and ra.user_id = '00000000-0000-0000-0000-00000000c101'
  ),
  0,
  'all founder assignments are deleted'
);

select is(
  (
    select count(*)::integer
    from public.leadership_roles lr
    join public.clubs c on c.id = lr.club_id
    where c.name = 'Robotics Club' and lr.name = 'President'
  ),
  1,
  'the President role row is kept'
);

select ok(
  exists (
    select 1 from public.audit_logs
    where action = 'membership.revoked'
      and object_id = (select id from public.clubs where name = 'Robotics Club')
  ),
  'the revocation is audited'
);

-- ---------------------------------------------------------------------------
-- H. Reapproval restores access and preserves the customized permissions
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c110"}', true);

select lives_ok(
  $$select public.review_club((select id from public.clubs where name = 'Robotics Club'), true)$$,
  'the club is approved again'
);
reset role;

select is(
  (
    select m.status
    from public.memberships m
    join public.clubs c on c.id = m.club_id
    where c.name = 'Robotics Club'
      and m.user_id = '00000000-0000-0000-0000-00000000c101'
  ),
  'active'::public.membership_status,
  'the founder membership is restored'
);

select is(
  (
    select count(*)::integer
    from public.role_assignments ra
    join public.clubs c on c.id = ra.club_id
    where c.name = 'Robotics Club'
      and ra.user_id = '00000000-0000-0000-0000-00000000c101'
  ),
  1,
  'the founder assignment is restored once'
);

select is(
  (
    select lr.permissions
    from public.leadership_roles lr
    join public.clubs c on c.id = lr.club_id
    where c.name = 'Robotics Club' and lr.name = 'President'
  ),
  array['manage_settings']::public.club_permission[],
  'reapproval preserves the customized permissions'
);

-- ---------------------------------------------------------------------------
-- I. Approval fails closed when the founder is not a current student
-- ---------------------------------------------------------------------------
insert into public.clubs (id, school_id, name, type, commitment, founder_id, status)
values (
  '00000000-0000-0000-0000-00000000c150',
  '00000000-0000-0000-0000-00000000c1ff',
  'Non-student Club',
  'recreational',
  'medium',
  '00000000-0000-0000-0000-00000000c110',
  'awaiting_administrator_verification'
);

select throws_ok(
  $$select public.review_club('00000000-0000-0000-0000-00000000c150', true)$$,
  '23514',
  'Club founder must be a current student',
  'an administrator cannot approve a club founded by a non-student'
);

select is(
  (select status from public.clubs where id = '00000000-0000-0000-0000-00000000c150'),
  'awaiting_administrator_verification'::public.club_status,
  'a failed approval leaves the club unpromoted'
);

select * from finish();
rollback;
