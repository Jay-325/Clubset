-- ============================================================================
-- Joinin :: 2026-11-01 -- admin_allowlist: remove the signed-out grant
--
-- WHY
--   The Administrator tab on /login now consults the allowlist through
--   public.check_administrator_allowlist() (20261101182137) and reports the
--   SAME message whether or not the address is registered, so the page never
--   reveals allowlist membership.
--
--   The table itself is a different question. public.admin_allowlist has RLS
--   enabled with exactly one policy (admin_allowlist_admin_all, gated on
--   is_administrator() and school_id = current_school_id()), which is what
--   actually protects it. But `anon` still held the Supabase default
--   table-level SELECT/INSERT/UPDATE/DELETE grant, so a signed-out client
--   could reach /rest/v1/admin_allowlist and get `200 []` -- correct today,
--   but one permissive policy away from being a leak.
--
--   There is no legitimate signed-out read of this table: it is staff PII
--   (addresses + names) and every legitimate reader is a signed-in school
--   administrator. So the grant is removed outright: defence in depth, and the
--   failure mode becomes an explicit 42501 instead of an empty 200.
--
-- DELIBERATE EXCEPTION TO THE "anon 200, not 42501" INVARIANT
--   AGENTS.md warns that a 42501 on an anon read is usually the signature of a
--   missing EXECUTE grant on an RLS *policy predicate* (20261003001241). This
--   is not that: no policy anywhere evaluates admin_allowlist as the querying
--   role. The only functions that touch it -- handle_new_auth_user() and
--   activate_administrator(), plus check_administrator_allowlist() -- are all
--   SECURITY DEFINER and run as the table owner, so they keep working with no
--   grant for anon. A 42501 here is the intended answer.
--
-- NOT CHANGED
--   * `authenticated` keeps its table grant: school administrators manage their
--     own school's allowlist through admin_allowlist_admin_all (PRD 5, 37).
--     Revoking it would break that screen.
--   * RLS is untouched. The policy is still the row-level authority for
--     signed-in users; this only removes the signed-out surface.
--   * service_role and postgres are untouched.
--
-- ROLLBACK
--   grant select, insert, update, delete on public.admin_allowlist to anon;
--
-- Additive/inert for every existing flow: no policy, row, column or function
-- is changed. Only a grant to a role that has no legitimate use for it.
-- ============================================================================

begin;

revoke all on table public.admin_allowlist from anon;

commit;
