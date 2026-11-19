-- ============================================================================
-- Clubset :: F-08 form-response direct-write authorization (pgTAP)
--
-- Regression: submit_form_response() enforces "form is published" and "caller
-- is a club member", but a direct INSERT into public.form_responses only
-- required user_id = auth.uid(). A student could therefore record a response
-- for an unpublished form, or for a club they are not a member of, bypassing
-- the RPC entirely.
--
-- After the fix the form_responses INSERT policy also requires the target form
-- to be published and the caller to be an active member of the form's club.
-- ============================================================================

begin;

set local search_path = public, extensions;
create extension if not exists pgtap;

select plan(4);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into public.schools (id, name, slug, email_domain)
values (
  '00000000-0000-0000-0000-00000000c3ff',
  'F08 School',
  'f08-school',
  'f08.invalid'
)
on conflict (id) do nothing;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-00000000c301', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@f08.invalid', '', now()),
  ('00000000-0000-0000-0000-00000000c302', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nonmember@f08.invalid', '', now())
on conflict (id) do nothing;

update public.profiles
set school_id = '00000000-0000-0000-0000-00000000c3ff',
    account_type = 'student'
where id in (
  '00000000-0000-0000-0000-00000000c301',
  '00000000-0000-0000-0000-00000000c302'
);

insert into public.clubs (id, school_id, name, type, commitment, founder_id, status)
values (
  '00000000-0000-0000-0000-00000000c310',
  '00000000-0000-0000-0000-00000000c3ff',
  'F08 Club',
  'recreational',
  'medium',
  '00000000-0000-0000-0000-00000000c301',
  'approved'
);

insert into public.memberships (club_id, user_id, status, joined_at)
values (
  '00000000-0000-0000-0000-00000000c310',
  '00000000-0000-0000-0000-00000000c301',
  'active',
  now()
);

insert into public.forms (id, club_id, created_by, title, status)
values
  ('00000000-0000-0000-0000-00000000c320', '00000000-0000-0000-0000-00000000c310', '00000000-0000-0000-0000-00000000c301', 'Published form', 'published'),
  ('00000000-0000-0000-0000-00000000c321', '00000000-0000-0000-0000-00000000c310', '00000000-0000-0000-0000-00000000c301', 'Draft form', 'draft');

-- ---------------------------------------------------------------------------
-- A. Non-member cannot insert a response for a published form in the club
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c302"}', true);

select throws_ok(
  $$insert into public.form_responses (form_id, user_id, answers)
    values ('00000000-0000-0000-0000-00000000c320', '00000000-0000-0000-0000-00000000c302', '{}'::jsonb)$$,
  '42501',
  null,
  'a non-member cannot write a form response for the club'
);
reset role;

-- ---------------------------------------------------------------------------
-- B. Member cannot insert a response for an unpublished (draft) form
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c301"}', true);

select throws_ok(
  $$insert into public.form_responses (form_id, user_id, answers)
    values ('00000000-0000-0000-0000-00000000c321', '00000000-0000-0000-0000-00000000c301', '{}'::jsonb)$$,
  '42501',
  null,
  'a member cannot write a response to an unpublished form'
);
reset role;

-- ---------------------------------------------------------------------------
-- C. Member can insert a response for a published form (authorized path)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c301"}', true);

select lives_ok(
  $$insert into public.form_responses (form_id, user_id, answers)
    values ('00000000-0000-0000-0000-00000000c320', '00000000-0000-0000-0000-00000000c301', '{"q1":"a"}'::jsonb)$$,
  'a member can write a response to a published form'
);
reset role;

select is(
  (select count(*)::integer from public.form_responses where user_id = '00000000-0000-0000-0000-00000000c301'),
  1,
  'exactly one authorized response was recorded'
);

select * from finish();
rollback;
