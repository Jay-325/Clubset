-- ============================================================================
-- Clubset :: 2026-11-03
--   * student sign-up is email-domain agnostic
--   * the administrator allowlist is developer-only (no client write path)
--
-- WHY
--   1. handle_new_auth_user() previously linked a school ONLY when the new
--      auth email matched an active admin_allowlist row. An ordinary student
--      -- including a @fairfieldschools.net address -- therefore landed with
--      profiles.school_id = NULL. current_school_id() then returned NULL, so
--      club discovery and every school-scoped policy returned nothing. In
--      practice only allowlisted (administrator) emails had a usable account.
--
--      The product requirement is the opposite: ANY email address may verify
--      into a student account. Administrator status is still allowlist-only.
--
--   2. The allowlist must be settable only by developers. The old
--      admin_allowlist_admin_all policy let an activated school administrator
--      INSERT/UPDATE/DELETE allowlist rows through PostgREST if the table
--      grant were ever present, i.e. an administrator could mint another
--      administrator. The app has no allowlist-management UI, and the only
--      legitimate readers are SECURITY DEFINER functions, so the client write
--      surface is removed entirely.
--
-- WHAT
--   * handle_new_auth_user() resolves a school in this order:
--       1. an active admin_allowlist row (pins the account to that school),
--       2. a school whose email_domain matches the address (routing hint),
--       3. the deployment's oldest school (single-tenant fallback).
--     Step 3 is what makes a Gmail/Outlook/any address a working student
--     account. It never grants administrator status: account_type keeps its
--     column default 'student'.
--   * drop policy admin_allowlist_admin_all;
--   * revoke ALL on public.admin_allowlist from anon, authenticated;
--   * grant DML on public.admin_allowlist to service_role (server-only
--     credential) so developer tooling can still manage the list;
--   * remove the now-meaningless settings.allowed_email_domains metadata.
--
-- NOT CHANGED
--   * public.admin_allowlist rows, including the two authorised addresses
--     (arinjaypal@gmail.com, ray.d.villaflor@gmail.com).
--   * activate_administrator() -- still the sole activation path and still
--     allowlist-authoritative (no domain fallback).
--   * check_administrator_allowlist() -- still the anon-callable read-only
--     pre-check; it is SECURITY DEFINER and does not need a table grant.
--   * RLS on every other table.
--
-- ROLLBACK
--   -- restore the old policy and client grants if this must be reverted:
--   create policy admin_allowlist_admin_all on public.admin_allowlist
--     for all
--     using (public.is_administrator() and school_id = public.current_school_id())
--     with check (public.is_administrator() and school_id = public.current_school_id());
--   grant select, insert, update, delete on public.admin_allowlist to authenticated;
--   -- then re-apply the previous handle_new_auth_user() definition from
--   -- 20260101000001_core_schema.sql if domain-only school linking is required.
--
-- Additive and idempotent: create or replace, drop policy if exists, and
-- convergent grants. No row is deleted; the two allowlist entries are kept.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Every verified email gets a usable student account.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_school uuid;
  resolved_name text;
begin
  resolved_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    split_part(new.email, '@', 1)
  );

  -- 1. An active allowlist row pins the account to that school. This only
  --    chooses the tenant; administrator status is NOT granted here.
  select al.school_id into resolved_school
  from public.admin_allowlist al
  where new.email is not null
    and lower(btrim(new.email)) = al.email
    and al.revoked_at is null
  order by al.created_at
  limit 1;

  -- 2. Prefer a school that declares this email's domain. This is a routing
  --    hint, not an access gate: a non-matching domain still falls through.
  if resolved_school is null and new.email is not null then
    select s.id into resolved_school
    from public.schools s
    where s.email_domain is not null
      and lower(s.email_domain) = lower(split_part(new.email, '@', 2))
    order by s.created_at
    limit 1;
  end if;

  -- 3. Fallback: the deployment's school. This is what turns an arbitrary
  --    address into a working student account instead of an orphan profile.
  if resolved_school is null then
    select s.id into resolved_school
    from public.schools s
    order by s.created_at
    limit 1;
  end if;

  insert into public.profiles (id, school_id, email, full_name)
  values (
    new.id,
    resolved_school,
    lower(new.email),
    resolved_name
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_auth_user() is
  'Provisions a student profile for every new auth user. Any email domain is accepted; the school is resolved from an active allowlist row, then a matching schools.email_domain, then the deployment''s oldest school. Never grants administrator status.';

-- ---------------------------------------------------------------------------
-- 2. The allowlist is developer-managed only.
-- ---------------------------------------------------------------------------

-- Remove the policy that let an activated school administrator write the
-- allowlist through the Data API. No application screen uses it.
drop policy if exists admin_allowlist_admin_all on public.admin_allowlist;

-- Defence in depth: even if a future migration re-adds a permissive policy,
-- a signed-in or signed-out client has no table privilege to exercise it.
revoke all on table public.admin_allowlist from anon, authenticated;

-- service_role is a server-only credential (never shipped to the browser) and
-- is the supported way for developer tooling/automation to manage the list.
-- postgres (direct database access) retains its existing privileges.
grant select, insert, update, delete on table public.admin_allowlist to service_role;

comment on table public.admin_allowlist is
  'Administrator allowlist. Developer-managed only: anon and authenticated have no table privileges. Read by SECURITY DEFINER functions (activate_administrator, check_administrator_allowlist, handle_new_auth_user). Adding a row does not itself grant administrator status; the address must still pass activate_administrator().';

-- ---------------------------------------------------------------------------
-- 3. Remove the unused domain-list metadata.
--
-- Nothing in the schema, application or RLS reads settings.allowed_email_domains
-- (it was descriptive only). Removing it prevents it from being mistaken for an
-- access gate and keeps the school row aligned with "all domains welcome".
-- ---------------------------------------------------------------------------
update public.schools
set settings = settings - 'allowed_email_domains'
where settings ? 'allowed_email_domains';

commit;
