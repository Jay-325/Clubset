-- ============================================================================
-- Update administrator authorization rules
--
-- New rules (PRD 5):
-- - Allowed domains: fairfieldschools.net, fairfieldschools.org (exact)
-- - Exception: arinjaypal@gmail.com (exact)
-- - Deny: ms.rivera@ridgeway.edu and others
-- ============================================================================
begin;

-- 1. Revoke old allowlist entry (preserve audit trail) and add new required entry
-- Revoke old ridgeway entry if present
update public.admin_allowlist
set revoked_at = now()
where lower(email) = 'ms.rivera@ridgeway.edu'
  and revoked_at is null;

-- Ensure arinjaypal@gmail.com is allowlisted for the active school context
-- Prefer existing ridgeway school; create if needed? But keep minimal.
insert into public.admin_allowlist (school_id, email, full_name, revoked_at)
select s.id, 'arinjaypal@gmail.com', 'Arinjay Pal', null
from public.schools s
where lower(s.slug) = 'ridgeway'
  and not exists (
    select 1
    from public.admin_allowlist a
    where a.school_id = s.id
      and lower(a.email) = 'arinjaypal@gmail.com'
  );

-- If no ridgeway school exists, also ensure it exists for any school? Not specified.
-- But keep changes minimal.

-- 2. Replace activate_administrator() to enforce domain + explicit exception
create or replace function public.activate_administrator()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_email text;
  email_lower text;
  domain text;
  target_school uuid;
  allowlisted_id uuid;
  updated_profile public.profiles;
begin
  select lower(email) into caller_email
  from public.profiles
  where id = auth.uid();

  if caller_email is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  email_lower := caller_email;

  -- Extract domain (exact match on suffix)
  if email_lower like '%@%' then
    domain := '@' || split_part(email_lower, '@', 2);
  else
    domain := '';
  end if;

  -- Check explicit exception and allowed domains (exact)
  if email_lower <> 'arinjaypal@gmail.com'
     and domain <> '@fairfieldschools.net'
     and domain <> '@fairfieldschools.org'
  then
    raise exception 'This email is not authorized to activate administrator access'
      using errcode = '42501';
  end if;

  -- Find matching allowlist entry (active) or allow domain-based activation?
  -- The architecture requires allowlist; ensure entry exists for allowed cases.
  -- For arinjaypal@gmail.com, ensure allowlisted.
  select al.school_id, al.id into target_school, allowlisted_id
  from public.admin_allowlist al
  where al.email = email_lower
    and al.revoked_at is null
  order by created_at
  limit 1;

  -- If not explicitly allowlisted but domain-allowed, find school context
  if target_school is null and (domain = '@fairfieldschools.net' or domain = '@fairfieldschools.org') then
    select s.id into target_school
    from public.schools s
    where s.slug = 'ridgeway'
    limit 1;
  end if;

  if target_school is null then
    raise exception 'This email is not on the administrator allowlist'
      using errcode = '42501';
  end if;

  update public.profiles
  set account_type = 'administrator',
      school_id = coalesce(school_id, target_school)
  where id = auth.uid()
  returning * into updated_profile;

  -- Record verification if allowlisted
  if allowlisted_id is not null then
    insert into public.admin_verifications (user_id, school_id, allowlist_id, status, activated_at)
    values (auth.uid(), target_school, allowlisted_id, 'activated', now());
  end if;

  return updated_profile;
end;
$$;

commit;
