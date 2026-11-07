# Clubset — Migration Reconciliation Report

**Date:** 2026-11-07  
**Environment:** Local Supabase stack (Docker, localhost:54321)  
**Scope:** Reconciliation of repository migration state vs. local database state vs. reported remote state

---

## Repository Migration State

The repository contains 46 migration files in `supabase/migrations/`, applied in timestamp order. The latest migrations are:

| Migration | Description |
|-----------|-------------|
| `20261104000000_fix_write_path_bugs.sql` | Fix write-path bugs (add_manual_attendance, finalize_attendance, record_audit grant) |
| `20261106000000_restrict_anonymous_authenticated_role.sql` | Add `is_anonymous` check to policies (re-created `clubs_select_school` with permissive policy) |
| `20261107000000_add_auth_rate_limiting.sql` | Application-side rate limiting for auth email operations |
| `20261107000001_fix_clubs_select_school_policy.sql` | **NEW** — Restrictive `clubs_select_school` policy (VULN-001 fix) |
| `20261107000002_revoke_admin_allowlist_client_grants.sql` | **NEW** — Revoke `admin_allowlist` client grants (VULN-002 fix) |
| `20261107000003_restrict_profile_column_exposure.sql` | **NEW** — `profiles_public` view + `profiles_select_self` (VULN-003 fix) |

All 46 SQL files parse cleanly via `npm run check:sql`.

---

## Local Database State

The local Docker Supabase stack has 44 migrations applied (through `20261106000000`). The three new fix migrations (`20261107000001`–`20261107000003`) have been applied directly to the local database via SQL execution (not via migration history tracking, since we used direct `psql` execution for verification).

### Current RLS Policies (verified)

**`public.clubs` — `clubs_select_school` (SELECT):**
```sql
(school_id = (select public.current_school_id()))
and (
  public.can_discover_club(id)
  or founder_id = (select auth.uid())
  or public.is_club_member(id)
  or public.is_club_admin(id)
)
```
✅ Restrictive — matches migration `20261026000100` intent

**`public.profiles` — `profiles_select_self` (SELECT):**
```sql
id = (select auth.uid())
```
✅ Self-only — replaced permissive `profiles_select_school`

**`public.profiles_public` view:**
- Columns: `id, full_name, grade, interests, commitment_hours, avatar_url, onboarding_complete, created_at, updated_at`
- Excludes: `email`, `account_type`, `school_id`
- `security_invoker = false`, owner `postgres`
- SELECT granted to `authenticated` only

**`public.admin_allowlist` table privileges:**
- `anon`: No grants (REVOKED)
- `authenticated`: No grants (REVOKED)
- `postgres`: Full access
- `service_role`: Full access
- RLS enabled, no policies

**Database function `public.is_user_administrator(uuid)`:**
- Returns boolean only
- SECURITY DEFINER, `search_path = public`
- EXECUTE granted to `authenticated`

---

## Reported Remote Discrepancies

The remote Supabase project `omcddzmtjqhrsxdxiewn` could not be directly verified because the anon key from `.env` returns "Invalid API key". Reported discrepancies from the initial investigation:

| Aspect | Local (before fix) | Remote (reported) | After Fix (local) |
|--------|-------------------|-------------------|-------------------|
| `profiles` anon read | `[]` (HTTP 200) | 42501 | 42501 (no grant) |
| `admin_allowlist` anon read | `[]` (HTTP 200) | 42501 | 42501 (no grant) |
| `clubs_select_school` policy | Permissive (school-wide) | Unknown | Restrictive |
| Table-level grants on `admin_allowlist` | anon/authenticated: full DML | Unknown (likely revoked) | Revoked |

The remote appears to have had the table-level privilege revocations properly applied (returning 42501 instead of `[]`), while the local stack did not. After our fix, the local stack now matches the expected remote behavior.

---

## Identified Policy/Grant Differences

### 1. `clubs_select_school` Policy Drift (Root Cause of VULN-001)

Migration `20261026000100` created a restrictive `clubs_select_school` policy using `can_discover_club()`. Migration `20261106000000` (applied later) re-created it with the permissive school-wide policy plus `is_anonymous` check. This override caused VULN-001.

**Resolution:** Migration `20261107000001` re-creates the restrictive policy. The fix migration is applied after `20261106000000`, so it takes effect.

### 2. `admin_allowlist` Client Grants (VULN-002)

Migration `20261103000000` intended to `REVOKE ALL ON TABLE public.admin_allowlist FROM anon, authenticated`, but the local database still had these grants. The remote appeared to have them revoked (42501 responses).

**Resolution:** Migration `20261107000002` re-applies the revocation.

### 3. `profiles_select_school` Column Exposure (VULN-003)

The permissive school-wide SELECT policy on `profiles` exposed all columns including `account_type` and `email` to all same-school users. RLS cannot restrict columns.

**Resolution:** Migration `20261107000003` replaces with `profiles_select_self` (self-only) and creates `profiles_public` view with limited columns.

---

## Migration Ordering and Dependencies

The fix migrations are ordered correctly:
1. `20261107000001` — Fixes `clubs_select_school` (depends on `can_discover_club()`, `is_club_member()`, `is_club_admin()` from `20261026000100`)
2. `20261107000002` — Revokes `admin_allowlist` grants (depends on table existing from `20260101000001`)
3. `20261107000003` — Creates `profiles_public` view, `profiles_select_self`, `is_user_administrator()` (depends on `profiles` table from `20260101000001`)

All migrations are:
- **Additive and idempotent:** Use `create or replace`, `drop policy if exists`, convergent grants
- **No destructive statements:** No drops of tables, columns, or rows
- **Repeatable:** Safe to re-run

---

## Fresh Database Setup Verification

A fresh local database receiving all migrations in order would get:

1. `20261026000100` — Creates restrictive `clubs_select_school` + `can_discover_club()`
2. `20261106000000` — Overrides `clubs_select_school` with permissive version (+ `is_anonymous` check)
3. `20261107000001` — Re-creates restrictive `clubs_select_school` (final state: restrictive ✅)

1. `20261103000000` — Revokes `admin_allowlist` grants from `anon`/`authenticated`
2. `20261107000002` — Re-applies revocation (idempotent, final state: revoked ✅)

1. `20260101000300` — Creates `profiles_select_school` (permissive, school-wide)
2. `20261107000003` — Replaces with `profiles_select_self` + `profiles_public` view (final state: restricted ✅)

---

## Seed Data Verification

`supabase/seed.sql` uses developer placeholders only (`admin.one@example.invalid`, `admin.two@example.invalid`). No real administrator contact details are committed. Seed data is development-only and is not run against production.

---

## Outstanding Remote Verification Requirements

The following must be manually verified in the remote environment after deployment, using a valid remote anon key:

1. **`clubs_select_school` policy** — Confirm restrictive policy is in effect on remote (not the permissive version from `20261106000000`)
2. **`admin_allowlist` table privileges** — Confirm `anon` and `authenticated` have no table-level grants (should return 42501, not `[]`)
3. **`profiles` table privileges** — Confirm `anon` has no SELECT grant (should return 42501)
4. **`profiles_public` view** — Confirm view exists with limited columns and `authenticated` SELECT grant
5. **`is_user_administrator()` function** — Confirm function exists and EXECUTE granted to `authenticated`
6. **`/mcp` endpoint** — Confirm hosting-layer (Cloudflare/Vercel) returns 404 or 403

No migrations should be applied remotely without explicit authorization.

---

## Do Not Modify Already-Applied Migrations

Per project rules, already-applied migrations (including `20261106000000` which introduced the permissive `clubs_select_school`) are **not edited**. They reproduce the live schema and authorization state exactly as applied. The fix is delivered through new timestamped follow-up migrations.
