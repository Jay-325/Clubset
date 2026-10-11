-- ============================================================================
-- Update administrator allowlist
-- 
-- Replace ms.rivera@ridgeway.edu with arinjaypal@gmail.com per request.
-- ============================================================================
begin;

-- Remove the old allowlist entry if present (case-insensitive)
delete from public.admin_allowlist
where lower(email) = 'ms.rivera@ridgeway.edu';

-- Add the new allowlist entry (case-insensitive safe)
insert into public.admin_allowlist (school_id, email, full_name)
select s.id, 'arinjaypal@gmail.com', 'Arinjay Pal'
from public.schools s
where s.slug = 'ridgeway'
  and not exists (
    select 1
    from public.admin_allowlist a
    where a.school_id = s.id
      and lower(a.email) = lower('arinjaypal@gmail.com')
  );

commit;
