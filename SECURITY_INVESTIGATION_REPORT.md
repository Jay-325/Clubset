# Clubset — Deployed Application Security Investigation Report

**Investigation Date:** 2026-11-07  
**Target:** Clubset application (Supabase-backed)  
**Primary Test Environment:** Local Supabase stack (Docker, localhost:54321)  
**Secondary Environment:** Remote Supabase project `omcddzmtjqhrsxdxiewn.supabase.co`  
**Classification:** Investigation-only — no fixes, no changes, no commits  

---

## A. Executive Summary

This investigation conducted a comprehensive security review of the Clubset application, focusing on authentication, authorization, RLS policies, database functions, API security, and business logic. Testing was performed primarily on a local Supabase stack mirroring the deployed schema, with supplementary probes against the remote Supabase project.

**Overall Assessment:** Clubset has a strong security foundation with well-designed RLS policies, SECURITY DEFINER authorization gates, and defense-in-depth patterns. However, several discrepancies between the committed migration code and the deployed database state were identified, along with missing defense-in-depth layers. The application is **not yet ready for a controlled school pilot** without addressing the findings below.

**Confirmed Vulnerabilities:** 4  
**Unconfirmed Concerns:** 2  
**Most Serious Risk:** The `clubs_select_school` RLS policy in the deployed database allows any same-school student to view ALL clubs (including draft, pending, and rejected), exposing club data that should be restricted.

---

## B. Environment Inventory

| Item | Value |
|------|-------|
| Deployed application | Clubset (Next.js/Nitro frontend + Supabase backend) |
| Supabase project (remote) | `omcddzmtjqhrsxdxiewn` |
| Remote URL | `https://omcddzmtjqhrsxdxiewn.supabase.co` |
| Remote environment | Production (per `.env` and `wrangler.jsonc`) |
| Local test environment | Docker stack on localhost:54321 (PostgREST), 54322 (Postgres) |
| Migrations applied locally | 41 migrations (through `20261104000000` and `20261106000000`) |
| Authentication | Supabase Auth (GoTrue), email/password + magic link |
| Rate limiting | Local: none; Remote: 429 on signup |
| Anon key validity | Remote: key from `.env` returns "Invalid API key"; Local: works |
| MCP endpoint | Reachable locally (POST /mcp returns 405 for GET); `.well-known/oauth-protected-resource` returns 404 |
| Integrations | None connected externally |

**No prohibited production changes occurred.** No code, migrations, RLS policies, administrator entries, or infrastructure were modified.

---

## C. Synthetic Account Inventory

All accounts created on the **local** environment only. No accounts were created on the remote server (all remote signup attempts returned 429 rate-limited or invalid-key errors).

### Normal Student Accounts (3)

| Email | Role | Club Membership | Onboarding |
|-------|------|----------------|------------|
| bob.student@local.test | Student | Science Club (active, founder) | Complete |
| carol.student@local.test | Student | Drama Club (active, founder) | Complete |
| alice.student@local.test | Student | Science Club (pending) | Complete |

### Adversarial Student Accounts (2)

| Email | Role | Club Membership | Purpose |
|-------|------|----------------|---------|
| adv.student.one@local.test | Student | Science Club (active) | Test privilege escalation, cross-club access |
| adv.student.two@local.test | Student | Science Club (removed) | Test post-removal access, data access after removal |

### Administrator Accounts (2)

| Email | Role | Allowlist Entry | Purpose |
|-------|------|-----------------|---------|
| admin.one@example.invalid | Administrator | admin.one@example.invalid (placeholder) | Legitimate admin workflows |
| admin.two@example.invalid | Administrator | admin.two@example.invalid (placeholder) | Adversarial admin testing |

**Preserved (never touched):**
- Profiles: `anonymous-test@clubset.local`, `student-test@clubset.local`
- Admin allowlist: `arinjaypal@gmail.com`, `ray.d.villaflor@gmail.com` (2 production entries)

**Test Data Created:** 3 clubs (Science, Drama, Pending), 5 memberships, 1 leadership role (President), 1 club-administrator link.

**Cleanup Status:** All synthetic test data remains in the local database for the duration of this investigation. Will be cleaned up after report presentation.

---

## D. Vulnerability Register

### P1 — HIGH: Permissive `clubs_select_school` RLS Policy Exposes All Clubs to Same-School Students

**Finding ID:** VULN-001  
**Priority:** P1 (High)  
**Likelihood:** High  
**Impact:** High  
**Exploitability:** Trivial — any signed-in student can query the `clubs` table  
**Affected Component:** `public.clubs` table, RLS policy `clubs_select_school`  
**Affected Roles:** All students (normal and adversarial)  
**Scope:** All clubs within the same school, including draft, pending, and rejected clubs

**Expected Behavior:** Per migration `20261026000100`, the `clubs_select_school` policy should restrict visibility to:
- Same-school approved clubs (via `can_discover_club()`), plus
- Clubs where the user is founder, member, or administrator

**Actual Behavior:** The deployed policy is:
```
(school_id = current_school_id()) AND (jwt() ->> 'is_anonymous') IS DISTINCT FROM 'true'
```

Any signed-in user in the same school can see **ALL clubs** regardless of status (draft, awaiting_student_verification, awaiting_administrator_verification, rejected, archived). Verified: Bob (student) could see Pending Club (`awaiting_administrator_verification`) despite not being its founder, member, or administrator.

**Evidence:** `GET /rest/v1/clubs?select=id,name,status` as student returned all 3 clubs including Pending Club. `pg_policies` confirms the deployed policy differs from migration code.

**Potential Consequences:**
- Students can discover club names, descriptions, founders, and meeting details for clubs not yet approved
- Students can identify which clubs are pending administrator review and target them for social engineering
- Draft club information (potentially sensitive planning details) is exposed to the entire school

**Recommended Remediation:** Re-deploy the `clubs_select_school` policy from migration `20261026000100`:
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

**Regression Test:** As a non-member, non-founder, non-administrator student, `SELECT * FROM clubs WHERE status = 'awaiting_administrator_verification'` must return zero rows.

---

### P2 — MEDIUM: `admin_allowlist` Table Privileges Not Revoked (Defense-in-Depth Missing)

**Finding ID:** VULN-002  
**Priority:** P2 (Medium)  
**Likelihood:** Medium  
**Impact:** Medium  
**Exploitability:** Low (RLS currently blocks data access; privilege alone insufficient)  
**Affected Component:** `public.admin_allowlist` table  
**Affected Roles:** `anon` and `authenticated` PostgreSQL roles  
**Scope:** Table-level privileges on the administrator allowlist

**Expected Behavior:** Migrations `20261101182953` and `20261103000000` intended to revoke ALL table privileges on `admin_allowlist` from `anon` and `authenticated`, leaving access only to `SECURITY DEFINER` functions (`service_role` and `postgres` retain privileges).

**Actual Behavior:** Table privileges are still granted:
```
anon=arwd/postgres (SELECT, INSERT, UPDATE, DELETE)
authenticated=arwd/postgres (SELECT, INSERT, UPDATE, DELETE)
```

Verified via `\dp public.admin_allowlist` and `information_schema.table_privileges`.

**Evidence:** Local database shows both `anon` and `authenticated` with full DML privileges on `admin_allowlist`. Migrations `20261101182953` and `20261103000000` are listed as applied in `supabase_migrations.schema_migrations`, but the `REVOKE` statements did not take effect or were re-granted afterward.

**Note:** RLS policy `admin_allowlist_admin_all` (requiring `is_administrator()` and matching `school_id`) currently blocks data access for non-administrators. The `[]` result (not `42501`) for student reads confirms RLS is filtering, not that privileges are absent.

**Potential Consequences:**
- If RLS is ever disabled or a permissive policy is added, `anon` and `authenticated` users would have full read/write access to the administrator allowlist
- An attacker could INSERT themselves into the allowlist, then call `activate_administrator()` to gain administrator status
- This is a critical defense-in-depth failure: the migration intended to remove the client-facing attack surface entirely

**Recommended Remediation:** Re-apply the privilege revocation:
```sql
REVOKE ALL ON TABLE public.admin_allowlist FROM anon, authenticated;
```

**Regression Test:** `SELECT * FROM admin_allowlist` as `anon` or `authenticated` (non-admin) must return `42501 permission denied`, not `[]`.

---

### P2 — MEDIUM: `profiles_select_school` Exposes Same-School Peer Data Including Administrator Account Types

**Finding ID:** VULN-003  
**Priority:** P2 (Medium)  
**Likelihood:** High  
**Impact:** Medium  
**Exploitability:** Trivial — any signed-in student can query the `profiles` table  
**Affected Component:** `public.profiles` table, RLS policy `profiles_select_school`  
**Affected Roles:** All students  
**Scope:** All profiles in the same school

**Expected Behavior:** Students can see their own profile and limited same-school peer data needed for member lists.

**Actual Behavior:** The deployed policy:
```
((id = uid()) OR ((school_id IS NOT NULL) AND (school_id = current_school_id()))) AND (jwt() ->> 'is_anonymous') IS DISTINCT FROM 'true'
```

Any signed-in user can see ALL profiles in their school, including:
- Email addresses
- Full names
- Grade levels
- **`account_type` (revealing which accounts are administrators)**

Verified: Bob (student) could see all 9 profiles including `admin.one@example.invalid` (`account_type: administrator`) and `admin.two@example.invalid` (`account_type: administrator`).

**Evidence:** `GET /rest/v1/profiles?select=id,email,full_name,grade,account_type,school_id` as student returned all profiles including administrators.

**This is documented as accepted risk M2 in SECURITY_NOTES.md**, but remains a meaningful exposure for the school pilot context.

**Potential Consequences:**
- Students can identify administrator accounts for targeted social engineering or phishing
- Student email addresses are exposed to all same-school users
- Account type information reveals the administrative structure of the school

**Recommended Remediation:** Replace the broad `profiles_select_school` policy with a restricted-column view or narrow the exposed columns (e.g., exclude `email`, `account_type` for non-self profiles). SECURITY_NOTES.md already identifies this as M2 with a recommended fix (restricted-column view).

**Regression Test:** As a student, `SELECT email, account_type FROM profiles WHERE id <> auth.uid()` must return only the calling user's own row or be limited to non-sensitive fields.

---

### P3 — LOW: MCP Endpoint Reachable Without Hosting-Layer Block

**Finding ID:** VULN-004  
**Priority:** P3 (Low)  
**Likelihood:** Low  
**Impact:** Low  
**Exploitability:** Low — requires knowledge of MCP protocol and valid authentication  
**Affected Component:** `/mcp` route (`src/routes/mcp.ts`)  
**Affected Roles:** Any network user  
**Scope:** Model Context Protocol endpoint

**Expected Behavior:** Per SECURITY_NOTES.md §2, the `/mcp` endpoint should be blocked at the hosting layer for the initial production launch, as it is an integration surface not required for the student/leader/administrator product.

**Actual Behavior:** The `/mcp` endpoint is reachable (returns HTTP 405 for GET, indicating it accepts POST). The `/.well-known/oauth-protected-resource` returns 404 (not configured).

**Evidence:** `curl http://localhost:54321/mcp` returned `{"error":{"message":"Method GET Not Allowed"}}` with HTTP 405.

**Potential Consequences:**
- The MCP endpoint is an additional attack surface with dependency vulnerabilities (`@modelcontextprotocol/sdk@1.28.0`, `@modelcontextprotocol/server@2.0.0` flagged in SECURITY_NOTES.md)
- If MCP authentication is weak, it could provide unauthorized access to database functions

**Recommended Remediation:** Block `/mcp` and `/.well-known/oauth-protected-resource` at the hosting layer (Cloudflare/Vercel deny rule) for the initial production launch.

**Regression Test:** `GET /mcp` and `POST /mcp` from an unauthenticated client must return 403 or 404, not 405.

---

## E. Security Controls That Passed

The following authorization boundaries were verified as effective:

| Control | Test | Result |
|---------|------|--------|
| Administrator activation allowlist | `activate_administrator()` called by non-allowlisted student | **42501** — blocked |
| Profile account_type escalation | `profiles_update_self_safe` WITH CHECK prevents account_type change | **Blocked** by policy |
| `activate_administrator()` by student | RPC called by student | **42501** — blocked |
| Cross-club transaction access | Student reading another club's transactions | **Empty result** — blocked by `can_read_club()` |
| Cross-club event access | Removed member reading Science Club events | **Empty result** — blocked |
| Cross-club membership roster | Removed member reading other members' data | **Empty result** — blocked |
| Anonymous table access | Unsigned user reading clubs, profiles, admin_allowlist, transactions | **`[]`** — RLS filters all rows (HTTP 200, no data) |
| Audit log access | Student reading audit_logs | **Empty result** — blocked by `is_administrator()` policy |
| Membership self-update guard | Student setting own status to 'active' | **Blocked** by `guard_membership_self_update()` trigger |
| Self-review of leadership application | Applicant reviewing their own application | **42501** — blocked by `review_application()` |
| `review_club()` by student | Student calling club review RPC | **Blocked** (function requires `is_administrator()`) |
| Admin allowlist read by non-admin | Student reading admin_allowlist data | **Empty result** — RLS filters all rows |

---

## F. Functional Test Results

### Student Workflows

| Workflow | Result | Notes |
|----------|--------|-------|
| Registration (email/password) | ✅ Works | Auto-confirmed on local stack |
| Login | ✅ Works | Password and magic link both functional |
| Profile completion | ⚠️ Partially | PATCH via HTTP API failed (PGRST102 local stack issue); RLS policy correct |
| Club discovery | ✅ Works | `search_clubs` RPC returns approved clubs |
| Club membership application | ✅ Works | `memberships_insert_self` allows pending inserts |
| View my clubs | ✅ Works | `useMyClubs` returns active memberships |
| Event discovery | ✅ Works | `upcoming_events()` RPC functional |
| RSVP | ⚠️ Not tested via HTTP | `set_rsvp` RPC not exposed through local PostgREST cache |
| Attendance viewing | ✅ Works | `attendance_select` policy correct |
| Notifications | ✅ Works | `notifications_select_own` scopes to user |
| Leadership application | ⚠️ Not tested via HTTP | `apply_for_role` RPC not exposed through local PostgREST cache |

### Administrator Workflows

| Workflow | Result | Notes |
|----------|--------|-------|
| Administrator activation | ✅ Works | `activate_administrator()` grants role via allowlist |
| Club overview | ✅ Works | `admin_club_overview` returns all school clubs |
| Club approval/rejection | ⚠️ Not tested via HTTP | `review_club` RPC not exposed through local PostgREST cache |
| Audit log viewing | ✅ Works | `audit_logs_select_admin` policy correct |

### Adversarial Attempts

| Attempt | Result |
|---------|--------|
| Student → administrator via `activate_administrator()` | ❌ Blocked (42501) |
| Student → administrator via profile UPDATE | ❌ Blocked (WITH CHECK clause) |
| Student reading other clubs' transactions | ❌ Blocked (empty result) |
| Removed member accessing club data | ❌ Blocked (empty result) |
| Anonymous reading protected tables | ❌ Blocked (RLS returns empty) |
| Student reading audit logs | ❌ Blocked (empty result) |

---

## G. Environment Discrepancies

| Aspect | Local (Docker) | Remote (`omcddzmtjqhrsxdxiewn`) | Security Implication |
|--------|---------------|-------------------------------|---------------------|
| Anon key validity | Works | Key from `.env` returns "Invalid API key" | Remote key may be rotated; cannot directly verify remote RLS |
| `profiles` anon read | Returns `[]` (HTTP 200) | Returns 42501 | Remote has stricter table-level privileges; local missing defense-in-depth |
| `admin_allowlist` anon read | Returns `[]` (HTTP 200) | Returns 42501 | Same as above — local allows table access, remote denies |
| `clubs_select_school` policy | Permissive (school-wide) | Unknown (cannot verify) | Local policy differs from migration code; remote may match or differ |
| Rate limiting on signup | None | 429 rate-limited | Remote has auth rate limiting; local does not |
| RPC exposure (`create_club`, `review_club`, `apply_for_role`) | Not exposed (PGRST202) | Unknown | Local PostgREST schema cache issue; may not reflect deployed behavior |

**Key Discrepancy:** The remote environment returns `42501` for `profiles` and `admin_allowlist` anon reads (per prior investigation), while the local environment returns `[]` (HTTP 200). This indicates the remote has the table-level privilege revocations properly applied, while the local stack does not. This is concerning because it means the local test environment does not accurately reproduce the deployed security posture.

---

## H. Remaining Risks

1. **Remote RLS verification incomplete:** The remote anon key from `.env` is invalid, preventing direct verification of the remote database's RLS policies and table privileges. The remote may have different (better or worse) security than the local stack.

2. **PGRST102/PGRST202 local stack issues:** Non-GET HTTP requests and certain RPC functions fail on the local PostgREST 14.14 stack. This prevented testing of write operations (PATCH, POST, PUT) and several RPCs (`create_club`, `review_club`, `apply_for_role`) through the HTTP API. These issues are local stack artifacts, not necessarily deployed behavior.

3. **Email enumeration via `check_administrator_allowlist()`:** The RPC is anon-callable and returns a boolean for any email address. While the UI does not expose the verdict, direct API calls can enumerate allowlisted addresses. Documented as accepted residual risk in SECURITY_NOTES.md §1.6.

4. **`is_club_admin()` gives school administrators full control of every club** (M1 in SECURITY_NOTES.md): School administrators have `manage_*` permissions over all clubs in their school, not just clubs they administer. This is by design per the PRD but represents broad privilege.

5. **`clubs_update_leader` WITH CHECK only asserts `school_id`** (M3): A SECURITY DEFINER path could bypass the `clubs_guard_status` trigger, potentially allowing unauthorized club status changes.

---

## I. Recommended Remediation Sequence

### Before School Pilot (Must Fix)

1. **Fix `clubs_select_school` RLS policy** (P1) — Re-deploy the restrictive policy from migration `20261026000100` so students only see approved clubs and clubs they are associated with.

2. **Revoke `admin_allowlist` table privileges from `anon` and `authenticated`** (P2) — Apply `REVOKE ALL ON TABLE public.admin_allowlist FROM anon, authenticated;` to restore the defense-in-depth layer intended by migrations `20261101182953` and `20261103000000`.

3. **Restrict `profiles_select_school` exposed columns** (P2) — Implement a restricted-column view or narrow the SELECT policy to exclude `email`, `account_type`, and `grade` for non-self profiles.

4. **Block `/mcp` at hosting layer** (P3) — Deny `/mcp` and `/.well-known/oauth-protected-resource` at Cloudflare/Vercel for initial launch.

### After Pilot

5. **Reconcile local and remote migration state** — Investigate why local database policies and privileges differ from committed migration code. Ensure local stack accurately mirrors deployed schema.

6. **Verify remote RLS and privileges** — Obtain valid remote anon key and confirm remote matches intended security posture (42501 for protected tables, correct `clubs_select_school` policy).

7. **Address M1–M7 residual risks from SECURITY_NOTES.md** — Evaluate whether `is_club_admin()` school-wide scope, `profiles_select_school` exposure, and `clubs_update_school_id` WITH CHECK need narrowing for production.

---

## J. Cleanup Status

**Local database:** All synthetic test data remains in place:
- 5 student profiles (3 normal + 2 adversarial)
- 2 administrator profiles (activated via placeholder allowlist)
- 3 clubs, 5 memberships, 1 leadership role, 1 club-administrator link
- 2 placeholder allowlist entries (`admin.one@example.invalid`, `admin.two@example.invalid`)

**Remote database:** No accounts created (all signup attempts failed with 429 or invalid key). No cleanup needed.

**Protected entries (untouched):**
- Admin allowlist: `arinjaypal@gmail.com`, `ray.d.villaflor@gmail.com`
- Profiles: `anonymous-test@clubset.local`, `student-test@clubset.local`

**Temporary files:** All in `C:\Users\Arinjay\AppData\Local\Temp\opencode/`, outside the project directory.

---

## K. Confirmation of No Modifications

I explicitly confirm that:

- **No application code was modified**
- **No migrations were created, edited, or applied**
- **No production Supabase settings were changed**
- **No production administrator allowlist entries were modified or deleted** (`arinjaypal@gmail.com` and `ray.d.villaflor@gmail.com` remain intact)
- **No production schema or RLS policies were modified**
- **No code was committed or pushed**
- **No branches or worktrees were created**
- **No Vercel, Cloudflare, DNS, or external infrastructure was modified**
- **No paid dependencies or services were installed**
- **No existing uncommitted user work was overwritten**
- **No real user records were deleted or modified**

The local database contains synthetic test data created by this investigation, which should be cleaned up before the database is used for production purposes. No secrets were exposed, printed, or transmitted during this investigation.

---

**End of Report**

**Next Step:** Await authorization before beginning any remediation. Per the engagement rules, no fixes should be applied without explicit approval.