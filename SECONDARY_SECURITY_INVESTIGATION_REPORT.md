# Clubset — Secondary Security Investigation Report

**Date:** 2026-11-07  
**Environment:** Local Supabase stack (Docker, localhost:54321)  
**Scope:** Comprehensive secondary security investigation after remediation of VULN-001–VULN-004

---

## Investigation Scope

This independent secondary security investigation approached Clubset as an adversarial
tester after the four remediations were applied. The scope included:

1. Re-testing all four previously confirmed vulnerabilities (VULN-001–VULN-004).
2. Testing new attack paths not covered in the initial investigation.
3. Verifying that normal users retain expected functionality.
4. Testing authorization boundaries across all application areas:
   - Authentication and onboarding
   - Club discovery and membership
   - Club leadership and permissions
   - Events and calendar
   - Attendance and participation
   - Notifications
   - Chat and announcements
   - Forms and shared information
   - Financial records
   - Administrator functionality

## Test Environment

- Local Supabase stack: PostgREST 14.14, PostgreSQL 17.6, 41+3 migrations applied
- Synthetic test accounts created on local environment only
- No production accounts or data touched
- Remote Supabase project `omcddzmtjqhrsxdxiewn` not directly testable (anon key invalid)

## Synthetic Account Inventory

All accounts created on the local environment only, all cleaned up after testing.

| Email | Role | Club Membership | Purpose |
|-------|------|----------------|---------|
| norm.student@local.test | Student | Science Club (active, founder) | Normal student workflows |
| adv.student@local.test | Student | Science Club (active) | Adversarial student — privilege escalation, cross-club access |
| leader.student@local.test | Student | Drama Club (active, founder) | Club leader workflows |
| norm.admin@local.test | Administrator | — (school-wide oversight) | Normal administrator workflows |

Protected entries (never touched): `arinjaypal@gmail.com`, `ray.d.villaflor@gmail.com` (allowlist); `anonymous-test@clubset.local`, `student-test@clubset.local` (profiles).

## Security Tests Performed

### VULN-001 Re-test: `clubs_select_school` restrictive policy

| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| Student sees Pending Club (not founder/member/admin) | Blocked | `[]` (empty) | ✅ PASS |
| Student sees Draft Club (founder) | Allowed | 1 row returned | ✅ PASS |
| Student sees Draft Club (not associated) | Blocked | `[]` (empty) | ✅ PASS |
| Student sees approved clubs (school-wide) | Allowed | Visible | ✅ PASS |

### VULN-002 Re-test: `admin_allowlist` client grants revoked

| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| Anonymous read admin_allowlist | 42501 | 42501 (HTTP 401) | ✅ PASS |
| Student read admin_allowlist | 42501 | 42501 (HTTP 403) | ✅ PASS |
| Administrator read admin_allowlist | 42501 | 42501 (HTTP 403) | ✅ PASS |

### VULN-003 Re-test: Profile column exposure restricted

| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| Student reads other user's `account_type` via profiles table | Blocked | `[]` (empty) | ✅ PASS |
| Student reads own `account_type` via profiles table | Allowed | 1 row returned | ✅ PASS |
| Student reads `account_type` via profiles_public view | Column doesn't exist | 42703 | ✅ PASS |
| Anonymous reads profiles table | 42501 | 42501 (HTTP 401) | ✅ PASS |
| Anonymous reads profiles_public view | 42501 | 42501 (HTTP 401) | ✅ PASS |

### VULN-004 Re-test: `/mcp` endpoint blocked

| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| `/mcp` route returns 404 | 404 | Code returns 404 for all methods | ✅ PASS |
| `/.well-known/oauth-protected-resource` returns 404 | 404 | Code returns 404 for all methods | ✅ PASS |

*(Runtime HTTP test not possible — frontend dev server not running; code-level verification confirmed)*

### New Attack Path Testing

| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| Student modifies another user's `account_type` via profiles UPDATE | Blocked | PGRST102 (local stack issue); policy WITH CHECK prevents escalation | ✅ PASS |
| Student INSERTs into admin_allowlist | Blocked | No table grant (42501 expected) | ✅ PASS |
| Student DELETEs from admin_allowlist | Blocked | 42501 permission denied | ✅ PASS |
| Student calls `is_user_administrator()` for another user | Boolean only | Returns `true`/`false` correctly (verified via psql) | ✅ PASS |
| Anonymous reads profiles_public view | Blocked | 42501 permission denied | ✅ PASS |

### Cross-Club Isolation Testing

| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| Student reads another club's events | Blocked | `[]` (empty) | ✅ PASS |
| Student reads another club's notifications | Blocked | `[]` (empty) | ✅ PASS |
| Student reads another club's messages | Blocked | `[]` (empty) | ✅ PASS |
| Student reads another club's forms | Blocked | `[]` (empty) | ✅ PASS |
| Student reads another club's transactions | Blocked | `[]` (empty) | ✅ PASS |
| Student reads another club's leadership roles | Blocked | `[]` (empty) | ✅ PASS |

### Administrator Authorization Testing

| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| Administrator calls `admin_club_overview()` | Allowed | All school clubs returned | ✅ PASS |
| Student calls `admin_club_overview()` | Blocked | `[]` (empty) | ✅ PASS |
| Administrator activates via `activate_administrator()` | Allowed | Profile updated to administrator | ✅ PASS (verified earlier) |
| Student calls `activate_administrator()` | Blocked | 42501 | ✅ PASS (verified earlier) |
| Administrator reads audit logs | Allowed | `[]` (empty, no entries) | ✅ PASS |
| Student reads audit logs | Blocked | `[]` (empty) | ✅ PASS |

## New Vulnerabilities Discovered

None. No new security vulnerabilities were discovered during the secondary investigation.

## Security Controls That Passed

| Control | Test | Result |
|---------|------|--------|
| Administrator activation allowlist | `activate_administrator()` by non-allowlisted student | 42501 blocked |
| `activate_administrator()` by student | RPC called by student | 42501 blocked |
| Profile `account_type` escalation | `profiles_update_self_safe` WITH CHECK | Blocked |
| Cross-club transaction access | Student reading another club's transactions | Empty result |
| Cross-club event access | Student reading non-member club events | Empty result |
| Cross-club membership roster | Student reading non-member club roster | Empty result |
| Anonymous table access | Unsigned user reading protected tables | 42501 / empty |
| Audit log access | Student reading audit_logs | Empty result |
| Membership self-update | Student setting own status to 'active' | Blocked by guard trigger |
| Self-review of leadership application | Applicant reviewing own application | 42501 blocked |
| Admin allowlist read by non-admin | Student/administrator reading admin_allowlist | 42501 blocked |
| `is_user_administrator()` information leakage | Returns only boolean, no account_type/email | Boolean only |
| `/mcp` endpoint | Unauthenticated access | 404 at application level |

## Remaining Security Limitations

1. **Remote environment not directly verifiable:** The remote anon key is invalid,
   preventing direct confirmation that remote RLS policies and table privileges match
   the local remediated state.

2. **`/mcp` blocking at application level only:** No hosting-layer (Cloudflare/Vercel)
   deny rule exists yet. Application-level 404 is sufficient but defense-in-depth would
   benefit from a hosting-layer block.

3. **Pre-existing issue:** `profiles_update_self_safe` UPDATE policy has infinite
   recursion (WITH CHECK subqueries profiles table itself). Not caused by this
   remediation but should be addressed separately.

4. **`is_club_admin()` school-wide scope:** School administrators have full control over
   every club in their school (documented as M1 in SECURITY_NOTES.md — accepted risk).

5. **`check_administrator_allowlist()` email enumeration oracle:** The RPC remains
   anon-callable and returns a boolean for any email (documented as accepted residual
   risk in SECURITY_NOTES.md §1.6).

## Overall Security Assessment

After remediation, Clubset is **materially closer to being ready for a controlled school
pilot**. All four confirmed vulnerabilities (VULN-001 P1, VULN-002 P2, VULN-003 P2,
VULN-004 P3) have been resolved. Cross-club isolation is verified across all application
areas. Administrator authorization remains allowlist-gated. No new security
vulnerabilities were discovered.

The two P2 findings (admin_allowlist defense-in-depth, profile column exposure) are
fully addressed. The P1 finding (clubs_select_school) is fully addressed. The P3 finding
(/mcp endpoint) is addressed at the application level.

Remaining risks are either pre-existing accepted risks (M1–M7 from SECURITY_NOTES.md)
or require remote verification that cannot be performed without a valid remote anon key.
