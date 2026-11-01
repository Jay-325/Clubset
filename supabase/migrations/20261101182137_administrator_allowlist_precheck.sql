-- ============================================================================
-- Joinin :: 2026-11-01 -- administrator activation: allowlist pre-check RPC
--
-- WHY
--   The Administrator tab on /login called supabase.auth.signInWithOtp() for
--   whatever address was typed, before any allowlist lookup. Two problems:
--
--     1. an address that is NOT on the allowlist still received a Supabase
--        sign-in / verification email, and
--     2. because that call passes shouldCreateUser: true, it *created an auth
--        user* -- and, via on_auth_user_created, a profile row -- for an
--        address that is not allowed to be an administrator at all.
--
--   The page could not check first: public.admin_allowlist has no client SELECT
--   policy (20260101000001 grants it only to school administrators), so the
--   browser cannot read it, and that must stay true -- the list is staff PII
--   (addresses + names) and must never reach a client.
--
-- WHAT
--   check_administrator_allowlist(candidate_email text) -> boolean
--
--   A single-answer lookup: "is this exact, normalized address on an ACTIVE
--   (non-revoked) admin_allowlist row?" It returns one boolean and nothing
--   else -- no name, no school, no allowlist id. SECURITY DEFINER so it can read
--   the table on the caller's behalf; STABLE because it only reads.
--
--   The client calls it BEFORE signInWithOtp():
--     false -> the page says "you do not have administrator permission", no
--              email is sent, and no auth user is created;
--     true  -> the activation link is requested exactly as before.
--
--   This is a UX gate, NOT the authorization. Authorization remains solely
--   activate_administrator(), which derives identity from auth.uid(), reads the
--   email from auth.users (never from the client) and re-checks the allowlist
--   itself. A client that skips the pre-check gains nothing: it can ask for an
--   activation email, but activation still fails with 42501 unless the verified
--   auth email is allowlisted.
--
-- GRANTS (read before editing)
--   `anon` MUST be able to EXECUTE this: the caller is a signed-out visitor on
--   /login. That is the one deliberate exception to "no EXECUTE for anon on
--   public functions" in AGENTS.md -- this is an endpoint, not a policy
--   predicate, and it only reads. Revoke the implicit PUBLIC grant first, then
--   grant anon/authenticated explicitly, matching 20261024204857.
--
-- RESIDUAL RISK (accepted, documented in SECURITY_NOTES.md)
--   Email enumeration: anyone can ask this endpoint about an arbitrary address
--   and learn whether that teacher is an allowlisted administrator. The
--   alternative -- always send the email and say nothing -- is what the product
--   owner explicitly asked to remove. Mitigations in place:
--     * one boolean, no other column is ever returned;
--     * revoked and never-allowlisted addresses are indistinguishable;
--     * malformed / oversized input short-circuits before any table access;
--     * the lookup is an index-only hit on admin_allowlist_lookup_idx (email)
--       where revoked_at is null (20260101000001:103).
--   If this becomes a problem, rate limit
--   /rest/v1/rpc/check_administrator_allowlist at the edge.
--
-- ROLLBACK
--   drop function if exists public.check_administrator_allowlist(text);
--   (the client must then fall back to the unconditional signInWithOtp() call)
--
-- Additive and idempotent: create or replace, no table/column/policy/row change.
-- ============================================================================

begin;

create or replace function public.check_administrator_allowlist(candidate_email text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized text;
begin
  -- Normalize exactly the way the allowlist stores it. The check constraint
  -- admin_allowlist_email_normalized guarantees email = lower(email), and
  -- activate_administrator() applies the same btrim/lower pair to auth.users.
  normalized := lower(btrim(coalesce(candidate_email, '')));

  -- Reject anything that cannot be an address before touching the table, so
  -- junk input costs no index probe and can never match by accident.
  if normalized = '' then
    return false;
  end if;
  if length(normalized) > 254 then
    return false;
  end if;
  if position('@' in normalized) <= 1 then
    return false;
  end if;
  if position('@' in normalized) >= length(normalized) then
    return false;
  end if;

  -- Same predicate as activate_administrator(): exact normalized match on an
  -- active row. A revoked row answers false, identical to "never allowlisted".
  return exists (
    select 1
    from public.admin_allowlist al
    where al.email = normalized
      and al.revoked_at is null
  );
end;
$$;

comment on function public.check_administrator_allowlist(text) is
  'Read-only allowlist lookup for the Administrator login tab: returns true when candidate_email (lowercased/trimmed) matches an active public.admin_allowlist row. Returns one boolean only; grants nothing. Authorization still happens in activate_administrator().';

-- Fail closed first: drop the implicit PUBLIC grant, then grant the two roles
-- that legitimately call it. `anon` is required (signed-out /login visitor).
revoke execute on function public.check_administrator_allowlist(text) from public;
grant execute on function public.check_administrator_allowlist(text)
  to anon, authenticated, service_role, postgres;

commit;
