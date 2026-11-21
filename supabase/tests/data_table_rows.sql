-- ============================================================================
-- Clubset :: data-table row lifecycle authorization (pgTAP)
--
-- Covers:
--   * a leader with manage_data_tables can insert, update, and delete rows
--   * an ordinary member cannot write rows (42501)
--   * cross-club row writes are denied (42501)
--   * inserting into a non-existent table is rejected
--   * a row cannot be moved to another club's table (RLS blocks table_id change)
-- ============================================================================

begin;

set local search_path = public, extensions;
create extension if not exists pgtap;

select plan(8);

-- ---------------------------------------------------------------------------
-- Fixtures: two clubs in one school
--   Club A: leader (manage_data_tables), member (no write permission)
--   Club B: leader (manage_data_tables) -- for cross-club isolation
-- ---------------------------------------------------------------------------
insert into public.schools (id, name, slug, email_domain)
values (
  '00000000-0000-0000-0000-00000000c1ff',
  'Data School',
  'data-school',
  'c1.invalid'
)
on conflict (id) do nothing;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-00000000c151', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leader@c1.invalid', '', now()),
  ('00000000-0000-0000-0000-00000000c152', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@c1.invalid', '', now()),
  ('00000000-0000-0000-0000-00000000c153', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@c1.invalid', '', now())
on conflict (id) do nothing;

update public.profiles
set school_id = '00000000-0000-0000-0000-00000000c1ff',
    account_type = 'student'
where id in (
  '00000000-0000-0000-0000-00000000c151',
  '00000000-0000-0000-0000-00000000c152',
  '00000000-0000-0000-0000-00000000c153'
);

insert into public.clubs (id, school_id, name, type, commitment, founder_id, status)
values
  ('00000000-0000-0000-0000-00000000c910', '00000000-0000-0000-0000-00000000c1ff', 'Club A', 'recreational', 'medium', '00000000-0000-0000-0000-00000000c151', 'approved'),
  ('00000000-0000-0000-0000-00000000c911', '00000000-0000-0000-0000-00000000c1ff', 'Club B', 'recreational', 'medium', '00000000-0000-0000-0000-00000000c153', 'approved');

insert into public.memberships (club_id, user_id, status, joined_at)
values
  ('00000000-0000-0000-0000-00000000c910', '00000000-0000-0000-0000-00000000c151', 'active', now()),
  ('00000000-0000-0000-0000-00000000c910', '00000000-0000-0000-0000-00000000c152', 'active', now());

insert into public.leadership_roles (id, club_id, name, permissions, is_review_supervisor)
values
  ('00000000-0000-0000-0000-00000000c170', '00000000-0000-0000-0000-00000000c910', 'Officer', array['manage_data_tables']::public.club_permission[], false),
  ('00000000-0000-0000-0000-00000000c171', '00000000-0000-0000-0000-00000000c911', 'Officer', array['manage_data_tables']::public.club_permission[], false);

insert into public.role_assignments (role_id, club_id, user_id, assigned_by)
values
  ('00000000-0000-0000-0000-00000000c170', '00000000-0000-0000-0000-00000000c910', '00000000-0000-0000-0000-00000000c151', '00000000-0000-0000-0000-00000000c151'),
  ('00000000-0000-0000-0000-00000000c171', '00000000-0000-0000-0000-00000000c911', '00000000-0000-0000-0000-00000000c153', '00000000-0000-0000-0000-00000000c153');

-- A table in Club A with columns, plus a table in Club B for cross-club tests.
insert into public.data_tables (id, club_id, created_by, name, template_key)
values
  ('00000000-0000-0000-0000-00000000c190', '00000000-0000-0000-0000-00000000c910', '00000000-0000-0000-0000-00000000c151', 'Volunteer Hours', 'volunteer_hours'),
  ('00000000-0000-0000-0000-00000000c191', '00000000-0000-0000-0000-00000000c911', '00000000-0000-0000-0000-00000000c153', 'Club B Table', 'custom');

insert into public.data_table_columns (table_id, name, column_type, sort_order, is_required)
values
  ('00000000-0000-0000-0000-00000000c190', 'Member', 'member', 0, true),
  ('00000000-0000-0000-0000-00000000c190', 'Event', 'event', 1, true),
  ('00000000-0000-0000-0000-00000000c190', 'Date', 'date', 2, true),
  ('00000000-0000-0000-0000-00000000c190', 'Hours', 'number', 3, false),
  ('00000000-0000-0000-0000-00000000c190', 'Notes', 'text', 4, false);

-- ---------------------------------------------------------------------------
-- A. Leader with manage_data_tables can insert a row
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c151"}', true);

select lives_ok(
  $$insert into public.data_table_rows (table_id, member_id, data, created_by)
    values (
      '00000000-0000-0000-0000-00000000c190',
      '00000000-0000-0000-0000-00000000c152',
      '{"Hours": 5, "Notes": "Helped with setup"}'::jsonb,
      '00000000-0000-0000-0000-00000000c151'
    )$$,
  'a leader can insert a data-table row'
);
reset role;

-- ---------------------------------------------------------------------------
-- B. Leader can update their own row
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c151"}', true);

select lives_ok(
  $$update public.data_table_rows
     set data = '{"Hours": 6, "Notes": "Helped with setup and cleanup"}'::jsonb,
         updated_at = now()
   where id = (
     select id from public.data_table_rows
     where table_id = '00000000-0000-0000-0000-00000000c190'
       and member_id = '00000000-0000-0000-0000-00000000c152'
     order by created_at desc limit 1
   )$$,
  'a leader can update a data-table row'
);
reset role;

-- ---------------------------------------------------------------------------
-- C. Leader can delete a row
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c151"}', true);

select lives_ok(
  $$delete from public.data_table_rows
     where id = (
       select id from public.data_table_rows
       where table_id = '00000000-0000-0000-0000-00000000c190'
         and member_id = '00000000-0000-0000-0000-00000000c152'
       order by created_at desc limit 1
     )$$,
  'a leader can delete a data-table row'
);
reset role;

-- ---------------------------------------------------------------------------
-- D. A member without manage_data_tables cannot insert a row (42501)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c152"}', true);

select throws_ok(
  $$insert into public.data_table_rows (table_id, member_id, data, created_by)
    values (
      '00000000-0000-0000-0000-00000000c190',
      '00000000-0000-0000-0000-00000000c151',
      '{"Hours": 3}'::jsonb,
      '00000000-0000-0000-0000-00000000c152'
    )$$,
  '42501',
  null,
  'a member without manage_data_tables cannot insert a row'
);
reset role;

-- ---------------------------------------------------------------------------
-- E. Cross-club insert is denied (Club A leader cannot write to Club B table)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c151"}', true);

select throws_ok(
  $$insert into public.data_table_rows (table_id, member_id, data, created_by)
    values (
      '00000000-0000-0000-0000-00000000c191',
      '00000000-0000-0000-0000-00000000c153',
      '{"Notes": "cross club"}'::jsonb,
      '00000000-0000-0000-0000-00000000c151'
    )$$,
  '42501',
  null,
  'a leader cannot insert a row into another club''s table'
);
reset role;

-- ---------------------------------------------------------------------------
-- F. A row cannot be re-parented to another table (UPDATE table_id rejected)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c151"}', true);

select lives_ok(
  $$insert into public.data_table_rows (table_id, member_id, data, created_by)
    values (
      '00000000-0000-0000-0000-00000000c190',
      '00000000-0000-0000-0000-00000000c152',
      '{"Hours": 2}'::jsonb,
      '00000000-0000-0000-0000-00000000c151'
    )$$,
  'insert a row to test re-parenting rejection'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c151"}', true);

select throws_ok(
  $$update public.data_table_rows
     set table_id = '00000000-0000-0000-0000-00000000c191'
   where table_id = '00000000-0000-0000-0000-00000000c190'$$,
  '42501',
  null,
  'a row cannot be moved to another club''s table'
);
reset role;

-- ---------------------------------------------------------------------------
-- G. Inserting into a non-existent table is rejected
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c151"}', true);

select throws_ok(
  $$insert into public.data_table_rows (table_id, member_id, data, created_by)
    values (
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-00000000c152',
      '{}'::jsonb,
      '00000000-0000-0000-0000-00000000c151'
    )$$,
  '42501',
  null,
  'inserting into a non-existent table is rejected'
);
reset role;

select * from finish();
rollback;
