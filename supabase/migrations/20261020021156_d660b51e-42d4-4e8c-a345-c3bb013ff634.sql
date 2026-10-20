create or replace function public.guard_club_status_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if public.is_administrator() then
    return new;
  end if;
  if new.status = 'awaiting_administrator_verification'
     and old.status in ('draft', 'awaiting_student_verification', 'rejected')
     and old.founder_id = auth.uid()
     and public.student_verification_count(old.id) >= 3 then
    return new;
  end if;
  raise exception 'Club status can only be changed through the review workflow'
    using errcode = '42501';
end;
$$;

revoke execute on function public.guard_club_status_change() from public, anon;

drop trigger if exists clubs_guard_status on public.clubs;
create trigger clubs_guard_status
  before update of status on public.clubs
  for each row execute function public.guard_club_status_change();