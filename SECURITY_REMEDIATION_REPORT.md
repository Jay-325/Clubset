# Clubset — Security Remediation Report

**Date:** 2026-11-07  
**Scope:** Remediation of VULN-001 through VULN-004 from SECURITY_INVESTIGATION_REPORT.md  
**Environment:** Local Supabase stack (Docker, localhost:54321) — no production changes  
**Branch:** main (no commits, no pushes)

---

## Summary of Remediation

All four confirmed vulnerabilities have been investigated and remediated. The remediation
restores the intended security architecture as defined in the committed migrations, closes
a defense-in-depth gap on the administrator allowlist, prevents exposure of administrator
account metadata to students, and disables the unused `/mcp` endpoint.

No production changes were made. All changes are local-only against the Docker Supabase
stack. No commits, pushes, or deployments occurred.

---

## VULN-001 — P1 HIGH: `clubs_select_school` exposes all same-school clubs

### Original Vulnerability

The deployed `clubs_select_school` RLS policy on `public.clubs` was:

```sql
(school_id = current_school_id()) AND (jwt() ->> 'is_anonymous') IS DISTINCT FROM 'true'
```

This allowed any signed-in same-school student to see ALL clubs, including draft, pending,
and rejected clubs. Verified: a student could see `Pending Club` (status:
`awaiting_administrator_verification`) despite not being its founder, member, or administrator.

### Root Cause

Migration `20261026000100_fix_club_read_access.sql` created a restrictive `clubs_select_school`
policy using `can_discover_club()`, `is_club_member()`, `is_club_admin()`, and `founder_id =
auth.uid()`. However, migration `20261106000000_restrict_anonymous_authenticated_role.sql`
(applied later) re-created `clubs_select_school` with the permissive school-wide policy plus an
`is_anonymous` check, overriding the restrictive version. This is policy drift between the
intended implementation (20261026000100) and the deployed state.

### Remediation

New migration: `supabase/migrations/20261107000001_fix_clubs_select_school_policy.sql`

Re-created `clubs_select_school` with the restrictive policy:

```sql
create policy clubs_select_school on public.clubs
  for select
  using (
    school_id = (select public.current_school_id())
    and (
      public.can_discover_club(id)
      or founder_id = (select auth.uid())
      or public.is_club_member(id)
      or public.is_club_admin(id)
    )
  );
```

- `can_discover_club()` provides school-wide discovery of approved clubs and clubs awaiting
  student verification.
- `founder_id = auth.uid()`, `is_club_member(id)`, `is_club_admin(id)` provide access to
  restricted clubs for associated users only.

### Before/After Behavior

| Scenario | Before | After |
|----------|--------|-------|
| Student sees Pending Club (not founder/member/admin) | Visible | Blocked |
| Student sees Draft Club (founder) | Visible | Visible |
| Student sees Draft Club (not associated) | Visible | Blocked |
| Student sees approved clubs (school-wide) | Visible | Visible |

### Regression Test

As a non-member, non-founder, non-administrator student:
```sql
SELECT * FROM clubs WHERE status = 'awaiting_administrator_verification';
-- Must return zero rows
```

---

## VULN-002 — P2 MEDIUM: `admin_allowlist` retains unnecessary client privileges

### Original Vulnerability

The `public.admin_allowlist` table had table-level SELECT/INSERT/UPDATE/DELETE privileges
granted to both `anon` and `authenticated`, despite migration `20261103000000`
intending to revoke them. RLS on the table had no policies, so any table-level grant was a
direct attack surface.

### Root Cause

The `REVOKE ALL ON TABLE public.admin_allowlist FROM anon, authenticated;` from migration
`20261103000000` was either not applied to the local database or was re-granted afterward.
The local database still showed both roles with full DML privileges.

### Remediation

New migration: `supabase/migrations/20261107000002_revoke_admin_allowlist_client_grants.sql`

```sql
revoke all on table public.admin_allowlist from anon, authenticated;
```

Only `postgres` and `service_role` retain table access. All legitimate readers
(`activate_administrator`, `check_administrator_allowlist`, `handle_new_auth_user`) are
`SECURITY DEFINER` functions and are unaffected by the missing client grants.

### Before/After Behavior

| Role | Before | After |
|------|--------|-------|
| anon | SELECT/INSERT/UPDATE/DELETE granted | 42501 permission denied |
| authenticated | SELECT/INSERT/UPDATE/DELETE granted | 42501 permission denied |
| postgres | Full access | Full access (unchanged) |
| service_role | Full access | Full access (unchanged) |

### Regression Test

```sql
-- As anon or authenticated (non-admin):
SELECT * FROM admin_allowlist;
-- Must return 42501 permission denied, not 200 []
```

---

## VULN-003 — P2 MEDIUM: `profiles_select_school` exposes administrator account metadata

### Original Vulnerability

The `profiles_select_school` RLS policy allowed any signed-in same-school user to read ALL
columns of ALL profiles in their school, including `account_type` (which reveals
administrator status), `email`, and `grade`. PostgreSQL RLS is row-level only — it cannot
restrict individual columns. Students could use direct table queries to discover
administrator accounts and student email addresses.

### Root Cause

RLS controls row visibility, not column visibility. The `profiles_select_school` policy
granted school-wide read access to all columns, exposing sensitive authorization metadata
to all same-school users.

### Remediation

New migration: `supabase/migrations/20261107000003_restrict_profile_column_exposure.sql`

Three changes:

1. **Created `public.profiles_public` view** exposing only non-sensitive columns:
   `id, full_name, grade, interests, commitment_hours, avatar_url, onboarding_complete,
   created_at, updated_at`. Excludes `email`, `account_type`, `school_id`.
   Runs with `security_invoker = false` so RLS on the underlying table applies as the
   view owner (`postgres`, bypassrls), making all rows visible through the limited-column
   view.

2. **Replaced `profiles_select_school` with `profiles_select_self`**:
   ```sql
   create policy profiles_select_self on public.profiles
     for select
     using (id = (select auth.uid()));
   ```
   Users can read only their own full profile from the base table.

3. **Grant management**:
   - Revoked SELECT on `profiles` from `anon` (INSERT/UPDATE/DELETE retained, RLS restricts writes)
   - Kept SELECT on `profiles` for `authenticated` (needed for self-profile reads)
   - Granted SELECT on `profiles_public` to `authenticated`

4. **Added `is_user_administrator(target_user_id uuid)` function**: returns boolean only,
   allowing the application to check administrator status without exposing `account_type`.

### Before/After Behavior

| Scenario | Before | After |
|----------|--------|-------|
| Student reads other user's `account_type` via profiles table | Visible | Blocked (row-level: self only) |
| Student reads own `account_type` via profiles table | Visible | Visible |
| Student reads others' `email` via profiles table | Visible | Blocked |
| Student reads limited info via `profiles_public` view | N/A | Limited columns only (no account_type/email/school_id) |
| Anonymous reads profiles table | Empty result (RLS) | 42501 permission denied (no grant) |
| Anonymous reads profiles_public view | Empty result (RLS) | 42501 permission denied (no grant) |

### Regression Test

```sql
-- As a student:
SELECT email, account_type FROM profiles WHERE id <> auth.uid();
-- Must return zero rows (blocked by profiles_select_self)

SELECT * FROM profiles_public;
-- Returns limited columns only; account_type column does not exist
```

---

## VULN-004 — P3 LOW: `/mcp` endpoint reachable without hosting-layer block

### Original Vulnerability

The `/mcp` endpoint (`src/routes/mcp.ts`) was reachable without a hosting-layer block,
accepting POST requests. The `/.well-known/oauth-protected-resource` endpoint was also
reachable. This is an additional attack surface with flagged transitive dependencies
(`@modelcontextprotocol/sdk@1.28.0`, `@modelcontextprotocol/server@2.0.0`).

### Root Cause

The `/mcp` route and OAuth protected resource route were implemented with
`createTanStackMcpHandler` and `createTanStackOAuthProtectedResourceMetadataHandler`
from `@lovable.dev/mcp-js`, making them reachable in all environments.

### Remediation

Replaced both route handlers to return HTTP 404:

- `src/routes/mcp.ts` — returns `new Response(null, { status: 404 })` for ALL methods
- `src/routes/[.well-known]/oauth-protected-resource.ts` — returns `new Response(null, { status: 404 })` for ALL methods

The packages remain installed (no unsupported dependency overrides). The endpoint can be
re-enabled later if needed by restoring the handler implementation.

### Before/After Behavior

| Endpoint | Before | After |
|----------|--------|-------|
| GET /mcp | 405 Method Not Allowed | 404 Not Found |
| POST /mcp | MCP handler active | 404 Not Found |
| GET /.well-known/oauth-protected-resource | 404 (no route matched) | 404 Not Found |

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/20261107000001_fix_clubs_select_school_policy.sql` | New — restrictive clubs_select_school RLS policy |
| `supabase/migrations/20261107000002_revoke_admin_allowlist_client_grants.sql` | New — revoke admin_allowlist client grants |
| `supabase/migrations/20261107000003_restrict_profile_column_exposure.sql` | New — profiles_public view, profiles_select_self policy, is_user_administrator() |
| `src/routes/mcp.ts` | Edited — returns 404 for all methods |
| `src/routes/[.well-known]/oauth-protected-resource.ts` | Edited — returns 404 for all methods |
| `src/lib/hooks/use-club.ts` | Edited — uses `is_user_administrator()` RPC instead of `profiles.account_type` |
| `src/integrations/supabase/types.ts` | Edited — added `is_user_administrator` to Functions type |
| `src/lib/types/database.ts` | Edited — added `is_user_administrator` to Functions type |

---

## Project Validation

| Check | Result |
|-------|--------|
| `npm run typecheck` | ✅ Pass |
| `npm run test` | ✅ 58/58 passed |
| `npm run build` | ✅ Pass |
| `npm run check:sql` | ✅ All 46 SQL files parse cleanly (including 3 new migrations) |
| `npm run lint` | ✅ Only pre-existing errors (no new errors from changes) |

---

## Remaining Risks

1. **Remote environment not directly verifiable:** The remote anon key from `.env` returns
   "Invalid API key", preventing direct verification of remote RLS policies and table
   privileges. The remote should be manually verified after deployment.

2. **Migration `20261106000000` re-created `clubs_select_school` with permissive policy:**
   This migration (applied after `20261026000100`) introduced the drift that caused
   VULN-001. The fix migration `20261107000001` corrects it, but the root cause is a
   later migration overriding an earlier security fix.

3. **Pre-existing issue:** `profiles_update_self_safe` UPDATE policy has infinite recursion
   (its WITH CHECK subqueries the profiles table itself). Not caused by this remediation.

4. **`/mcp` blocking is at application level:** The hosting layer (Cloudflare/Vercel) does
   not yet have a deny rule for `/mcp`. Application-level 404 is sufficient for now but a
   hosting-layer block is recommended as defense in depth.

---

## Confirmation of No Modifications

- No production database connections used
- No production service-role credentials used
- No production Supabase settings changed
- No production administrator allowlist entries modified (`arinjaypal@gmail.com`,
  `ray.d.villaflor@gmail.com` remain intact)
- No commits, pushes, or deployments occurred
- No branches or worktrees created
- All changes are local-only against the Docker Supabase stack
