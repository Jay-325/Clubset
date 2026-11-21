-- ============================================================================
-- Clubset :: 2026-11-21 -- fix RSVP notification link path
--
-- notify_on_rsvp() wrote link_path = /clubs/{club}/events/{event}, but no
-- event-detail route exists. The events list page
-- (/clubs/{club}/events) is the correct destination. This changes only the
-- URL string; authorization and notification behavior are unchanged.
-- ============================================================================

begin;

create or replace function public.notify_on_rsvp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_club uuid;
  student_name text;
  event_title text;
begin
  select e.club_id, e.title into target_club, event_title
  from public.events e where e.id = new.event_id;

  select full_name into student_name from public.profiles where id = new.user_id;

  perform public.notify_club_leaders(
    target_club,
    'rsvp',
    'New RSVP',
    student_name || ' RSVPed to ' || event_title,
    '/clubs/' || target_club || '/events'
  );

  return new;
end;
$$;

comment on function public.notify_on_rsvp() is
  'Notifies club leaders of a new RSVP. link_path points to the events list page (/clubs/{club}/events), not a non-existent event-detail route.';

commit;
