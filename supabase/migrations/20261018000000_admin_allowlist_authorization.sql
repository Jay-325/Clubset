-- ============================================================================
-- Joinin :: administrator authorization -- the allowlist is authoritative
--
-- The previous definition of activate_administrator() (20260101000200)
-- granted administrator status to every @fairfieldschools.net /
-- @fairfieldschools.org address, and when no allowlist row existed it fell
-- back to the school with slug 'ridgeway'. A random school-domain user could
-- therefore self-activate as administrator without ever being allowlisted.
--
-- School-domain eligibility (who may hold a Joinin account at all) and
-- administrator authorization (who may hold the administrator account type)
-- are separate concepts. This migration makes the database enforce exactly
-- one rule for the latter:
--
--   The caller's exact, normalized email must match an active (non-revoked)
--   row in public.admin_allowlist. Nothing else authorizes activation:
--   no domain match, no school fallback, no caller-supplied identity.
--
-- arinjaypal@gmail.com stays authorized through its existing allowlist row
-- (inserted by 20260101000100 / 20260101000200 and re-seeded in
-- supabase/seed.sql) -- it is deliberately NOT hard-coded here.
--
-- No data is deleted; no tables, types, or policies are dropped except the
-- one insert policy below, which is immediately recreated strictly tighter.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- activate_administrator(): allowlist-authoritative rewrite
--
-- Same signature (no arguments, returns public.profiles), so the frontend
-- call (supabase.rpc("activate_administrator")) and the EXECUTE grants
-- established by 20261003000536 / 20261003001241 are unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.activate_administrator()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_email text;
  target_school uuid;
  allowlisted_id uuid;
  updated_profile public.profiles;
begin
  -- Identity comes only from the trusted auth context. The function accepts
  -- no arguments and can only ever act on the caller's own profile row.
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- Canonical email from Supabase Auth (auth.users), never client-supplied.
  -- Normalized the same way the allowlist stores it (check constraint
  -- admin_allowlist_email_normalized: email = lower(email)).
  select lower(btrim(u.email)) into caller_email
  from auth.users u
  where u.id = auth.uid();

  if caller_email is null or caller_email = '' then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- The allowlist is the ONLY authorization source: an exact normalized
  -- match on an active (non-revoked) row is required. School domains never
  -- substitute for a missing allowlist entry.
  select al.school_id, al.id into target_school, allowlisted_id
  from public.admin_allowlist al
  where al.email = caller_email
    and al.revoked_at is null
  order by al.created_at
  limit 1;

  if target_school is null then
    raise exception 'This email is not on the administrator allowlist'
      using errcode = '42501';
  end if;

  -- Only the caller's own profile row is ever written (id = auth.uid()).
  update public.profiles
  set account_type = 'administrator',
      school_id = coalesce(school_id, target_school)
  where id = auth.uid()
  returning * into updated_profile;

  insert into public.admin_verifications (user_id, school_id, allowlist_id, status, activated_at)
  values (auth.uid(), target_school, allowlisted_id, 'activated', now());

  return updated_profile;
end;
$$;

comment on function public.activate_administrator() is
  'Grants administrator status to the CALLER only, and only when the caller''s auth-email (lowercased/trimmed) matches an active public.admin_allowlist row. No domain or school fallback.';

-- Keep the execution surface identical to 20261003000536 / 20261003001241:
-- signed-in users only; never anon or PUBLIC.
revoke execute on function public.activate_administrator() from public, anon;
grant execute on function public.activate_administrator()
  to authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- Close the remaining direct-promotion surface on public.profiles.
--
-- profiles_update_self_safe (20260101000300) already forbids CHANGING
-- account_type through an update. The insert policy created in
-- 20260101000001, however, only checked id = auth.uid(), so in principle a
-- self-insert could have carried account_type = 'administrator'.
--
-- Normal signups are unaffected: the on_auth_user_created trigger
-- (security definer, runs as the table owner, bypasses RLS) always creates
-- the profile row at auth-user creation, and profiles has no client delete
-- policy, so no authenticated client can ever reach the insert path. The
-- guard below makes that invariant a database rule instead of an accident.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_insert_self on public.profiles;

create policy profiles_insert_self on public.profiles
  for insert
  with check (id = auth.uid() and account_type = 'student');

commit;
