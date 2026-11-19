-- ============================================================================
-- Clubset :: 2026-11-18 -- role-assignment club integrity
--
-- role_assignments carries its own club_id column but nothing ties it to
-- leadership_roles.club_id, so an assignment could link a user to a role that
-- belongs to a different club (denormalized data drift). has_club_permission()
-- evaluates ra.club_id consistently today, so there is no demonstrated
-- escalation path, but the invariant "an assignment's club is its role's club"
-- is not enforced at the database level.
--
-- Make leadership_roles(id, club_id) unique (id is already the primary key, so
-- this is safe) and add a foreign key role_assignments(role_id, club_id)
-- -> leadership_roles(id, club_id). A mismatched assignment is now rejected by
-- the database itself.
--
-- ROLLBACK
--   drop the foreign key, then drop the unique constraint.
-- ============================================================================

begin;

alter table public.leadership_roles
  add constraint leadership_roles_id_club_id_key unique (id, club_id);

alter table public.role_assignments
  add constraint role_assignments_role_id_club_id_fkey
  foreign key (role_id, club_id)
  references public.leadership_roles (id, club_id);

comment on constraint role_assignments_role_id_club_id_fkey on public.role_assignments
  is 'The club of a role assignment must match the club of its role, preventing denormalized club drift between role_assignments and leadership_roles.';

commit;
