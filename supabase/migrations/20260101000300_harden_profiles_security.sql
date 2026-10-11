-- ============================================================================
-- Harden profiles table security
-- Prevent privilege escalation via self-update
-- ============================================================================
begin;

-- Drop existing overly permissive update policy
drop policy if exists profiles_update_self on public.profiles;

-- Restrict self-updates to non-sensitive fields only
create policy profiles_update_self_safe on public.profiles
  for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- Cannot change account type
    and account_type = (select account_type from public.profiles where id = auth.uid())
    -- Cannot change school
    and school_id is not distinct from (select school_id from public.profiles where id = auth.uid())
    -- Cannot change email
    and email = (select email from public.profiles where id = auth.uid())
  );

commit;
