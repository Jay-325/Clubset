-- ============================================================================
-- Clubset :: 2026-11-17 -- student-only club creation, verification, founder
--
-- F-01: club creation was reachable by any signed-in profile, including
-- administrators, and a direct insert could skip the three-student stage by
-- writing status = 'approved'. This migration closes both paths:
--
--   * create_club() refuses a caller whose account_type is not 'student'
--     (explicit guard, so the error is legible);
--   * clubs_insert_founder requires a student caller AND forces the starting
--     status to 'awaiting_student_verification';
--   * club_verifications_insert requires a student caller.
--
-- Founder immutability: clubs_update_leader and clubs_admin_approve both leave
-- founder_id unconstrained, so the founder of an existing club could be
-- rewritten by the founder, a leader, or an administrator. club_verifications,
-- membership provisioning (20261117000100) and the founder's authority all
-- hang off founder_id, so it must be immutable.
--
-- The trigger is DATA-based, never identity-based. Inside a SECURITY DEFINER
-- function current_user is the function owner (postgres), not the caller, so an
-- identity allow-list would either block everything or allow everything. The
-- only permitted change is the ON DELETE SET NULL cascade from
-- clubs.founder_id -> profiles(id), which is recognisable because the founder
-- profile no longer exists at that point. Every other change -- client,
-- administrator, service_role, postgres -- raises 42501.
--
-- Break-glass: postgres owns public.clubs and can
-- ALTER TABLE public.clubs DISABLE TRIGGER clubs_guard_founder. That is an
-- operator action, never an application path.
--
-- ROLLBACK
--   drop trigger if exists clubs_guard_founder on public.clubs;
--   drop function if exists public.guard_club_founder_change();
--   drop function if exists public.is_student();
--   recreate create_club / clubs_insert_founder / club_verifications_insert
--   from 20260101000002_clubs.sql and 20261026000400_rls_and_index_performance.sql.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. "Is the caller a student?" -- a policy predicate, not an endpoint
--
--    Returns one boolean read from the caller's own profile. It grants nothing
--    and is false for signed-out callers.
--
--    Grant note: both policies below live on tables that `anon` still holds
--    table privileges on (the default Supabase grant). Postgres evaluates a
--    policy predicate as the querying role and does not guarantee short-circuit
--    order, so a policy referencing this function must keep EXECUTE for every
--    role that can reach the table -- otherwise anon sees 42501 instead of a
--    normal policy denial. This is the documented policy-predicate rule in
--    AGENTS.md, not a new endpoint.
-- ---------------------------------------------------------------------------
create or replace function public.is_student()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.account_type = 'student' from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

comment on function public.is_student() is
  'True when the signed-in caller has account_type = student. Policy predicate only; returns one boolean and grants nothing.';

revoke all on function public.is_student() from public;
grant execute on function public.is_student()
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. create_club(): students only
--
--    SECURITY INVOKER is preserved; the guard is an explicit call so the caller
--    gets "Only students can create clubs" instead of an opaque policy denial.
-- ---------------------------------------------------------------------------
create or replace function public.create_club(
  club_name text,
  club_type public.club_type,
  club_commitment public.commitment_level,
  club_fields text[],
  club_room text,
  club_meeting_day text,
  club_meeting_time time,
  club_description text default ''
)
returns public.clubs
language plpgsql
security invoker
set search_path = public
as $$
declare
  created_club public.clubs;
begin
  if not public.is_student() then
    raise exception 'Only students can create clubs' using errcode = '42501';
  end if;

  insert into public.clubs (
    name, description, type, commitment, fields, room,
    meeting_day, meeting_time, founder_id, school_id, status
  )
  values (
    club_name, club_description, club_type, club_commitment, club_fields,
    club_room, club_meeting_day, club_meeting_time, auth.uid(),
    public.current_school_id(), 'awaiting_student_verification'
  )
  returning * into created_club;

  insert into public.club_verifications (club_id, user_id, kind)
  values (created_club.id, auth.uid(), 'founder');

  return created_club;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Direct club inserts: student founder, correct starting status
-- ---------------------------------------------------------------------------
drop policy if exists clubs_insert_founder on public.clubs;

create policy clubs_insert_founder on public.clubs
  for insert
  with check (
    school_id = (select public.current_school_id())
    and founder_id = (select auth.uid())
    and public.is_student()
    and status = 'awaiting_student_verification'
  );

-- ---------------------------------------------------------------------------
-- 4. Verifications: students only (the founder row is inserted by create_club)
-- ---------------------------------------------------------------------------
drop policy if exists club_verifications_insert on public.club_verifications;

create policy club_verifications_insert on public.club_verifications
  for insert
  with check (
    user_id = (select auth.uid())
    and public.is_student()
    and exists (
      select 1 from public.clubs c
      where c.id = club_verifications.club_id
        and c.school_id = (select public.current_school_id())
        and c.status = 'awaiting_student_verification'
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Founder immutability
-- ---------------------------------------------------------------------------
create or replace function public.guard_club_founder_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.founder_id is not distinct from old.founder_id then
    return new;
  end if;

  -- The only sanctioned transition: the founder profile is gone, so the
  -- clubs_founder_id_fkey ON DELETE SET NULL action is clearing the column.
  if new.founder_id is null
     and not exists (select 1 from public.profiles p where p.id = old.founder_id) then
    return new;
  end if;

  raise exception 'Club founder cannot be changed' using errcode = '42501';
end;
$$;

comment on function public.guard_club_founder_change() is
  'BEFORE UPDATE OF founder_id guard: founder_id is immutable except for the ON DELETE SET NULL cascade after the founder profile is deleted.';

revoke all on function public.guard_club_founder_change() from public;

drop trigger if exists clubs_guard_founder on public.clubs;

create trigger clubs_guard_founder
  before update of founder_id on public.clubs
  for each row execute function public.guard_club_founder_change();

commit;
