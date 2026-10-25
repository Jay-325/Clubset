# CODEMAP

_Generated: 2026-10-24T20:13:06.247Z_

## Tree

```
joinin-44b91fde/
├── .agents/
│   └── skills/                       # vendored Supabase skill docs (40 files)
├── .claude/
│   └── .gitignore
├── .lovable/
│   ├── mcp/
│   │   └── manifest.json
│   └── project.json
├── public/
│   ├── favicon.ico
│   └── robots.txt
├── scripts/
│   ├── check-sql.ts
│   ├── sql-error.ts
│   └── verify-admin-auth.sql
├── src/
│   ├── components/
│   │   ├── app-shell.tsx
│   │   └── ui/                       # 46 shadcn/ui primitives
│   ├── hooks/
│   │   └── use-mobile.tsx
│   ├── integrations/
│   │   └── supabase/
│   │       ├── auth-attacher.ts
│   │       ├── auth-middleware.ts
│   │       ├── client.server.ts
│   │       ├── client.ts
│   │       ├── cron-auth.ts
│   │       ├── previewAuthStorage.ts
│   │       └── types.ts
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── context.tsx
│   │   │   └── permissions.ts
│   │   ├── hooks/
│   │   │   ├── use-club.ts
│   │   │   └── use-debounced-value.ts
│   │   ├── mcp/
│   │   │   ├── tools/
│   │   │   │   ├── list-announcements.ts
│   │   │   │   ├── list-my-clubs.ts
│   │   │   │   └── list-upcoming-events.ts
│   │   │   ├── index.ts
│   │   │   └── supabase.ts
│   │   ├── supabase/
│   │   │   └── client.ts
│   │   ├── types/
│   │   │   └── database.ts
│   │   ├── domain.ts
│   │   ├── error-capture.ts
│   │   ├── error-page.ts
│   │   ├── lovable-error-reporting.ts
│   │   ├── queries.ts
│   │   └── utils.ts
│   ├── routes/
│   │   ├── [.well-known]/
│   │   │   └── oauth-protected-resource.ts
│   │   ├── clubs/
│   │   │   ├── $clubId/
│   │   │   │   ├── announcements.tsx
│   │   │   │   ├── attendance.tsx
│   │   │   │   ├── calendar.tsx
│   │   │   │   ├── chat.tsx
│   │   │   │   ├── data.tsx
│   │   │   │   ├── events.tsx
│   │   │   │   ├── forms.tsx
│   │   │   │   ├── funds.tsx
│   │   │   │   ├── index.tsx
│   │   │   │   ├── leadership.tsx
│   │   │   │   ├── members.tsx
│   │   │   │   └── settings.tsx
│   │   │   └── new.tsx
│   │   ├── [.]lovable.oauth.consent.tsx
│   │   ├── __root.tsx
│   │   ├── admin.tsx
│   │   ├── calendar.tsx
│   │   ├── index.tsx
│   │   ├── login.tsx
│   │   ├── mcp.ts
│   │   ├── my-clubs.tsx
│   │   ├── notifications.tsx
│   │   ├── onboarding.tsx
│   │   ├── settings.tsx
│   │   └── README.md
│   ├── test/
│   │   ├── app-routing.test.tsx
│   │   └── setup.ts
│   ├── routeTree.gen.ts
│   ├── router.tsx
│   ├── server.ts
│   ├── start.ts
│   └── styles.css
├── supabase/
│   ├── migrations/                   # 26 migrations (see Database migrations)
│   ├── SCHEMA_RECONCILIATION_REPORT.md
│   ├── config.toml
│   └── seed.sql
├── .env
├── .env.example
├── .gitignore
├── .prettierignore
├── .prettierrc
├── AGENTS.md
├── CODEMAP.md
├── README.md
├── bun.lock
├── bunfig.toml
├── components.json
├── eslint.config.js
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

## Tree (tests)

```
src/test/
├── app-routing.test.tsx
└── setup.ts
```

## Files

### scripts/check-sql.ts

_Parses every migration with the real Postgres grammar (definition-of-done gate)._

### scripts/sql-error.ts

_SQL error formatting and position reporting helpers._

### src/components/app-shell.tsx

_RequireAuth gate, four-tab navigation shell, and page header._

- L24 `export function RequireAuth`
- L64 `export function AppShell`
- L149 `export function PageHeader`

### src/components/ui/

_shadcn/ui + Radix primitives (46 files; each exports its namesake component)._

- `accordion`, `alert-dialog`, `alert`, `aspect-ratio`, `avatar`, `badge`,
  `breadcrumb`, `button`, `calendar`, `card`, `carousel`, `chart`, `checkbox`,
  `collapsible`, `command`, `context-menu`, `dialog`, `drawer`, `dropdown-menu`,
  `form`, `hover-card`, `input`, `input-otp`, `label`, `menubar`,
  `navigation-menu`, `pagination`, `popover`, `progress`, `radio-group`,
  `resizable`, `scroll-area`, `select`, `separator`, `sheet`, `sidebar`,
  `skeleton`, `slider`, `sonner`, `switch`, `table`, `tabs`, `textarea`,
  `toggle`, `toggle-group`, `tooltip`

### src/hooks/use-mobile.tsx

_Mobile breakpoint detection hook._

- L5 `export function useIsMobile`

### src/integrations/supabase/auth-attacher.ts

_Client middleware that attaches the Supabase bearer token to server-function calls._

- L7 `export const attachSupabaseAuth`

### src/integrations/supabase/auth-middleware.ts

_Server middleware that requires a valid Supabase session._

- L34 `export const requireSupabaseAuth`

### src/integrations/supabase/client.server.ts

_Server-only Supabase client using the service-role key._

- L64 `export const supabaseAdmin`

### src/integrations/supabase/client.ts

_Lazy client-side Supabase singleton._

- L63 `export const supabase`

### src/integrations/supabase/cron-auth.ts

_Authenticates cron-triggered requests._

- L2 `export async function authenticateCronRequest`

### src/integrations/supabase/previewAuthStorage.ts

_Auth storage broker for Lovable preview surfaces._

- L5 `export function brokeredPreviewStorage`

### src/integrations/supabase/types.ts

_Generated Supabase database types (large; do not hand-edit)._

- L1 `export type Json`
- L9 `export type Database`
- L2423 `export type Tables`
- L2452 `export type TablesInsert`
- L2477 `export type TablesUpdate`
- L2502 `export type Enums`
- L2519 `export type CompositeTypes`
- L2536 `export const Constants`

### src/lib/auth/context.tsx

_Auth context, session loading, and sign-out state._

- L24 `export function AuthProvider`
- L154 `export function useAuth`
- L163 `export function useIsSignedOut`

### src/lib/auth/permissions.ts

_Permission helpers and navigation derived from a club context._

- L11 `export interface ClubContext`
- L26 `export function can`
- L30 `export function isLeader`
- L34 `export function isActiveMember`
- L42 `export function managementSections`
- L99 `export function quickActions`

### src/lib/domain.ts

_Product vocabulary, labels, and preset values shared by forms and UI._

- L24 `export const PRESET_INTERESTS`
- L43 `export const CLUB_TYPES`
- L49 `export const CLUB_TYPE_LABELS`
- L59 `export const COMMITMENT_LEVELS`
- L69 `export const COMMITMENT_LABELS`
- L75 `export const WEEKLY_HOUR_OPTIONS`
- L81 `export const MEETING_DAYS`
- L90 `export const COMMON_MEETING_TIMES`
- L103 `export const CLUB_STATUS_LABELS`
- L113 `export const REQUIRED_STUDENT_VERIFICATIONS`
- L119 `export const PERMISSION_LABELS`
- L133 `export const SUGGESTED_ROLES`
- L184 `export const ALL_PERMISSIONS`
- L190 `export const EVENT_KINDS`
- L197 `export const EVENT_KIND_LABELS`
- L204 `export const EVENT_PRIORITY_LABELS`
- L211 `export const DEFAULT_MEETING_DURATION_MINUTES`
- L220 `export const ATTENDANCE_STATUS_LABELS`
- L227 `export const ATTENDANCE_STATUS_HINTS`
- L238 `export const INCOME_CATEGORIES`
- L247 `export const EXPENSE_CATEGORIES`
- L262 `export const QUESTION_TYPE_LABELS`
- L276 `export interface TableTemplate`
- L284 `export const TABLE_TEMPLATES`
- L327 `export const REQUIREMENT_LABELS`
- L338 `export const REQUIREMENTS_USE_FINALIZED_ATTENDANCE`
- L347 `export const GRADE_LABELS`

### src/lib/error-capture.ts

_Describes and stores the last server-side error for recovery._

- L18 `export function describeError`
- L72 `export function consumeLastCapturedError`

### src/lib/error-page.ts

_Renders the standalone HTML error page._

- L1 `export function renderErrorPage`

### src/lib/hooks/use-club.ts

_Loads club, membership, and permissions in one context hook._

- L15 `export function useClubContext`

### src/lib/hooks/use-debounced-value.ts

_Debounces search input values (300 ms default)._

- L11 `export function useDebouncedValue`

### src/lib/lovable-error-reporting.ts

_Reports client errors to the Lovable error channel._

- L27 `export function reportLovableError`

### src/lib/mcp/index.ts

_MCP server definition: registers the Clubset tools._

- L8 `export default defineMcp(...)`

### src/lib/mcp/supabase.ts

_Per-user Supabase client and result helpers for MCP tools._

- L17 `export function supabaseForUser`
- L29 `export const textResult`
- L30 `export const errorResult`

### src/lib/mcp/tools/list-announcements.ts

_MCP tool: list club announcements._

- L5 `export default defineTool(...)`

### src/lib/mcp/tools/list-my-clubs.ts

_MCP tool: list the caller's clubs._

- L4 `export default defineTool(...)`

### src/lib/mcp/tools/list-upcoming-events.ts

_MCP tool: list upcoming events._

- L5 `export default defineTool(...)`

### src/lib/queries.ts

_All TanStack Query hooks and mutations (single source for keys/invalidation)._

- L37 `export function useAdminLogin`
- L77 `export async function requestAdministratorActivation`
- L94 `export function useViewerId`
- L106 `export function useSignIn`
- L133 `export function useSignUp`
- L151 `export function useUpdateProfile`
- L167 `export function useMemberSearch`
- L189 `export interface ClubFilters`
- L236 `export function useClubSearch`
- L245 `export function useRecommendedClubs`
- L256 `export function useClub`
- L269 `export function useMyClubs`
- L290 `export function useSetClubPriority`
- L310 `export function useCreateClub`
- L343 `export function useClubVerifications`
- L359 `export function useVerifyClub`
- L374 `export function useSubmitClubForReview`
- L391 `export function useReviewClub`
- L411 `export function useApplyToClub`
- L426 `export function useJoinRequests`
- L447 `export function useClubMembers`
- L465 `export function useReviewMembership`
- L489 `export function useUpcomingEvents`
- L503 `export function useClubEvents`
- L520 `export function useCreateEvent`
- L558 `export function useRsvp`
- L578 `export function useAttendanceForEvent`
- L595 `export function useVetoRsvp`
- L610 `export function useFinalizeAttendance`
- L631 `export function useNotifications`
- L647 `export function useMarkNotificationRead`
- L666 `export function useAdminClubOverview`

### src/lib/supabase/client.ts

_Client factory with configuration guard (RLS enforced)._

- L36 `export function isSupabaseConfigured`
- L46 `export function getSupabaseClient`

### src/lib/types/database.ts

_Hand-maintained database types mirroring the migrations._

- L10 `export type Json`
- L16 `export type AccountType`
- L17 `export type GradeLevel`
- L18 `export type ClubType`
- L19 `export type CommitmentLevel`
- L20 `export type EventPriority`
- L21 `export type EventKind`
- L22 `export type ClubStatus`
- L29 `export type MembershipStatus`
- L30 `export type ClubPermission`
- L41 `export type VerificationKind`
- L42 `export type RsvpStatus`
- L43 `export type AttendanceStatus`
- L44 `export type AttendanceSource`
- L45 `export type TransactionType`
- L46 `export type DuesStatus`
- L47 `export type FormStatus`
- L48 `export type QuestionType`
- L50 `export type RequirementKind`
- L52 `export type ApplicationStatus`
- L54 `export type NotificationType`
- L70 `export type SchoolRow`
- L79 `export type ProfileRow`
- L94 `export type ClubRow`
- L115 `export type ClubAdministratorRow`
- L122 `export type ClubVerificationRow`
- L130 `export type LeadershipRoleRow`
- L141 `export type RoleAssignmentRow`
- L150 `export type MembershipRow`
- L161 `export type AnnouncementRow`
- _…plus row types for events/chat/finance/forms/data-tables/leadership/notifications/audit (L171–L481)_
- L504 `export type Database`
- L884 `export type Tables`
- L886 `export type TablesInsert`

### src/lib/utils.ts

_Class-name merge helper._

- L4 `export function cn`

### src/routeTree.gen.ts

_Auto-generated TanStack Router tree — do not edit by hand._

- L160 `export interface FileRoutesByFullPath`
- L186 `export interface FileRoutesByTo`
- L212 `export interface FileRoutesById`
- L239 `export interface FileRouteTypes`
- L320 `export interface RootRouteChildren`
- L547 `export const routeTree`

### src/router.tsx

_Router factory used by the Start entry point._

- L5 `export const getRouter`

### src/routes/[.]lovable.oauth.consent.tsx

_OAuth consent screen for the Lovable integration._

- L13 `export const Route`

### src/routes/[.well-known]/oauth-protected-resource.ts

_OAuth protected-resource metadata endpoint._

- L12 `export const Route`

### src/routes/__root.tsx

_Root layout: query-client context, auth shell, error boundaries._

- L78 `export const Route`

### src/routes/admin.tsx

_Administrator oversight page — club approvals and platform view._

- L24 `export const Route`

### src/routes/calendar.tsx

_Combined calendar of events from the user's clubs._

- L23 `export const Route`

### src/routes/clubs/$clubId/announcements.tsx

_Club announcements management._

- L28 `export const Route`

### src/routes/clubs/$clubId/attendance.tsx

_RSVP → attendance tracking and finalization._

- L36 `export const Route`

### src/routes/clubs/$clubId/calendar.tsx

_Individual club calendar view._

- L21 `export const Route`

### src/routes/clubs/$clubId/chat.tsx

_Club group chat with banners._

- L23 `export const Route`

### src/routes/clubs/$clubId/data.tsx

_Custom club data tables (columns, rows, templates)._

- L40 `export const Route`

### src/routes/clubs/$clubId/events.tsx

_Event creation and management for a club._

- L36 `export const Route`

### src/routes/clubs/$clubId/forms.tsx

_Form builder and response collection._

- L45 `export const Route`

### src/routes/clubs/$clubId/funds.tsx

_Club finances — income, expenses, dues tracking._

- L33 `export const Route`

### src/routes/clubs/$clubId/index.tsx

_Club dashboard: public welcome page or internal view._

- L25 `export const Route`

### src/routes/clubs/$clubId/leadership.tsx

_Roles, permissions, eligibility requirements, applications._

- L46 `export const Route`

### src/routes/clubs/$clubId/members.tsx

_Membership management and join requests._

- L33 `export const Route`

### src/routes/clubs/$clubId/settings.tsx

_Club metadata, meeting schedule, interests._

- L38 `export const Route`

### src/routes/clubs/new.tsx

_New-club creation wizard with verification flow._

- L45 `export const Route`

### src/routes/index.tsx

_Discovery home: recommended clubs and upcoming events._

- L33 `export const Route`

### src/routes/login.tsx

_Student and administrator sign-in paths._

- L19 `export const Route`

### src/routes/mcp.ts

_MCP server endpoint._

- L12 `export const Route`

### src/routes/my-clubs.tsx

_User's clubs with priority ordering._

- L21 `export const Route`

### src/routes/notifications.tsx

_Notification feed._

- L14 `export const Route`

### src/routes/onboarding.tsx

_New-user onboarding: name, grade, interests, commitment._

- L28 `export const Route`

### src/routes/settings.tsx

_General account settings._

- L30 `export const Route`

### src/server.ts

_Server entry: wires Start, error capture, and the HTML error fallback._

- L47 `export default { ... }`

### src/start.ts

_TanStack Start instance with CSRF and auth middleware._

- L28 `export const startInstance`

### src/test/app-routing.test.tsx

_Router smoke tests: every top-level route mounts and paints._

- L8 `function renderAt`
- L25 `describe("App routing", ...)`

### src/test/setup.ts

_Vitest DOM setup (jest-dom, matchMedia, scrollTo stubs)._

### vite.config.ts

_Vite build config (TanStack Start plugin, aliases, chunking)._

### vitest.config.ts

_Vitest config (jsdom environment, setup file)._

## Database migrations

`supabase/migrations/` — oldest → newest. Every schema change must be a new
timestamped migration; never edit an applied one.

- `20260101000001_core_schema.sql` — core schema (schools, profiles, enums)
- `20260101000002_clubs.sql` — clubs, membership, leadership roles & permissions
- `20260101000003_events_attendance.sql` — events, RSVPs, attendance, corrections, calendar conflicts
- `20260101000004_chat.sql` — group chat, banners, announcements
- `20260101000005_finances.sql` — club funds, dues, receipts
- `20260101000006_forms.sql` — forms and responses
- `20260101000007_data_tables.sql` — custom data tables
- `20260101000008_leadership.sql` — leadership applications and eligibility
- `20260101000009_notifications.sql` — discovery, recommendations, notifications
- `20260101000100_update_admin_allowlist.sql` — administrator allowlist update
- `20260101000200_update_admin_authorization.sql` — administrator authorization rules
- `20260101000210_fix_search_clubs.sql` — `search_clubs` ORDER BY alias fix
- `20260101000220_fix_search_clubs_orderby.sql` — `search_clubs` ORDER BY via CTE
- `20260101000300_harden_profiles_security.sql` — profiles security hardening
- `20261003000536_*.sql` — harden exposed helper functions
- `20261003000659_*.sql` — events/attendance reconciliation (intentionally empty)
- `20261003000812_*.sql` — enable RLS on dues (follow-up)
- `20261003000858_*.sql` — `apply_table_template` runs as caller
- `20261003000954_*.sql` — eligibility checks scoped to caller
- `20261003001201_*.sql` — notifications, discovery, audit triggers, seeds
- `20261003001241_*.sql` — **project-wide execution-grant hardening baseline (do not regress)**
- `20261018000000_admin_allowlist_authorization.sql` — allowlist is authoritative
- `20261019000000_performance_indexes.sql` — indexes for the two unbounded read paths
- `20261019000100_restore_rls_policy_helper_grants.sql` — restore EXECUTE for policy helpers
- `20261019000200_authorize_administrator.sql` — make the first live administrator
- `20261020021156_*.sql` — `guard_club_status_change` trigger hardening
