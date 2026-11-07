# CODEMAP

_Generated: 2026-11-07T00:00:00Z_

## Tree

```
clubset/
├── .agents/
│   ├── handoff/
│   │   └── *.md (session handoff notes)
│   └── skills/
│       ├── supabase/
│       └── supabase-postgres-best-practices/
├── .claude/.gitignore
├── .env.example
├── .gitignore
├── .lovable/
│   ├── mcp/manifest.json
│   ├── north-star/north-star.md
│   ├── plan.md
│   ├── plan/turn-on-leaked-password-protection-2026-11-06.md
│   └── project.json
├── .prettierignore
├── .prettierrc
├── AGENTS.md                          # project rules (performance, security, RLS grants)
├── APPLICATION_REGRESSION_REPORT.md   # NEW — post-remediation regression results
├── CODEMAP.md
├── components.json
├── eslint.config.js
├── MIGRATION_RECONCILIATION_REPORT.md # NEW — migration state vs remote
├── otter-preview.html
├── package.json
├── package-lock.json
├── public/
│   ├── assets/otter-hover.webp
│   ├── assets/otter-idle.webp
│   ├── favicon.ico
│   └── robots.txt
├── README.md
├── scripts/
│   ├── check-sql.ts
│   ├── sql-error.ts
│   └── verify-admin-auth.sql
├── SECURITY_INVESTIGATION_REPORT.md   # original investigation
├── SECURITY_NOTES.md                  # threat model, accepted risks M1–M7
├── SECURITY_REMEDIATION_REPORT.md     # NEW — VULN-001..004 remediation detail
├── SECONDARY_SECURITY_INVESTIGATION_REPORT.md  # NEW — adversarial re-test results
├── src/
│   ├── components/
│   │   ├── app-shell.tsx        # RequireAuth, AppShell, PageHeader
│   │   ├── otter/OtterBuddy.tsx
│   │   └── ui/                  # 46 shadcn/ui primitives
│   ├── hooks/
│   │   └── use-mobile.tsx       # useIsMobile
│   ├── integrations/
│   │   └── supabase/
│   │       ├── auth-attacher.ts     # attachSupabaseAuth (client middleware)
│   │       ├── auth-middleware.ts   # requireSupabaseAuth (server middleware)
│   │       ├── client.server.ts     # supabaseAdmin — service-role proxy
│   │       ├── client.ts            # supabase — anon proxy
│   │       ├── cron-auth.ts         # authenticateCronRequest
│   │       ├── previewAuthStorage.ts
│   │       └── types.ts             # Supabase-generated Database types (+ is_user_administrator)
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── context.tsx        # AuthProvider, useAuth, useIsSignedOut
│   │   │   └── permissions.ts     # ClubContext, can, isLeader, isActiveMember, managementSections, quickActions
│   │   ├── domain.ts              # club/event/attendance constants + TABLE_TEMPLATES + ALL_PERMISSIONS
│   │   ├── error-capture.ts
│   │   ├── error-page.ts          # renderErrorPage
│   │   ├── hooks/
│   │   │   ├── use-club.ts            # useClubContext — uses is_user_administrator() RPC
│   │   │   └── use-debounced-value.ts # useDebouncedValue (300 ms)
│   │   ├── lovable-error-reporting.ts
│   │   ├── mcp/                   # MCP implementation still present (route returns 404)
│   │   │   ├── index.ts
│   │   │   ├── supabase.ts          # supabaseForUser, textResult, errorResult
│   │   │   └── tools/
│   │   │       ├── list-announcements.ts
│   │   │       ├── list-my-clubs.ts
│   │   │       └── list-upcoming-events.ts
│   │   ├── queries.ts             # TanStack Query hooks (auth, clubs, memberships, events, attendance, notifications, admin)
│   │   ├── security/
│   │   │   ├── passwords.ts                 # assertPasswordNotBreached
│   │   │   ├── passwords.test.ts
│   │   │   ├── pwned-passwords.functions.ts # checkPasswordNotBreached server fn
│   │   │   ├── pwned-passwords.server.ts    # HIBP SHA-1 + range check
│   │   │   ├── pwned-passwords.test.ts
│   │   │   └── auth-rate-limit.functions.ts # enforceAuthRateLimit server fn
│   │   ├── supabase/
│   │   │   ├── client.ts            # isSupabaseConfigured, getSupabaseClient
│   │   │   └── public-config.ts     # FALLBACK_SUPABASE_URL, FALLBACK_SUPABASE_PUBLISHABLE_KEY
│   │   ├── types/
│   │   │   ├── database.ts   # Json, AccountType, ClubRow, ProfileRow, Database (+ is_user_administrator)
│   │   │   └── domain.ts     # merged into src/lib/domain.ts
│   │   └── utils.ts             # cn(...inputs)
│   ├── router.tsx
│   ├── routeTree.gen.ts
│   ├── server.ts
│   ├── start.ts
│   ├── styles.css
│   ├── routes/
│   │   ├── [.]lovable.oauth.consent.tsx
│   │   ├── [.well-known]/oauth-protected-resource.ts   # returns 404 (was MCP discovery)
│   │   ├── __root.tsx        # root route
│   │   ├── admin.tsx         # Administrator dashboard
│   │   ├── calendar.tsx
│   │   ├── index.tsx         # home / club discovery
│   │   ├── login.tsx         # Student + Administrator tabs; admin tab calls check_administrator_allowlist()
│   │   ├── mcp.ts            # returns 404 for ALL methods (/mcp disabled)
│   │   ├── my-clubs.tsx
│   │   ├── notifications.tsx
│   │   ├── onboarding.tsx
│   │   ├── settings.tsx
│   │   ├── signup.tsx
│   │   ├── clubs/
│   │   │   ├── new.tsx
│   │   │   └── $clubId/
│   │   │       ├── index.tsx
│   │   │       ├── announcements.tsx
│   │   │       ├── attendance.tsx
│   │   │       ├── calendar.tsx
│   │   │       ├── chat.tsx
│   │   │       ├── data.tsx
│   │   │       ├── events.tsx
│   │   │       ├── forms.tsx
│   │   │       ├── funds.tsx
│   │   │       ├── leadership.tsx
│   │   │       ├── members.tsx
│   │   │       └── settings.tsx
│   │   └── README.md
│   └── test/
│       ├── app-routing.test.tsx
│       └── setup.ts
├── supabase/
│   ├── AUDIT_2026-10-24_schema_rls_indexes.md
│   ├── SCHEMA_RECONCILIATION_REPORT.md
│   ├── config.toml
│   ├── seed.sql                # developer placeholders only (no real admin emails)
│   └── migrations/
│       ├── 20260101000001_core_schema.sql
│       ├── 20260101000002_clubs.sql
│       ├── 20260101000003_events_attendance.sql
│       ├── 20260101000004_chat.sql
│       ├── 20260101000005_finances.sql
│       ├── 20260101000006_forms.sql
│       ├── 20260101000007_data_tables.sql
│       ├── 20260101000008_leadership.sql
│       ├── 20260101000009_notifications.sql
│       ├── 20260101000100_update_admin_allowlist.sql
│       ├── 20260101000200_update_admin_authorization.sql
│       ├── 20260101000210_fix_search_clubs.sql
│       ├── 20260101000220_fix_search_clubs_orderby.sql
│       ├── 20260101000300_harden_profiles_security.sql
│       ├── 20261003000536_*.sql through 20261003001201_*.sql (auto-generated, 7 files)
│       ├── 20261003001241_*.sql  # RLS hardening baseline (function grants)
│       ├── 20261018000000_admin_allowlist_authorization.sql
│       ├── 20261019000000_performance_indexes.sql
│       ├── 20261019000100_restore_rls_policy_helper_grants.sql  # restores 8 policy predicate EXECUTE grants
│       ├── 20261019000200_authorize_administrator.sql
│       ├── 20261020021156_*.sql (auto-generated)
│       ├── 20261024204857_harden_attendance_stats_and_notify_grants.sql
│       ├── 20261025001325_harden_default_function_privileges.sql
│       ├── 20261025001656_revert_inert_default_function_privileges.sql
│       ├── 20261025002233_restore_profiles_select_for_authenticated.sql
│       ├── 20261025005921_authorize_second_administrator.sql
│       ├── 20261026000100_fix_club_read_access.sql      # restrictive clubs_select_school + can_discover_club
│       ├── 20261026000200_fix_membership_attendance_audit.sql
│       ├── 20261026000300_fix_leadership_forms_data.sql
│       ├── 20261026000400_rls_and_index_performance.sql  # 30 policy rewrites, 30 FK indexes, pg_trgm
│       ├── 20261101182137_administrator_allowlist_precheck.sql  # anon-callable check_administrator_allowlist()
│       ├── 20261101182953_lock_admin_allowlist_from_anon.sql   # revoke anon admin_allowlist grants
│       ├── 20261102000000_search_clubs_set_based.sql
│       ├── 20261103000000_open_student_signup_and_lock_allowlist.sql  # revoke anon+authenticated admin_allowlist grants
│       ├── 20261104000000_fix_write_path_bugs.sql
│       ├── 20261106000000_restrict_anonymous_authenticated_role.sql  # RE-CREATED clubs_select_school PERMISSIVE (VULN-001 root cause)
│       ├── 20261107000000_add_auth_rate_limiting.sql
│       ├── 20261107000001_fix_clubs_select_school_policy.sql   # NEW — restrictive clubs_select_school (VULN-001 fix)
│       ├── 20261107000002_revoke_admin_allowlist_client_grants.sql  # NEW — revoke admin_allowlist grants (VULN-002 fix)
│       └── 20261107000003_restrict_profile_column_exposure.sql   # NEW — profiles_public view, profiles_select_self, is_user_administrator() (VULN-003 fix)
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── wrangler.jsonc          # Cloudflare Worker public vars: VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_URL, VITE_TURNSTILE_SITE_KEY
```

## Files

### src/routes/mcp.ts
_Disabled /mcp endpoint — returns HTTP 404 for ALL methods_
- L8 `export const Route = createFileRoute("/mcp")({ server: { handlers: { ANY: () => new Response(null, { status: 404 }) } } })`

### src/routes/[.well-known]/oauth-protected-resource.ts
_Disabled OAuth protected resource endpoint — returns HTTP 404 for ALL methods_
- L7 `export const Route = createFileRoute("/.well-known/oauth-protected-resource")({ server: { handlers: { ANY: () => new Response(null, { status: 404 }) } } })`

### src/lib/hooks/use-club.ts
_Club context hook — one query loads club, membership, permissions; uses is_user_administrator() RPC_
- L15 `export function useClubContext(clubId: string)` — batches getUser() + club read, then memberships/role_assignments/is_user_administrator/club_administrators in parallel

### src/lib/auth/permissions.ts
_UI permission helpers — show only, never enforce_
- L26 `export function can(permissions, needed)`
- L30 `export function isLeader(context)`
- L34 `export function isActiveMember(context)`
- L42 `export function managementSections(context)`
- L99 `export function quickActions(context)`

### src/lib/queries.ts
_TanStack Query hooks — all reads go through RLS-governed tables or Postgres RPCs_
- L69 `export function useAdminLogin()` — allowlist pre-check then signInWithOtp(); verdict never reported
- L135 `export async function requestAdministratorActivation()`
- L152 `export function useViewerId()`
- L332 `export function useClubSearch(filters)`
- L521 `export function useApplyToClub()`
- L809 `export function useAdminClubOverview(enabled = true)` — gated, admin-only

### src/lib/security/auth-rate-limit.functions.ts
_Server-enforced rate limiting for auth email operations (signup, signInWithOtp)_
- L98 `export const enforceAuthRateLimit` — server function, service-role client, keyed by (identifier, operation)

### src/lib/security/pwned-passwords.server.ts
_HaveIBeenPwned range check (server-only, no secrets)_
- L21 `export function sha1Hex(value)`
- L83 `export async function checkPasswordAgainstHibp(password, options)`

### src/lib/types/database.ts
_Hand-maintained Database types — includes is_user_administrator function type_
- L718 `is_user_administrator: { Args: { target_user_id: string }; Returns: boolean }`

### src/integrations/supabase/types.ts
_Supabase-generated Database types — includes is_user_administrator function type_

### wrangler.jsonc
_Cloudflare Worker public runtime vars — VITE_SUPABASE_ANON_KEY (INVALID), VITE_SUPABASE_URL, VITE_TURNSTILE_SITE_KEY_

### supabase/migrations/20261106000000_restrict_anonymous_authenticated_role.sql
_VULN-001 root cause — re-created clubs_select_school with PERMISSIVE school-wide policy (overrides 20261026000100 restrictive version)_

### supabase/migrations/20261107000001_fix_clubs_select_school_policy.sql
_NEW — re-creates restrictive clubs_select_school: can_discover_club() OR founder_id OR is_club_member() OR is_club_admin()_

### supabase/migrations/20261107000002_revoke_admin_allowlist_client_grants.sql
_NEW — REVOKE ALL on admin_allowlist FROM anon, authenticated_

### supabase/migrations/20261107000003_restrict_profile_column_exposure.sql
_NEW — profiles_public view (limited columns), profiles_select_self (id=auth.uid()), is_user_administrator() function_

codemap: wrote CODEMAP.md (~150 files, ~220 with symbols)