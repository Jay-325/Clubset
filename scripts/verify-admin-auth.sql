-- ===========================================================================
-- Joinin :: administrator-authorization verification harness
--
-- !!! DEVELOPMENT / LOCAL STACK ONLY. NEVER RUN AGAINST PRODUCTION. !!!
-- It inserts four throwaway auth users (arinjaypal@gmail.com plus three
-- negative-test addresses) into an ISOLATED database that was created by
-- `supabase db reset` (migrations + seed).
--
-- How to run (requires Docker/WSL; not runnable on machines without them):
--   supabase start
--   supabase db reset
--   supabase db psql -f scripts/verify-admin-auth.sql
--
-- Expected results are printed as PASS/FAIL markers per test.
-- ===========================================================================

\set ON_ERROR_STOP off

\echo ''
\echo '=== V1: public.rsvp_status exists EXACTLY once with exactly 3 values ==='
select count(*) as type_count
from pg_type t join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and t.typname = 'rsvp_status';

select string_agg(e.enumlabel, ',' order by e.enumsortorder) as enum_values
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and t.typname = 'rsvp_status';
-- expect: 1 row, "going,maybe,not_going"

\echo '=== V2: columns still reference the enum ==='
select table_name, column_name, udt_name
from information_schema.columns
where table_schema = 'public' and udt_name = 'rsvp_status';
-- expect: rsvps.status, apply_rsvp_to_attendance.rsvp_state (function arg is pg_proc, not this view)

\echo '=== V3: seed allowlist state ==='
select s.slug, al.email, al.revoked_at
from public.admin_allowlist al join public.schools s on s.id = al.school_id
order by al.created_at;
-- expect: fairfield / arinjaypal@gmail.com / null (revoked_at is NULL)

\echo '=== V4: create throwaway auth users (fires on_auth_user_created -> profile) ==='
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'arinjaypal@gmail.com', crypt('pw', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'teacher@example.net', crypt('pw', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'student@example.org', crypt('pw', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'random@example.com', crypt('pw', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

select email, account_type from public.profiles order by email;
-- expect: all four provisioned with account_type = 'student'

\echo ''
\echo '=== TEST 1 (expect SUCCESS): arinjaypal@gmail.com activates ==='
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
select email, account_type from public.activate_administrator();
-- expect: arinjaypal@gmail.com | administrator

\echo '=== TEST 2 (expect FAIL 42501): teacher@example.net ==='
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
select public.activate_administrator();
-- expect: ERROR ... not on the administrator allowlist (SQLSTATE 42501)

\echo '=== TEST 3 (expect FAIL 42501): student@example.org ==='
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
select public.activate_administrator();
-- expect: ERROR ... not on the administrator allowlist (SQLSTATE 42501)

\echo '=== TEST 4 (expect FAIL 42501): random@example.com ==='
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', false);
select public.activate_administrator();
-- expect: ERROR ... not on the administrator allowlist (SQLSTATE 42501)

\echo '=== TEST 5: no other allowlisted admins were invented ==='
reset role;
select al.email from public.admin_allowlist al where al.revoked_at is null;
-- expect: only arinjaypal@gmail.com (local seed state)

\echo '=== TEST 6 (expect FAIL): normal user cannot modify ANOTHER user ==='
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', false);
update public.profiles set account_type = 'administrator' where id = '11111111-1111-1111-1111-111111111111';
-- expect: UPDATE 0 (RLS hides other rows entirely)

\echo '=== TEST 7a (expect FAIL): direct self-promotion via UPDATE is blocked ==='
update public.profiles set account_type = 'administrator' where id = '44444444-4444-4444-4444-444444444444';
-- expect: ERROR new row violates row-level security policy

\echo '=== TEST 7b (expect FAIL): admin_allowlist is unreadable to clients ==='
select count(*) from public.admin_allowlist;
-- expect: 0 rows (no client SELECT policy)

\echo '=== TEST 7c (expect FAIL): anon cannot execute activate_administrator ==='
reset role;
set role anon;
select public.activate_administrator();
-- expect: ERROR permission denied for function activate_administrator

\echo '=== FINAL STATE CHECK ==='
reset role;
select p.email, p.account_type
from public.profiles p
order by p.email;
-- expect: arinjaypal@gmail.com = administrator; everyone else = student

select u.email, v.status
from public.admin_verifications v
join public.profiles p on p.id = v.user_id
join auth.users u on u.id = v.user_id;
-- expect: one 'activated' row, for arinjaypal@gmail.com only

select has_function_privilege('authenticated', 'public.activate_administrator()', 'execute') as authenticated_can_execute,
       has_function_privilege('anon', 'public.activate_administrator()', 'execute') as anon_can_execute;
-- expect: true | false
