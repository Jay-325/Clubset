-- ============================================================================
-- Clubset :: 20261025 -- authorize a SECOND administrator
--
-- WHY THIS MIGRATION EXISTS
-- ---------------------------------------------------------------------------
-- The project owner asked for exactly two people to hold administrator access:
--
--     arinjaypal@gmail.com      (already allowlisted, 20261019000200)
--     ray.d.villaflor@gmail.com (added here)
--
-- Administrator status in this schema is granted by exactly one mechanism: an
-- active row in public.admin_allowlist (revoked_at is null) whose email matches
-- the caller's canonical auth.users email. activate_administrator() takes no
-- arguments, reads auth.uid(), and refuses anyone whose exact lowercased email
-- is absent from that table. No school domain substitutes for an allowlist row,
-- and no code change grants this -- writing a row into the table the function
-- consults is the whole mechanism, exactly as an existing administrator would
-- do through the app.
--
-- PRECONDITION CHECK (read-only, 2026-10-25, project omcddzmtjqhrsxdxiewn):
--     select id, email, full_name, revoked_at from public.admin_allowlist;
--     -- 1 row: arinjaypal@gmail.com / Arinjay Pal / revoked_at null
--     select id, name, slug from public.schools;
--     -- 1 row: 8543bc6b-... / Fairfield Schools / fairfield
--
-- ============================================================================
-- SCOPE / SAFETY
-- ============================================================================
-- Additive and idempotent. No DROP, no DELETE, no UPDATE, no table/column/
-- policy/grant change, no data loss, no reset. The insert is guarded by
-- NOT EXISTS on lower(email) and ON CONFLICT DO NOTHING, so re-running it
-- cannot create a duplicate administrator. Safe to run more than once.
--
-- DESTRUCTIVE CHANGE LOG: NONE.
--
-- ============================================================================
-- WHAT THIS DOES *NOT* GRANT
-- ============================================================================
--   * It does not create an auth user. Ray must sign up / sign in through the
--     normal email flow and click the confirmation link; until that account
--     exists and is confirmed, there is nobody for activate_administrator() to
--     promote.
--   * It does not promote automatically. The allowlist only makes activation
--     *possible*; the user still has to call the activation step once signed in.
--   * It does not widen student access. Every new account is still created as
--     account_type = 'student' by handle_new_auth_user(); only the allowlisted
--     address can flip itself to 'administrator'.
--   * School domains (@fairfieldschools.net / .org) remain unable to activate.
--     After this migration the allowlist holds exactly TWO rows, both personal
--     Gmail addresses, and the invariant "no school-domain address in the
--     allowlist" is preserved.
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Not automatic (removing access is a different intent and needs a deliberate
-- decision). To revoke this administrator later, prefer marking the row rather
-- than deleting it, so the audit trail survives:
--
--     update public.admin_allowlist
--        set revoked_at = now()
--      where email = 'ray.d.villaflor@gmail.com'
--        and revoked_at is null;
--
-- activate_administrator() checks revoked_at is null, so that immediately stops
-- any further activation. An already-activated profile keeps account_type =
-- 'administrator' until it is deliberately changed; downgrade it separately if
-- that is the intent:
--
--     update public.profiles
--        set account_type = 'student'
--      where id = (select id from auth.users
--                   where lower(email) = 'ray.d.villaflor@gmail.com');
--
-- ============================================================================
-- VERIFICATION (run manually after applying; expected: exactly two active rows)
-- ---------------------------------------------------------------------------
--     select a.email, a.full_name, a.revoked_at, s.slug, s.name
--       from public.admin_allowlist a
--       join public.schools s on s.id = a.school_id
--      order by a.created_at;
--     -- expect BOTH of:
--     --   arinjaypal@gmail.com      | Arinjay Pal   | null | fairfield
--     --   ray.d.villaflor@gmail.com | Ray Villaflor | null | fairfield
--
--     -- No school-domain address may ever appear here:
--     select count(*) from public.admin_allowlist
--      where email like '%@fairfieldschools.net'
--         or email like '%@fairfieldschools.org';
--     -- expect: 0
--
--     -- After Ray signs in from a confirmed address, the RPC must return the
--     -- profile with account_type = 'administrator':
--     --   select public.activate_administrator();
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Authorize the second administrator.
--
-- school_id is resolved by SELECTING the project's existing school (preferring
-- the Fairfield slug) instead of hard-coding a uuid, so this binds to whatever
-- tenant the project actually has. The NOT EXISTS guard means a database that
-- already authorizes this address is left untouched, and ON CONFLICT DO NOTHING
-- (no conflict target, so it covers every unique index on the table) makes a
-- re-run a no-op rather than an error.
--
-- The live table does have a unique index, verified on 2026-10-25:
--     admin_allowlist_school_email_uniq unique (school_id, email)
-- so a plain re-insert of the same (school, address) would otherwise raise
-- 23505. The NOT EXISTS guard on lower(email) additionally covers the case
-- where the address already exists under a *different* school_id, which the
-- unique index alone would not catch.
--
-- The address is stored lowercase to satisfy the pre-existing check constraint
-- admin_allowlist_email_normalized (email = lower(email)).
-- ---------------------------------------------------------------------------
insert into public.admin_allowlist (school_id, email, full_name)
select s.id, 'ray.d.villaflor@gmail.com', 'Ray Villaflor'
from public.schools s
where not exists (
    select 1
    from public.admin_allowlist a
    where lower(a.email) = 'ray.d.villaflor@gmail.com'
  )
order by (s.slug = 'fairfield') desc, s.created_at
limit 1
on conflict do nothing;

commit;
