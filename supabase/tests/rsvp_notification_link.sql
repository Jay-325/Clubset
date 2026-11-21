-- ============================================================================
-- Clubset :: RSVP notification link path (pgTAP)
--
-- Verifies that the notify_on_rsvp() trigger writes a link_path that points
-- to an existing route: /clubs/{club}/events (the events list page), not the
-- non-existent /clubs/{club}/events/{event} detail route.
-- ============================================================================

begin;

set local search_path = public, extensions;
create extension if not exists pgtap;

select plan(4);

-- ---------------------------------------------------------------------------
-- Fixtures: one club, one event, two students (one RSVPs)
-- ---------------------------------------------------------------------------
insert into public.schools (id, name, slug, email_domain)
values (
  '00000000-0000-0000-0000-00000000c8ff',
  'RSVP School',
  'rsvp-school',
  'c8.invalid'
)
on conflict (id) do nothing;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-00000000c801', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leader@c8.invalid', '', now()),
  ('00000000-0000-0000-0000-00000000c802', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@c8.invalid', '', now())
on conflict (id) do nothing;

update public.profiles
set school_id = '00000000-0000-0000-0000-00000000c8ff',
    account_type = 'student'
where id in (
  '00000000-0000-0000-0000-00000000c801',
  '00000000-0000-0000-0000-00000000c802'
);

insert into public.clubs (id, school_id, name, type, commitment, founder_id, status)
values
  ('00000000-0000-0000-0000-00000000c810', '00000000-0000-0000-0000-00000000c8ff', 'RSVP Club', 'recreational', 'medium', '00000000-0000-0000-0000-00000000c801', 'approved');

insert into public.memberships (club_id, user_id, status, joined_at)
values
  ('00000000-0000-0000-0000-00000000c810', '00000000-0000-0000-0000-00000000c801', 'active', now()),
  ('00000000-0000-0000-0000-00000000c810', '00000000-0000-0000-0000-00000000c802', 'active', now());

insert into public.leadership_roles (id, club_id, name, permissions, is_review_supervisor)
values
  ('00000000-0000-0000-0000-00000000c830', '00000000-0000-0000-0000-00000000c810', 'Officer', array['manage_events']::public.club_permission[], false);

insert into public.role_assignments (role_id, club_id, user_id, assigned_by)
values
  ('00000000-0000-0000-0000-00000000c830', '00000000-0000-0000-0000-00000000c810', '00000000-0000-0000-0000-00000000c801', '00000000-0000-0000-0000-00000000c801');

insert into public.events (id, club_id, created_by, title, starts_at, ends_at)
values
  ('00000000-0000-0000-0000-00000000c820', '00000000-0000-0000-0000-00000000c810', '00000000-0000-0000-0000-00000000c801', 'Weekly Meeting', now() + interval '1 day', now() + interval '2 day');

-- ---------------------------------------------------------------------------
-- A. RSVP trigger writes link_path to the events list page, not a detail route
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c802"}', true);

insert into public.rsvps (event_id, user_id, status)
values ('00000000-0000-0000-0000-00000000c820', '00000000-0000-0000-0000-00000000c802', 'going');
reset role;

-- The notification's link_path must be /clubs/{club}/events (the events list),
-- never /clubs/{club}/events/{event} (a non-existent detail route).
select is(
  (select link_path from public.notifications n
   where n.link_path is not null
   order by n.created_at desc limit 1),
  '/clubs/00000000-0000-0000-0000-00000000c810/events',
  'RSVP notification links to the events list page'
);

select ok(
  not exists (
    select 1 from public.notifications n
    where n.link_path like '/clubs/00000000-0000-0000-0000-00000000c810/events/%'
  ),
  'RSVP notification does not link to a non-existent event detail route'
);

-- Notification type and body are still correct
select is(
  (select type from public.notifications n
   where n.link_path is not null
   order by n.created_at desc limit 1),
  'rsvp',
  'RSVP notification type is rsvp'
);

select ok(
  (select body from public.notifications n
   where n.link_path is not null
   order by n.created_at desc limit 1)
  like '%RSVPed to%',
  'RSVP notification body mentions the event'
);

select * from finish();
rollback;
