-- ============================================================================
-- Joinin :: 2026-10-24 -- lock down EXECUTE on *future* public functions
--
-- WHY
--   `pg_default_acl` in this project grants EXECUTE to `anon` and
--   `authenticated` on every function created in `public` by `postgres`:
--
--     {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
--   So a new SECURITY DEFINER function is callable by signed-out visitors and
--   by every signed-in user the moment it is created, unless the author
--   remembers to REVOKE. The 2026-10-24 hardening migration had to repair
--   exactly this class of defect by hand (attendance_stats, notify_user,
--   notify_club_leaders).
--
--   This migration flips the default to fail-closed: future functions get
--   EXECUTE for `postgres` and `service_role` only. Anything that must be
--   client-callable now needs an explicit GRANT, which is visible in the diff
--   that creates it.
--
-- SCOPE / BLAST RADIUS
--   Default privileges apply only to objects created AFTER this statement, by
--   role `postgres`, in schema `public`. All existing functions keep their
--   current ACLs, so nothing in the running application changes and nothing is
--   revoked. Table and sequence defaults are deliberately NOT touched: a
--   sequence default of no USAGE would break INSERTs on any future
--   identity/serial column.
--
-- OPERATIONAL NOTE FOR FUTURE MIGRATIONS
--   * An RPC the browser calls must carry `grant execute ... to authenticated`.
--   * A function used inside an RLS policy expression must be granted to every
--     role that can query the table, including `anon` for signed-out reads
--     (see 20261019000100). Forgetting this fails closed with 42501, which is
--     the safe direction.
--
-- ROLLBACK
--   alter default privileges for role postgres in schema public
--     grant execute on functions to anon, authenticated;
--
-- Not destructive: no existing object, grant, policy or row is changed.
-- ============================================================================

begin;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

commit;
