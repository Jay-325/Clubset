# CODEMAP

_Generated: 2026-11-01T00:00:00Z_

## Tree

```
clubset/
├── .agents/
│   └── skills/
│       ├── supabase/
│       │   ├── SKILL.md
│       │   ├── CHANGELOG.md
│       │   ├── references/  (skill-feedback.md, ...)
│       │   └── assets/      (feedback-issue-template.md)
│       └── supabase-postgres-best-practices/
│           ├── SKILL.md
│           ├── CHANGELOG.md
│           └── references/  (_contributing.md, _sections.md, _template.md,
│           │               advanced-full-text-search.md, advanced-jsonb-indexing.md,
│           │               conn-*.md, data-*.md, lock-*.md, monitor-*.md,
│           │               query-*.md, schema-*.md, security-*.md)
├── .claude/.gitignore
├── .env.example
├── .gitignore
├── .lovable/
│   ├── mcp/manifest.json
│   └── project.json
├── .prettierignore
├── .prettierrc
├── AGENTS.md
├── bun.lock
├── bunfig.toml
├── CODEMAP.md
├── components.json
├── eslint.config.js
├── package.json
├── package-lock.json
├── public/
│   ├── favicon.ico
│   └── robots.txt
├── README.md
├── scripts/
│   ├── check-sql.ts
│   ├── sql-error.ts
│   └── verify-admin-auth.sql
├── SECURITY_NOTES.md
├── src/
│   ├── components/
│   │   ├── app-shell.tsx        # RequireAuth, AppShell, PageHeader
│   │   └── ui/                  # 46 shadcn/ui primitives (accordion, alert, ... tooltip)
│   ├── hooks/
│   │   └── use-mobile.tsx       # useIsMobile
│   ├── integrations/
│   │   └── supabase/
│   │       ├── auth-attacher.ts      # attachSupabaseAuth
│   │       ├── auth-middleware.ts    # requireSupabaseAuth
│   │       ├── client.server.ts      # supabaseAdmin (service-role proxy)
│   │       ├── client.ts             # supabase (anon proxy)
│   │       ├── cron-auth.ts          # authenticateCronRequest
│   │       ├── previewAuthStorage.ts # PreviewAuthStorage, brokeredPreviewStorage
│   │       └── types.ts              # Json, Database, Tables/Insert/Update, Enums, Constants
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── context.tsx   # AuthProvider, useAuth, useIsSignedOut
│   │   │   └── permissions.ts# ClubContext, can, isLeader, isActiveMember, managementSections, quickActions
│   │   ├── domain.ts         # club/event/attendance constants + TABLE_TEMPLATES
│   │   ├── error-capture.ts  # describeError, consumeLastCapturedError
│   │   ├── error-page.ts     # renderErrorPage
│   │   ├── hooks/
│   │   │   ├── use-club.ts           # useClubContext
│   │   │   └── use-debounced-value.ts# useDebouncedValue
│   │   ├── lovable-error-reporting.ts# reportLovableError
│   │   ├── mcp/
│   │   │   ├── index.ts
│   │   │   ├── supabase.ts    # supabaseForUser, textResult, errorResult
│   │   │   └── tools/
│   │   │       ├── list-announcements.ts
│   │   │       ├── list-my-clubs.ts
│   │   │       └── list-upcoming-events.ts
│   │   ├── queries.ts        # TanStack Query hooks (useClubSearch, useFinalizeAttendance, ...)
│   │   ├── security/
│   │   │   ├── passwords.test.ts
│   │   │   ├── passwords.ts
│   │   │   ├── pwned-passwords.functions.ts
│   │   │   ├── pwned-passwords.server.ts
│   │   │   └── pwned-passwords.test.ts
│   │   ├── supabase/
│   │   │   ├── client.ts            # isSupabaseConfigured, getSupabaseClient
│   │   │   └── public-config.ts     # FALLBACK_SUPABASE_URL, FALLBACK_SUPABASE_PUBLISHABLE_KEY
│   │   ├── types/
│   │   │   ├── database.ts   # Json, AccountType, ClubRow, MembershipRow, EventRow, Database, ...
│   │   │   └── domain.ts     # (merged into src/lib/domain.ts)
│   │   └── utils.ts          # cn(...inputs)
│   ├── router.tsx
│   ├── routeTree.gen.ts
│   ├── server.ts
│   ├── start.ts
│   ├── styles.css
│   ├── routes/
│   │   ├── [.]lovable.oauth.consent.tsx
│   │   ├── [.well-known]/oauth-protected-resource.ts
│   │   ├── __root.tsx        # Route
│   │   ├── admin.tsx         # Route
│   │   ├── calendar.tsx      # Route
│   │   ├── clubs/
│   │   │   ├── $clubId/
│   │   │   │   ├── announcements.tsx   # Route
│   │   │   │   ├── attendance.tsx      # Route
│   │   │   │   ├── calendar.tsx        # Route
│   │   │   │   ├── chat.tsx            # Route
│   │   │   │   ├── data.tsx            # Route
│   │   │   │   ├── events.tsx          # Route
│   │   │   │   ├── forms.tsx           # Route
│   │   │   │   ├── funds.tsx           # Route
│   │   │   │   ├── index.tsx           # Route
│   │   │   │   ├── leadership.tsx      # Route
│   │   │   │   ├── members.tsx         # Route
│   │   │   │   └── settings.tsx        # Route
│   │   ├── clubs/new.tsx     # Route
│   │   ├── index.tsx         # Route
│   │   ├── login.tsx         # Route
│   │   ├── mcp.ts            # Route
│   │   ├── my-clubs.tsx      # Route
│   │   ├── notifications.tsx # Route
│   │   ├── onboarding.tsx    # Route
│   │   ├── settings.tsx      # Route
│   │   ├── signup.tsx        # Route
│   │   └── README.md
│   └── test/
│       ├── app-routing.test.tsx
│       └── setup.ts
├── supabase/
│   ├── AUDIT_2026-10-24_schema_rls_indexes.md
│   ├── config.toml
│   ├── SCHEMA_RECONCILIATION_REPORT.md
│   ├── seed.sql
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
│       ├── 20261003000536_eeda22be-6233-4e49-8eb6-56f5c167104d.sql
│       ├── 20261003000659_2f086b1d-4ed4-4f6d-89a1-6025bb199d33.sql
│       ├── 20261003000812_ee563a54-509a-4a92-8255-a6a88c8fb8d1.sql
│       ├── 20261003000858_72b0e5f9-fcc4-4941-adc7-a35be672f841.sql
│       ├── 20261003000954_2e694160-3221-416b-a92a-973cd97d117a.sql
│       ├── 20261003001201_10756f18-9d39-45d3-9523-f5caafe885e1.sql
│       ├── 20261003001241_75ef3c48-ca01-4f01-b60d-6676849cfcff.sql
│       ├── 20261018000000_admin_allowlist_authorization.sql
│       ├── 20261019000000_performance_indexes.sql
│       ├── 20261019000100_restore_rls_policy_helper_grants.sql
│       ├── 20261019000200_authorize_administrator.sql
│       ├── 20261020021156_d660b51e-42d4-4e8c-a345-c3bb013ff634.sql
│       ├── 20261024204857_harden_attendance_stats_and_notify_grants.sql
│       ├── 20261025001325_harden_default_function_privileges.sql
│       ├── 20261025001656_revert_inert_default_function_privileges.sql
│       ├── 20261025002233_restore_profiles_select_for_authenticated.sql
│       ├── 20261025005921_authorize_second_administrator.sql
│       ├── 20261026000100_fix_club_read_access.sql      # can_read_club narrowing, can_discover_club
│       ├── 20261026000200_fix_membership_attendance_audit.sql  # membership guard, attendance, audit
│       ├── 20261026000300_fix_leadership_forms_data.sql  # review_application, apply_for_role, forms
│       ├── 20261026000400_rls_and_index_performance.sql   # 30 policy rewrites, 30 FK indexes, pg_trgm
│       ├── 20261101182137_administrator_allowlist_precheck.sql  # anon-callable allowlist lookup RPC
│       └── 20261101182953_lock_admin_allowlist_from_anon.sql    # revoke anon's admin_allowlist grants
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── wrangler.jsonc          # public VITE_* vars for Cloudflare Worker (Nitro reads at build)
```

## Files

### src/components/app-shell.tsx
_RequireAuth + AppShell page wrapper + PageHeader_
- L24 `export function RequireAuth({ children })`
- L64 `export function AppShell({ children })`
- L149 `export function PageHeader({`

### src/components/ui/* (46 shadcn/ui primitives)
Accordion, Alert, AlertDialog, AspectRatio, Avatar, Badge, Breadcrumb, Button, Calendar, Card, Carousel, Chart, Checkbox, Collapsible, Command, ContextMenu, Dialog, Drawer, DropdownMenu, Form, HoverCard, Input, InputOTP, Label, Menubar, NavigationMenu, Pagination, Popover, Progress, RadioGroup, Resizable, ScrollArea, Select, Separator, Sheet, Sidebar, Skeleton, Slider, Sonner, Switch, Table, Tabs, Textarea, Toggle, ToggleGroup, Tooltip

Representative exports:
- badge.tsx: L25 `export interface BadgeProps`, L32 `export { Badge, badgeVariants }`
- button.tsx: L34 `export interface ButtonProps`, L49 `export { Button, buttonVariants }`
- chart.tsx: L9 `export type ChartConfig`, L324 `export {...}`
- table.tsx: L94 `export { Table, TableHeader, ... }`

### src/hooks/use-mobile.tsx
_Mobile breakpoint detection_
- L5 `export function useIsMobile()`

### src/integrations/supabase/auth-attacher.ts
_Supabase auth middleware (function client)_
- L7 `export const attachSupabaseAuth`

### src/integrations/supabase/auth-middleware.ts
_Supabase auth middleware (function server)_
- L34 `export const requireSupabaseAuth`

### src/integrations/supabase/client.server.ts
_Service-role Supabase client proxy_
- L64 `export const supabaseAdmin`

### src/integrations/supabase/client.ts
_Anon Supabase client proxy_
- L63 `export const supabase`

### src/integrations/supabase/cron-auth.ts
_Cron request authentication_
- L2 `export async function authenticateCronRequest()`

### src/integrations/supabase/previewAuthStorage.ts
_Brokered preview auth storage_
- L4 `export interface PreviewAuthStorage`
- L41 `export function brokeredPreviewStorage()`

### src/integrations/supabase/types.ts
_Supabase-generated Database types_
- L1 `export type Json`
- L9 `export type Database`
- L2423 `export type Tables<T>`
- L2452 `export type TablesInsert<T>`
- L2477 `export type TablesUpdate<T>`
- L2502 `export type Enums`
- L2536 `export const Constants`

### src/lib/auth/context.tsx
_Auth provider + hooks_
- L24 `export function AuthProvider({ children })`
- L154 `export function useAuth()`
- L163 `export function useIsSignedOut()`

### src/lib/auth/permissions.ts
_Club permission helpers_
- L11 `export interface ClubContext`
- L26 `export function can(permissions, needed)`
- L30 `export function isLeader(context)`
- L34 `export function isActiveMember(context)`
- L42 `export function managementSections(...)`
- L99 `export function quickActions(context)`

### src/lib/auth/permissions.test.ts
_Unit tests for the UI permission helpers (can, isLeader, isActiveMember, managementSections, quickActions)_
- Pure functions, no database required

### src/lib/domain.ts
_Club/event/attendance domain constants + table templates_
- L24 `export const PRESET_INTERESTS`
- L43 `export const CLUB_TYPES`
- L75 `export const COMMITMENT_LEVELS`
- L103 `export const CLUB_STATUS_LABELS`
- L184 `export const ALL_PERMISSIONS`
- L276 `export interface TableTemplate`
- L284 `export const TABLE_TEMPLATES`

### src/lib/error-capture.ts
_Error capture utilities_
- L18 `export function describeError(error)`
- L72 `export function consumeLastCapturedError()`

### src/lib/error-page.ts
_SSR error page renderer_
- L1 `export function renderErrorPage()`

### src/lib/queries.ts
_TanStack Query hooks (auth, clubs, memberships, events, attendance, notifications, admin)_
- L54 `export function useAdminLogin()` — allowlist pre-check then activation link; resolves `void`, never the verdict
- L111 `export async function requestAdministratorActivation()`
- L128 `export function useViewerId()`
- L140 `export function useSignIn()`
- L167 `export function useSignUp()`
- L202 `export function useChangePassword()`
- L303 `export function useClubSearch(filters)`
- L677 `export function useFinalizeAttendance()`
- L698 `export function useNotifications()`
- L733 `export function useAdminClubOverview(enabled = true)`

### src/lib/security/passwords.test.ts
_Tests for password-guard messages and fail-closed handling_

### src/lib/security/passwords.ts
_Client-safe password guard + generic user-facing messages_
- L7 `export const BREACHED_PASSWORD_MESSAGE`
- L10 `export const PASSWORD_CHECK_UNAVAILABLE_MESSAGE`
- L24 `export async function assertPasswordNotBreached(password)`

### src/lib/security/pwned-passwords.functions.ts
_Server function for the leaked-password check_
- L15 `export const checkPasswordNotBreached`

### src/lib/security/pwned-passwords.server.ts
_Server-only SHA-1 hashing + HIBP Pwned Passwords range check_
- L21 `export function sha1Hex(value)`
- L26 `export function splitSha1(hash)`
- L45 `export function parseHibpRange(body)`
- L66 `export function rangeContainsSuffix(body, suffix)`
- L83 `export async function checkPasswordAgainstHibp(password, options)`

### src/lib/security/pwned-passwords.test.ts
_Tests for HIBP hashing, range parsing, privacy, and fail-closed behavior_

### src/lib/supabase/client.ts
_Supabase client factory + configured check_
- L41 `export function isSupabaseConfigured()`
- L49 `export function getSupabaseClient()`

### src/lib/supabase/public-config.ts
_Public Supabase fallback URL/publishable key_
- L27 `export const FALLBACK_SUPABASE_URL`
- L30 `export const FALLBACK_SUPABASE_PUBLISHABLE_KEY`

### src/lib/types/database.ts
_Database row/result type definitions_
- L10 `export type Json`
- L16-47 `export type` (AccountType, GradeLevel, ClubType, CommitmentLevel, EventPriority, EventKind, ClubStatus, MembershipStatus, ClubPermission, VerificationKind, RsvpStatus, AttendanceStatus, AttendanceSource, TransactionType, DuesStatus, FormStatus, QuestionType, RequirementKind, ApplicationStatus, NotificationType)
- L70 `export type SchoolRow`
- L79 `export type ProfileRow`
- L94 `export type ClubRow`
- L150 `export type MembershipRow`
- L171 `export type EventRow`
- L197 `export type AttendanceRow`
- L363 `export type LeadershipApplicationRow`
- L504 `export type Database`
- L884 `export type Tables<T>`
- L886 `export type TablesInsert<T>`

### src/lib/utils.ts
_Tailwind class merge helper_
- L4 `export function cn(...inputs)`

### src/lib/mcp/supabase.ts
_Supabase client factory for MCP tool context_
- L17 `export function supabaseForUser(ctx)`
- L29 `export const textResult`
- L30 `export const errorResult`

### src/lib/mcp/tools/list-announcements.ts
_List announcements MCP tool_
### src/lib/mcp/tools/list-my-clubs.ts
_List my clubs MCP tool_
### src/lib/mcp/tools/list-upcoming-events.ts
_List upcoming events MCP tool_

### src/routes/__root.tsx
_Root route_
- L78 `export const Route`

### src/routes/*.tsx
_File-based TanStack Router routes (admin, calendar, clubs/*, index, login, mcp, my-clubs, notifications, onboarding, settings)_
Each exports `export const Route = createFileRoute("...")({...})`.
`login.tsx` is the tabbed Student/Administrator auth screen; `?tab=admin` deep-links to the administrator tab, and the admin form calls `check_administrator_allowlist()` before requesting an activation email.

### supabase/migrations/20261026000100_fix_club_read_access.sql
_Club discovery vs private reads split (can_read_club, can_discover_club)_
### supabase/migrations/20261026000200_fix_membership_attendance_audit.sql
_Membership self-update guard, attendance_corrections insert, private.record_audit, finalize_attendance, apply_for_role, review_application_
### supabase/migrations/20261026000300_fix_leadership_forms_data.sql
_Leadership application/update policies, draft-only insert, form_responses update self, apply_table_template fix_
### supabase/migrations/20261026000400_rls_and_index_performance.sql
_30 (select auth.uid()) policy rewrites, 30 FK indexes, pg_trgm + 3 trigram indexes, search_clubs @> rewrite_

### supabase/migrations/20261101182137_administrator_allowlist_precheck.sql
_`check_administrator_allowlist(text) -> boolean`: read-only, anon-callable allowlist lookup for the Administrator login tab_

### supabase/migrations/20261101182953_lock_admin_allowlist_from_anon.sql
_Revokes all table privileges on `admin_allowlist` from `anon`; signed-out reads get 401/42501, signed-in admins keep RLS-governed access_

### wrangler.jsonc
_Public Cloudflare Worker runtime vars (VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_URL, VITE_TURNSTILE_SITE_KEY)_

codemap: wrote CODEMAP.md (~140 files, ~200 with symbols)
