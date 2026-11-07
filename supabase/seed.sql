-- ============================================================================
-- Clubset :: Development seed
--
-- Creates one school and an administrator allowlist entry so the Administrator
-- Login path (PRD 5) can be exercised locally.
--
-- SAFE TO RUN ONLY IN DEVELOPMENT. It inserts a known allowlist address; never
-- run this against a real school database.
-- ============================================================================

-- The seed mirrors the deployed tenant shape: one school and two administrator
-- allowlist entries so the Administrator Login path (PRD 5) can be exercised
-- locally.
--
-- The email/full_name values below are DEVELOPER PLACEHOLDERS only. They are
-- NOT the production administrator addresses. Production allowlist entries are
-- provisioned by an authorized operator using operator-supplied values outside
-- this repository (see the local-development provisioning notes in AGENTS.md).
-- Never commit real administrator contact details here.
-- Earlier revisions seeded a fabricated "Ridgeway High School" / ridgeway.edu
-- tenant. It never existed in any environment and has been removed; do not
-- reintroduce it.
--
-- Student sign-up is email-domain agnostic: any address may verify into a
-- student account, and handle_new_auth_user() falls back to this school when
-- no allowlist row or email_domain match exists. The school row no longer
-- carries an allowed_email_domains list -- that metadata was never enforced
-- and has been removed (20261103000000).
insert into public.schools (name, slug, email_domain, settings)
values (
  'Fairfield Schools',
  'fairfield',
  'fairfieldschools.net',
  '{}'::jsonb
)
on conflict (slug) do nothing;

-- The allowlist is the ONLY thing that grants administrator rights, so treat
-- any addition or removal here as a deliberate authorization change. It holds
-- exactly TWO entries in this project: the two people who may activate an
-- administrator account. Being on any email domain (including
-- @fairfieldschools.net/.org) grants student access only. The allowlist is
-- developer-managed; no signed-in user can write it (20261103000000).
insert into public.admin_allowlist (school_id, email, full_name)
select id, 'admin.one@example.invalid', 'Administrator One'
from public.schools
where slug = 'fairfield'
on conflict (school_id, email) do nothing;

insert into public.admin_allowlist (school_id, email, full_name)
select id, 'admin.two@example.invalid', 'Administrator Two'
from public.schools
where slug = 'fairfield'
on conflict (school_id, email) do nothing;
