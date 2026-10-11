-- ============================================================================
-- Joinin :: Development seed
--
-- Creates one school and an administrator allowlist entry so the Administrator
-- Login path (PRD 5) can be exercised locally.
--
-- SAFE TO RUN ONLY IN DEVELOPMENT. It inserts a known allowlist address; never
-- run this against a real school database.
-- ============================================================================

insert into public.schools (name, slug, email_domain)
values ('Ridgeway High School', 'ridgeway', 'ridgeway.edu')
on conflict (slug) do nothing;

-- The teacher who will activate the administrator account. Sign in with this
-- address, then call activate_administrator() to receive the role.
insert into public.admin_allowlist (school_id, email, full_name)
select id, 'arinjaypal@gmail.com', 'Arinjay Pal'
from public.schools
where slug = 'ridgeway'
on conflict (school_id, email) do nothing;

-- ---------------------------------------------------------------------------
-- Clubs that exist purely to exercise the three-student verification flow
-- ---------------------------------------------------------------------------
--
-- These are inserted with the full three-student verification set so an
-- administrator has something waiting in the review queue on first login.
-- club_verifications.user_id references auth.users, so these are wired up in
-- README.md instructions rather than here (there are no auth users yet at
-- migration time).