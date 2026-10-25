-- ============================================================================
-- Clubset :: Development seed
--
-- Creates one school and an administrator allowlist entry so the Administrator
-- Login path (PRD 5) can be exercised locally.
--
-- SAFE TO RUN ONLY IN DEVELOPMENT. It inserts a known allowlist address; never
-- run this against a real school database.
-- ============================================================================

-- The seed mirrors the deployed tenant exactly: one school, one administrator.
-- Earlier revisions seeded a fabricated "Ridgeway High School" / ridgeway.edu
-- tenant. It never existed in any environment and has been removed; do not
-- reintroduce it.
insert into public.schools (name, slug, email_domain, settings)
values (
  'Fairfield Schools',
  'fairfield',
  'fairfieldschools.net',
  '{"allowed_email_domains":["fairfieldschools.net","fairfieldschools.org"]}'::jsonb
)
on conflict (slug) do nothing;

-- There is intentionally EXACTLY ONE allowlist entry in this project. Adding
-- a second address here hands administrator rights to that address, so treat
-- any addition as a deliberate authorization change.
insert into public.admin_allowlist (school_id, email, full_name)
select id, 'arinjaypal@gmail.com', 'Arinjay Pal'
from public.schools
where slug = 'fairfield'
on conflict (school_id, email) do nothing;
