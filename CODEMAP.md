# CODEMAP

_Generated: 2026-10-22T20:54:10.725Z_

## Tree

```
joinin/
├── .agents/
│   └── skills/
│       ├── supabase/
│       └── supabase-postgres-best-practices/
├── .claude/
├── .lovable/
├── claude-skills/
├── components.json
├── package.json
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
│   │   └── ui/
│   ├── hooks/
│   │   └── use-mobile.tsx
│   ├── integrations/
│   │   └── supabase/
│   ├── lib/
│   │   ├── auth/
│   │   ├── hooks/
│   │   ├── mcp/
│   │   ├── supabase/
│   │   └── types/
│   ├── routes/
│   │   ├── clubs/
│   │   └── [.well-known]/
│   ├── test/
│   ├── router.tsx
│   ├── routeTree.gen.ts
│   ├── server.ts
│   ├── start.ts
│   └── styles.css
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   └── seed.sql
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

## Files

### scripts/check-sql.ts
_SQL validation script_

### scripts/sql-error.ts
_SQL error handling utilities_

### src/components/app-shell.tsx
_Four primary tabs and authentication wrapper_
- L24 `export function RequireAuth`
- L64 `export function AppShell`
- L149 `export function PageHeader`

### src/components/ui/badge.tsx
_Badge component_
- L25 `export interface BadgeProps`

### src/components/ui/button.tsx
_Button component_
- L34 `export interface ButtonProps`

### src/components/ui/chart.tsx
_Chart configuration types_
- L9 `export type ChartConfig`

### src/hooks/use-mobile.tsx
_Mobile breakpoint detection hook_
- L5 `export function useIsMobile`

### src/integrations/supabase/auth-attacher.ts
_Supabase auth middleware for function calls_
- L7 `export const attachSupabaseAuth`

### src/integrations/supabase/auth-middleware.ts
_Supabase auth middleware for server functions_
- L34 `export const requireSupabaseAuth`

### src/integrations/supabase/client.server.ts
_Server-side Supabase client with service role key_
- L64 `export const supabaseAdmin`

### src/integrations/supabase/client.ts
_Client-side Supabase client_
- L63 `export const supabase`

### src/integrations/supabase/cron-auth.ts
_Cron request authentication_
- L2 `export async function authenticateCronRequest`

### src/integrations/supabase/previewAuthStorage.ts
_Preview surface auth storage brokering_
- L5 `export function brokeredPreviewStorage`

### src/integrations/supabase/types.ts
_Supabase database types_
- L1 `export type Json`
- L9 `export type Database`
- L2423 `export type Tables`
- L2452 `export type TablesInsert`
- L2477 `export type TablesUpdate`
- L2502 `export type Enums`
- L2519 `export type CompositeTypes`
- L2536 `export const Constants`

### src/lib/auth/context.tsx
_Auth context and session management_
- L24 `export function AuthProvider`
- L154 `export function useAuth`
- L163 `export function useIsSignedOut`

### src/lib/auth/permissions.ts
_Permission helpers for UI authorization checks_
- L11 `export interface ClubContext`
- L26 `export function can`
- L30 `export function isLeader`
- L34 `export function isActiveMember`
- L42 `export function managementSections`
- L99 `export function quickActions`

### src/lib/domain.ts
_Product vocabulary and preset values_
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

### src/lib/error-capture.ts
_Error capturing for server error recovery_
- L18 `export function describeError`
- L72 `export function consumeLastCapturedError`

### src/lib/error-page.ts
_Error page HTML renderer_
- L1 `export function renderErrorPage`

### src/lib/hooks/use-club.ts
_Club context loader - combines club, membership, and permissions_
- L15 `export function useClubContext`

### src/lib/hooks/use-debounced-value.ts
_Debounced value hook for search inputs_
- L11 `export function useDebouncedValue`

### src/lib/lovable-error-reporting.ts
_Lovable error reporting integration_
- L27 `export function reportLovableError`

### src/lib/mcp/index.ts
_MCP server definition for Joinin_

### src/lib/mcp/supabase.ts
_Supabase utilities for MCP tools_
- L17 `export function supabaseForUser`
- L29 `export const textResult`
- L30 `export const errorResult`

### src/lib/mcp/tools/list-announcements.ts
_MCP tool: list club announcements_

### src/lib/mcp/tools/list-my-clubs.ts
_MCP tool: list user's clubs_

### src/lib/mcp/tools/list-upcoming-events.ts
_MCP tool: list upcoming events_

### src/lib/queries.ts
_React Query hooks for all data operations_
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

### src/lib/supabase/client.ts
_Supabase client factory with RLS enforcement_
- L36 `export function isSupabaseConfigured`
- L46 `export function getSupabaseClient`

### src/lib/types/database.ts
_Database types for Joinin - hand-maintained from migrations_
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

### src/lib/utils.ts
_Utility functions_
- L4 `export function cn`

### src/routeTree.gen.ts
_Generated route tree for TanStack Router_
- L160 `export interface FileRoutesByFullPath`
- L186 `export interface FileRoutesByTo`
- L212 `export interface FileRoutesById`
- L239 `export interface FileRouteTypes`
- L320 `export interface RootRouteChildren`
- L547 `export const routeTree`

### src/router.tsx
_Router factory_
- L5 `export const getRouter`

### src/routes/[.]lovable.oauth.consent.tsx
_OAuth consent flow for Lovable integration_
- L13 `export const Route`

### src/routes/[.well-known]/oauth-protected-resource.ts
_OAuth protected resource metadata endpoint_
- L12 `export const Route`

### src/routes/__root.tsx
_Root route with query client context and error boundaries_
- L78 `export const Route`

### src/routes/admin.tsx
_Administrator oversight page for club approvals_
- L24 `export const Route`

### src/routes/calendar.tsx
_Combined calendar showing all events from joined clubs_
- L23 `export const Route`

### src/routes/clubs/$clubId/announcements.tsx
_Club announcements management_
- L28 `export const Route`

### src/routes/clubs/$clubId/attendance.tsx
_RSVP to attendance tracking and finalization_
- L36 `export const Route`

### src/routes/clubs/$clubId/calendar.tsx
_Individual club calendar view_
- L21 `export const Route`

### src/routes/clubs/$clubId/chat.tsx
_Club group chat with banners_
- L23 `export const Route`

### src/routes/clubs/$clubId/data.tsx
_Custom data tables for club-specific tracking_
- L40 `export const Route`

### src/routes/clubs/$clubId/events.tsx
_Event creation and management for a club_
- L36 `export const Route`

### src/routes/clubs/$clubId/forms.tsx
_Form builder and response collection_
- L45 `export const Route`

### src/routes/clubs/$clubId/funds.tsx
_Club finances - income, expenses, dues tracking_
- L33 `export const Route`

### src/routes/clubs/$clubId/index.tsx
_Club dashboard - public welcome page or internal view_
- L25 `export const Route`

### src/routes/clubs/$clubId/leadership.tsx
_Role-based permissions and eligibility requirements_
- L46 `export const Route`

### src/routes/clubs/$clubId/members.tsx
_Membership management and join requests_
- L33 `export const Route`

### src/routes/clubs/$clubId/settings.tsx
_Club settings - metadata, meeting schedule, interests_
- L38 `export const Route`

### src/routes/clubs/new.tsx
_New club creation wizard with verification flow_
- L45 `export const Route`

### src/routes/index.tsx
_Main discovery page - recommended clubs and upcoming events_
- L33 `export const Route`

### src/routes/login.tsx
_Student and administrator login paths_
- L19 `export const Route`

### src/routes/mcp.ts
_MCP server endpoint_
- L12 `export const Route`

### src/routes/my-clubs.tsx
_Student's personal club list with priority ordering_
- L21 `export const Route`

### src/routes/notifications.tsx
_Centralized notification feed_
- L14 `export const Route`

### src/routes/onboarding.tsx
_New user onboarding - name, grade, interests, commitment_
- L28 `export const Route`

### src/routes/settings.tsx
_General account settings_
- L30 `export const Route`

### src/server.ts
_Server entry point with error page fallback_

### src/start.ts
_TanStack Start configuration with CSRF and auth middleware_
- L28 `export const startInstance`

### vite.config.ts
_Vite configuration_

### vitest.config.ts
_Vitest test configuration_
