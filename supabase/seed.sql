-- ============================================================================
-- Clubset :: Development seed
--
-- Creates one school and an administrator allowlist entry so the Administrator
-- Login path (PRD 5) can be exercised locally.
--
-- SAFE TO RUN ONLY IN DEVELOPMENT. It inserts a known allowlist address; never
-- run this against a real school database.
-- ============================================================================

-- The seed mirrors the deployed tenant exactly: one school, two administrators.
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

-- The allowlist is the ONLY thing that grants administrator rights, so treat
-- any addition or removal here as a deliberate authorization change. It holds
-- exactly TWO entries in this project: the two people who may activate an
-- administrator account. No school-domain address belongs here -- being on
-- @fairfieldschools.net/.org grants student access only.
insert into public.admin_allowlist (school_id, email, full_name)
select id, 'arinjaypal@gmail.com', 'Arinjay Pal'
from public.schools
where slug = 'fairfield'
on conflict (school_id, email) do nothing;

insert into public.admin_allowlist (school_id, email, full_name)
select id, 'ray.d.villaflor@gmail.com', 'Ray Villaflor'
from public.schools
where slug = 'fairfield'
on conflict (school_id, email) do nothing;
