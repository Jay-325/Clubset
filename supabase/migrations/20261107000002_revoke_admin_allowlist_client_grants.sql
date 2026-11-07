-- ============================================================================
-- Clubset :: 2026-11-07 -- revoke admin_allowlist client grants (VULN-002)
--
-- WHY
--   The administrator allowlist retains table-level SELECT/INSERT/UPDATE/DELETE
--   privileges for anon and authenticated, despite migration 20261103000000
--   intending to revoke them. RLS on the table currently has no policies, so
--   any table-level grant is a direct attack surface: if a future migration
--   adds a permissive policy, clients could read or modify the allowlist.
--
--   The allowlist is developer-managed only. Legitimate readers are SECURITY
--   DEFINER functions (activate_administrator, check_administrator_allowlist,
--   handle_new_auth_user) which run as the table owner and are unaffected by
--   client grants.
--
-- WHAT
--   Revoke all table-level privileges on public.admin_allowlist from anon and
--   authenticated. Only postgres and service_role retain access.
--
-- ROLLBACK
--   grant select, insert, update, delete on public.admin_allowlist to anon, authenticated;
-- ============================================================================

begin;

revoke all on table public.admin_allowlist from anon, authenticated;

comment on table public.admin_allowlist is
  'Administrator allowlist. Developer-managed only: anon and authenticated have no table privileges. Read by SECURITY DEFINER functions (activate_administrator, check_administrator_allowlist, handle_new_auth_user). Adding a row does not itself grant administrator status; the address must still pass activate_administrator().';

commit;
