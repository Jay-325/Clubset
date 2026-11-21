-- ============================================================================
-- Clubset :: form response review authorization (pgTAP)
--
-- Covers:
--   * a leader with manage_forms can read all responses for their club's form
--   * a member can read only their own response
--   * a leader of another club cannot read responses for a different club's form
--   * responses are joined to their form's club for cross-club isolation
-- ============================================================================

begin;

set local search_path = public, extensions;
create extension if not exists pgtap;

select plan(4);

-- ---------------------------------------------------------------------------
-- Fixtures: two clubs in one school
--   Club A: leader (manage_forms), member
--   Club B: leader (manage_forms) -- for cross-club isolation
-- ---------------------------------------------------------------------------
insert into public.schools (id, name, slug, email_domain)
values (
  '00000000-0000-0000-0000-00000000c7ff',
  'Response School',
  'response-school',
  'c7.invalid'
)
on conflict (id) do nothing;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-00000000c701', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leader@c7.invalid', '', now()),
  ('00000000-0000-0000-0000-00000000c702', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@c7.invalid', '', now()),
  ('00000000-0000-0000-0000-00000000c703', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@c7.invalid', '', now())
on conflict (id) do nothing;

update public.profiles
set school_id = '00000000-0000-0000-0000-00000000c7ff',
    account_type = 'student'
where id in (
  '00000000-0000-0000-0000-00000000c701',
  '00000000-0000-0000-0000-00000000c702',
  '00000000-0000-0000-0000-00000000c703'
);

insert into public.clubs (id, school_id, name, type, commitment, founder_id, status)
values
  ('00000000-0000-0000-0000-00000000c710', '00000000-0000-0000-0000-00000000c7ff', 'Club A', 'recreational', 'medium', '00000000-0000-0000-0000-00000000c701', 'approved'),
  ('00000000-0000-0000-0000-00000000c711', '00000000-0000-0000-0000-00000000c7ff', 'Club B', 'recreational', 'medium', '00000000-0000-0000-0000-00000000c703', 'approved');

insert into public.memberships (club_id, user_id, status, joined_at)
values
  ('00000000-0000-0000-0000-00000000c710', '00000000-0000-0000-0000-00000000c701', 'active', now()),
  ('00000000-0000-0000-0000-00000000c710', '00000000-0000-0000-0000-00000000c702', 'active', now());

insert into public.leadership_roles (id, club_id, name, permissions, is_review_supervisor)
values
  ('00000000-0000-0000-0000-00000000c720', '00000000-0000-0000-0000-00000000c710', 'Officer', array['manage_forms']::public.club_permission[], false),
  ('00000000-0000-0000-0000-00000000c721', '00000000-0000-0000-0000-00000000c711', 'Officer', array['manage_forms']::public.club_permission[], false);

insert into public.role_assignments (role_id, club_id, user_id, assigned_by)
values
  ('00000000-0000-0000-0000-00000000c720', '00000000-0000-0000-0000-00000000c710', '00000000-0000-0000-0000-00000000c701', '00000000-0000-0000-0000-00000000c701'),
  ('00000000-0000-0000-0000-00000000c721', '00000000-0000-0000-0000-00000000c711', '00000000-0000-0000-0000-00000000c703', '00000000-0000-0000-0000-00000000c703');

-- A published form with questions in Club A, plus one in Club B.
insert into public.forms (id, club_id, created_by, title, description, status)
values
  ('00000000-0000-0000-0000-00000000c730', '00000000-0000-0000-0000-00000000c710', '00000000-0000-0000-0000-00000000c701', 'Spring Signup', 'Member sign-up form', 'published'),
  ('00000000-0000-0000-0000-00000000c731', '00000000-0000-0000-0000-00000000c711', '00000000-0000-0000-0000-00000000c703', 'Club B Form', 'Another form', 'published');

insert into public.form_questions (id, form_id, type, question, options, required, sort_order)
values
  ('00000000-0000-0000-0000-00000000c740', '00000000-0000-0000-0000-00000000c730', 'short_answer', 'Full name', '{}'::text[], true, 0),
  ('00000000-0000-0000-0000-00000000c741', '00000000-0000-0000-0000-00000000c730', 'multiple_choice', 'Which session?', '{"Morning","Afternoon"}'::text[], false, 1);

-- Responses in Club A's form (one from leader, one from member)
insert into public.form_responses (id, form_id, user_id, answers)
values
  ('00000000-0000-0000-0000-00000000c750', '00000000-0000-0000-0000-00000000c730', '00000000-0000-0000-0000-00000000c701', '{"c740": "Ada Lovelace", "c741": "Morning"}'::jsonb),
  ('00000000-0000-0000-0000-00000000c751', '00000000-0000-0000-0000-00000000c730', '00000000-0000-0000-0000-00000000c702', '{"c740": "Grace Hopper", "c741": "Afternoon"}'::jsonb);

-- ---------------------------------------------------------------------------
-- A. Leader with manage_forms can read all responses for their club's form
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c701"}', true);

select ok(
  (select count(*) from public.form_responses r
   join public.forms f on f.id = r.form_id
   where f.id = '00000000-0000-0000-0000-00000000c730') = 2,
  'a leader can read all responses for their club form'
);
reset role;

-- ---------------------------------------------------------------------------
-- B. Member can read only their own response
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c702"}', true);

select ok(
  (select count(*) from public.form_responses r
   join public.forms f on f.id = r.form_id
   where f.id = '00000000-0000-0000-0000-00000000c730'
     and r.user_id = '00000000-0000-0000-0000-00000000c702') = 1,
  'a member can read their own response'
);

select ok(
  (select count(*) from public.form_responses r
   join public.forms f on f.id = r.form_id
   where f.id = '00000000-0000-0000-0000-00000000c730'
     and r.user_id <> '00000000-0000-0000-0000-00000000c702') = 0,
  'a member cannot read other members responses'
);
reset role;

-- ---------------------------------------------------------------------------
-- C. Cross-club leader cannot read responses for another club's form
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c703"}', true);

select ok(
  (select count(*) from public.form_responses r
   join public.forms f on f.id = r.form_id
   where f.id = '00000000-0000-0000-0000-00000000c730') = 0,
  'a leader of another club cannot read responses for a different club form'
);
reset role;

select * from finish();
rollback;
