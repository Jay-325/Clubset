-- ============================================================================
-- Joinin :: 2026-10-25 -- REVERT of 20261025001325 (inert default-privilege change)
--
-- WHY THIS IS A REVERT, NOT A REGRESSION
--   20261025001325 tried to make future public functions fail closed by running
--
--     alter default privileges for role postgres in schema public
--       revoke execute on functions from anon, authenticated;
--
--   That statement changed pg_default_acl (public/postgres/f =
--   {postgres=X/postgres,service_role=X/postgres}) but had NO effect on the
--   ACL of a function created afterwards. Verified live, twice:
--
--     create function public.__fn5() ...;
--     -- proacl = {=X/postgres,postgres=X/postgres,service_role=X/postgres}
--     -- has_function_privilege(anon, ..., execute) = true
--
--   and an isolated fresh schema with the same revoke applied still produced
--   proacl = null for a new function (i.e. the built-in PUBLIC EXECUTE default
--   applies). Table and sequence defaults ARE honoured on this platform; only
--   the FUNCTION default is inert. An event trigger is not re-granting it, and
--   supabase_admin cannot be altered at all:
--
--     alter default privileges for role supabase_admin ... -> 42501
--
--   So the migration bought zero protection while its comment claimed a
--   guarantee. That is worse than no migration: a future author would rely on
--   it and skip the explicit REVOKE. Reverting restores the exact ACL row that
--   existed before 20261025001325 and leaves the truthful control in place:
--   every migration that creates a SECURITY DEFINER function must REVOKE
--   explicitly (see 20261024204857 for the pattern).
--
-- SCOPE
--   Restores pg_default_acl for (role postgres, schema public, functions) to
--     {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   No existing function, grant, policy, table or row is touched. No function
--   ACL is changed by this migration.
--
-- ROLLBACK
--   alter default privileges for role postgres in schema public
--     revoke execute on functions from anon, authenticated;
--   (restores the inert state; safe either way because it is inert)
-- ============================================================================

begin;

alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated;

commit;
