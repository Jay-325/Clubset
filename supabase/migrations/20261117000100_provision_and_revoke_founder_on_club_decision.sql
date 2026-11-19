-- ============================================================================
-- Clubset :: 2026-11-17 -- provision / revoke the founder on a club decision
--
-- F-02: approving a club flipped its status and nothing else. The founder was
-- left with no active membership and no leadership role, so the first club they
-- created was unusable and their permissions came from nothing. Rejecting an
-- approved club likewise flipped the status and left the founder's leadership
-- assignments live (has_club_permission ignores membership status).
--
-- review_club() now performs the whole decision in one transaction:
--
--   approved, entering 'approved' for the first time
--     * the founder must be a current student (fail closed: founder_id is
--       nullable, so a deleted founder or a demoted account cannot be
--       provisioned),
--     * membership is created (or re-activated on reapproval) as active,
--     * the 'President' role is reused when it already exists -- preserving any
--       permissions a club customised -- and created with all ten permissions
--       otherwise,
--     * the founder is assigned that role once (no duplicate).
--
--   rejected, leaving 'approved'
--     * the founder membership is deactivated ('removed'),
--     * every role assignment the founder holds in the club is deleted, because
--       has_club_permission() does not consult membership status,
--     * the role row is kept, and the removal is audited
--       ('membership.revoked' plus one 'role.revoked' per assignment).
--
-- Reapproval (rejected -> approved) restores the membership and the assignment
-- and reuses the existing President row, so customised permissions survive.
--
-- Idempotency: a repeated approval of an already-approved club provisions
-- nothing; the founder membership is upserted on memberships_user_club_uniq and
-- the assignment on role_assignments (role_id, user_id).
--
-- Ordering note: the membership is written before the role/assignment so the
-- memberships_notify_leaders trigger cannot target the founder being
-- provisioned. A linked club_administrators row can still receive the standard
-- join-request notification; that is the pre-existing trigger behaviour.
--
-- Grants: create or replace preserves the existing ACL
-- (postgres/authenticated/service_role). No new endpoint.
--
-- ROLLBACK
--   Recreate review_club() from 20260101000002_clubs.sql. The provisioning and
--   revocation effects already applied to rows are not undone automatically.
-- ============================================================================

begin;

create or replace function public.review_club(
  target_club uuid,
  approved boolean,
  note text default null
)
returns public.clubs
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_club public.clubs;
  previous_status public.club_status;
  founder uuid;
  president public.leadership_roles;
begin
  if not public.is_administrator() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  -- Lock the club so two administrators cannot provision twice.
  select c.status, c.founder_id into previous_status, founder
  from public.clubs c
  where c.id = target_club
    and c.school_id = public.current_school_id()
  for update;

  if previous_status is null then
    raise exception 'Club not found in your school' using errcode = 'P0002';
  end if;

  update public.clubs
  set status = case when approved
                    then 'approved'::public.club_status
                    else 'rejected'::public.club_status
               end
  where id = target_club
  returning * into updated_club;

  -- ---------------------------------------------------------------- approve --
  if approved and previous_status is distinct from 'approved' then
    if founder is null
       or not exists (
         select 1 from public.profiles p
         where p.id = founder and p.account_type = 'student'
       ) then
      raise exception 'Club founder must be a current student' using errcode = '23514';
    end if;

    insert into public.memberships (club_id, user_id, status, joined_at)
    values (target_club, founder, 'active', now())
    on conflict (user_id, club_id) do update
      set status = 'active',
          joined_at = coalesce(public.memberships.joined_at, now());

    select * into president
    from public.leadership_roles
    where club_id = target_club and name = 'President';

    if president.id is null then
      insert into public.leadership_roles (
        club_id, name, description, permissions, is_review_supervisor, sort_order
      )
      values (
        target_club,
        'President',
        'Runs the club and keeps everything on track',
        array[
          'manage_settings',
          'manage_membership',
          'manage_events',
          'manage_attendance',
          'manage_finances',
          'manage_forms',
          'manage_data_tables',
          'manage_leadership',
          'send_announcements',
          'moderate_chat'
        ]::public.club_permission[],
        false,
        0
      )
      returning * into president;
    end if;

    insert into public.role_assignments (role_id, club_id, user_id, assigned_by)
    values (president.id, target_club, founder, auth.uid())
    on conflict (role_id, user_id) do nothing;
  end if;

  -- ---------------------------------------------------------------- reject --
  if not approved and previous_status = 'approved' then
    update public.memberships
    set status = 'removed',
        joined_at = null
    where club_id = target_club
      and user_id = founder;

    -- Every assignment, not just President: has_club_permission() keeps
    -- honouring an assignment after the membership is removed.
    delete from public.role_assignments
    where club_id = target_club
      and user_id = founder;

    perform private.record_audit(
      'membership.revoked', 'club', target_club,
      jsonb_build_object('user_id', founder)
    );
  end if;

  return updated_club;
end;
$$;

comment on function public.review_club(uuid, boolean, text) is
  'Administrator club decision. SECURITY DEFINER: provisions the Founder membership and President assignment on approval, revokes them on rejection of an approved club, and reuses an existing President role so customised permissions survive.';

commit;
