# Phase 2 — Beta completion: design and scope

Date: 2026-11-20
Branch: `main` @ `b060eb4` (clean working tree)
Status: M1 implemented and green (2026-11-20). M2 implemented and green (2026-11-21). M3 implemented and green (2026-11-21). M4 implemented and green (2026-11-21). M5 implemented and green (2026-11-21). Phase 2 complete.

## Intent

Make the three role experiences genuinely usable end-to-end for a controlled
student beta, without rebuilding working features, without new dependencies,
and without weakening the Postgres authorization model.

Phase 1 (club creation/verification, founder provisioning, attendance
finalization, form-write bypass, role-assignment integrity, same-school profile
visibility) is complete, applied to the hosted project, and green
(52 pgTAP + 124 vitest).

## What the code actually does today

Baseline verified this session:

- `npm run typecheck` pass; `npm run test` 124/124; `supabase test db` 52/52.
- Backend inventory: 15 tables + 6 views of real feature surface, 45+ RPCs.
  RLS already authorizes dues writes, data-table row writes, and form-response
  reads for the correct roles. Several gaps below need **no migration**.

## Findings, ordered by whether they block a beta

### Blockers (a real student/leader/admin cannot complete the workflow)

1. **Club creation is unreachable.** `/clubs/new` exists but nothing in `src/`
   links to it. A student cannot start a club, so the entire Phase 1 lifecycle
   (create → 3-student verify → admin approve) cannot be entered.
2. **Administrator dashboard is unreachable.** No route in the app links to
   `/admin`. An activated administrator can never approve a club; every club
   stays `awaiting_administrator_verification` forever.
3. **Dues cannot be created.** `funds.tsx` and `finance.tsx` both tell the user
   to "set them up in the Funds tab", but neither has a creation form.
   `mark_dues_paid()` refuses amount ≤ 0, so the dues/income loop is dead.
4. **Data-table rows cannot be created or edited.** `data.tsx` creates a table
   from a template and renders rows; there is no add/edit/delete row path. The
   feature's stated purpose (track attendance, signups, volunteer hours) fails.
5. **Form responses are invisible to leaders.** `forms.tsx` collects responses
   and uses them only to detect "you already responded". No response list, no
   export, no close action. RLS already lets `manage_forms` holders read all of
   them — this is frontend-only.
6. **Leader quick actions 404.** `quickActions()` emits
   `/clubs/{id}/events/new`, `/forms/new`, `/data/new`; none of those routes
   exist. It also emits `?tab=requests` and `?new=expense`, which those pages do
   not read.
7. **RSVP notification links 404.** The `notify_on_rsvp` trigger writes
   `link_path = /clubs/{club}/events/{event}`, but there is no event-detail
   route.

### Correctness bugs (visible, wrong state)

8. **Apply-to-join leaves the page stale.** `useApplyToClub` invalidates
   `["club"]`/`["clubs"]`, not `["club-context", clubId]`, so the Apply button
   remains after a successful request.
9. **Recommendations are always empty.** `useRecommendedClubs` and
   `useClubSearch` share one cache key, so the dashboard subtracts the list from
   itself.
10. **Global calendar Create Event is permanently disabled** (`manageableClubs`
    is never populated), the month header is hardcoded "January 2026", and the
    prev/next buttons have no handlers.
11. **My Clubs cards are not links** — the pin toggle is the only interaction.
12. **Onboarding has no `RequireAuth` and no error handling** on submit; a
    failed save is an unhandled rejection with no message.
13. **Most queries have no error state.** A failed read renders as an empty
    list ("No events yet"), which reads as data loss rather than an error.
14. **`Finance` and `Funds` both appear in every member's club nav** and
    duplicate the same `club_finances`/`transactions`/`dues` reads. Finance is a
    leader planning surface.
15. **`notification-dropdown.tsx` is dead code** (never imported).

### Known-incomplete, deliberately deferred

Receipt upload (the `receipts` bucket is never created by a migration), chat
banner creation, chat message moderation, editing a role's permissions after
creation, eligibility-requirement configuration, email notifications, event
edit/cancel, and CSV export beyond forms.

## Approaches considered

**A. Finish every named gap.** Rebuild data tables, dues, forms, receipts,
chat moderation, and eligibility configuration. Rejected: far beyond a beta
slice, and it invents product surface (receipt bucket, moderation UI) that was
never wired or designed.

**B. Fix the blockers and the wrong-state bugs only, reusing existing RPCs and
RLS (chosen).** Every fix lands in a surface that already exists and is already
authorized server-side. Four of the six blockers are frontend-only. The scope is
the smallest set that lets a student create and join a club, a leader run
membership/events/attendance/dues/data/forms/leadership, and an administrator
approve a club — with correct states on the way through.

**C. Blockers only, no reliability pass.** Leaves "Apply to join" telling the
student to apply again and errors that look like empty data, which would waste
beta testers' reports on already-known noise.

## Design

Milestones are ordered so each one is independently shippable and no later
milestone depends on an unapproved one. No new dependencies; no new tables.

### M1 — Reachability and routing integrity

- `AppShell`: add an **Admin** nav item, rendered only when
  `profile.account_type === "administrator"`.
- Dashboard + My Clubs: add a **Create a club** entry point to `/clubs/new`.
- `managementSections`: keep Funds, gate **Finance** behind `manage_finances`
  (it is a leader planning surface; its actions are already gated).
- `quickActions`: point at routes that exist, and only emit an action whose
  target page implements the corresponding inline create flow.
- `my-clubs.tsx`: make each card a link to its club page.
- Fix the RSVP notification `link_path` with one additive migration replacing
  `notify_on_rsvp` (existing trigger body, path corrected to
  `/clubs/{club}/events`).
- Delete the unused `notification-dropdown.tsx`.
- Guardrail test: assert every path produced by `managementSections` and
  `quickActions` is a real route path, so this class of bug cannot return.

### M2 — Dues lifecycle (frontend only) — COMPLETE (2026-11-21)

- Added a "Set up dues" form on the Funds page (`src/routes/clubs/$clubId/funds.tsx`): amount (> 0), due date (optional), and targeting of either all active members or one member.
- Inserts into `dues` via direct table write, authorized by the existing RLS `dues_write` policy (`manage_finances` or club admin). No new migration needed — RLS already permits this.
- Skips members who already have a dues record (unique `(club_id, user_id)` constraint).
- Invalidates `["club", clubId, "dues"]` on success so both Funds and Finance refresh.
- pgTAP (`supabase/tests/dues_lifecycle.sql`): leader can insert; ordinary member denied (42501); cross-club insert denied (42501); negative amount rejected (23514); new record defaults to `unknown` status.
- Statuses: Paid / Not Paid / Unknown (existing `dues_status` enum, no new concepts).


### M3 — Data-table rows (frontend only) — COMPLETE (2026-11-21)

- Added `AddRowDialog`, `EditRowDialog`, and `DeleteRowDialog` components to
  `src/routes/clubs/$clubId/data.tsx`, plus an "Add row" button in the table
  header and edit/delete action buttons on each row.
- Inputs are generated dynamically from column definitions: `text` → text input,
  `number` → number input, `date` → date picker, `boolean` → yes/no select,
  `member` → club member picker, `event` → club event picker. Required fields
  are marked with `*` and validated client-side before submission.
- The "Member" column maps to `row.member_id`; all other columns are stored in
  the `data` jsonb bag.
- Writes go to `data_table_rows` via direct table insert/update/delete,
  authorized by the existing RLS `data_table_rows_write` policy
  (`manage_data_tables` or club admin). No new migration needed.
- `invalidate()` refreshes `data-table-columns`, `data-table-rows`,
  `data-table-member-names`, and `data-tables` after every mutation.
- pgTAP (`supabase/tests/data_table_rows.sql`, 8 tests): leader can insert,
  update, and delete rows; member without `manage_data_tables` denied (42501);
  cross-club insert denied (42501); row cannot be re-parented to another club's
  table (42501); insert into non-existent table denied (42501).

### M4 — Form response review (frontend only) — COMPLETE (2026-11-21)

- Added a **Responses** table to the active form card (`src/routes/clubs/$clubId/forms.tsx`),
  visible only to leaders with `manage_forms`: one row per responder (submitter name,
  submitted-at), plus a "View" button to inspect individual submissions.
- Added a **Response details dialog** showing question-by-question answers with
  human-friendly labels (`QUESTION_TYPE_LABELS`), handling all 7 question types
  (short_answer, long_answer, multiple_choice, checkbox, yes_no, number, date),
  and showing "—" for unanswered questions.
- Added **client-side CSV export** (`Download CSV` button): RFC 4180 escaping
  (commas, quotes, newlines, Unicode), formula-injection protection (tab prefix
  for fields starting with `=`, `+`, `-`, `@`), predictable filename
  (`{form-title}_responses.csv`), empty-set handling, and toast feedback.
- Responses query uses embedded select (`.select("*, profiles(full_name)")`) to
  resolve submitter names in one request, matching the existing `useClubMembers`
  pattern.
- All writes/reads go through the authorized Supabase client; RLS
  `form_responses_select` already enforces: member reads own response only,
  `manage_forms` holder reads all responses for their club's forms,
  cross-club access denied. No new migration needed.
- pgTAP (`supabase/tests/form_response_review.sql`, 4 tests): leader reads all
  responses for their club's form; member reads only their own; member cannot
  read other members' responses; cross-club leader denied.

### M5 — Reliability states — COMPLETE (2026-11-21)

- **`useApplyToClub` invalidation** (`src/lib/queries.ts`): now also invalidates
  `["club-context", clubId]` on success, so the club page re-fetches permissions
  and the Apply button reflects the new membership state without a reload.
- **`useReviewMembership` invalidation** (`src/lib/queries.ts`): mutation input
  now carries `clubId`; on success it invalidates `["club-context", clubId]`
  so the members page reflects accept/decline decisions immediately.
- **Onboarding reliability** (`src/routes/onboarding.tsx`): wrapped in
  `RequireAuth`; submit errors are caught and surfaced in a user-facing message
  instead of an unhandled rejection.
- **Dashboard recommendations** (`src/routes/index.tsx`): `recommended` now
  reads directly from `recommendations.data` (was subtracting itself from the
  shared search result, always yielding empty); recommended clubs are excluded
  from the general search list when the recommendations block is shown.
- **Global calendar** (`src/routes/calendar.tsx`): removed the unreachable
  Create Event modal and button (`manageableClubs` was never populated);
  replaced hardcoded "January 2026" with the current month; removed inert
  prev/next arrows; replaced `bg-white`/`text-ink` with dark-mode-safe
  `bg-background`/`text-foreground`.
- **RSVP notification link path** (`supabase/migrations/20261121000000_*.sql`):
  `notify_on_rsvp()` now writes `link_path = /clubs/{club}/events` (the events
  list page) instead of the non-existent `/clubs/{club}/events/{event}` detail
  route. Authorization and notification body are unchanged. pgTAP
  (`supabase/tests/rsvp_notification_link.sql`, 4 tests): link points to the
  events list page, never to a non-existent detail route, type is `rsvp`,
  body mentions the event.

## Non-goals

- No multi-school work.
- No realtime/polling.
- No change to RLS predicates or function grants other than M1's `notify_on_rsvp`
  replacement, which keeps the same authorization and only changes a URL string.
- No commit, push, or deploy in this session.

## Acceptance criteria

Each milestone is done when: typecheck, vitest, `check:sql`, build, and lint
(no new classes) pass; the new pgTAP tests pass locally; and the workflow
succeeds for its role while a denied role gets a server-side rejection.

Beta-ready when: a student can create a club, verify one, join one, RSVP, and
see their attendance; a leader can review membership, create events, take
attendance, create dues and mark them paid, add data rows, read form responses,
and manage leadership; an administrator can find `/admin` and approve or revoke
a club.
