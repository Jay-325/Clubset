# Phase 2 — Beta completion: design and scope

Date: 2026-11-20
Branch: `main` @ `b060eb4` (clean working tree)
Status: M1 implemented and green (2026-11-20). M2–M5 planned, not yet started.

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

### M2 — Dues lifecycle (frontend only)

- Add a "Set up dues" form on the Funds page: amount, due date, and either all
  active members or one member. Inserts into `dues` (already authorized for
  `manage_finances`).
- Invalidates `["club", clubId, "dues"]` so both Funds and Finance refresh.
- pgTAP: leader can insert; ordinary member cannot; cross-club insert denied.

### M3 — Data-table rows (frontend only)

- Add/edit/delete a row on the active table, with one input per column, a member
  picker for `member` columns, and dates/numbers typed by column type.
- Writes go to `data_table_rows` (already authorized for
  `manage_data_tables`); existing `invalidate()` refreshes the grid.
- pgTAP: leader can write; member cannot; a row inserted into another club's
  table is denied and invisible.

### M4 — Form response review (frontend only)

- Leaders (`manage_forms`) see a responses table for the active form: one row
  per responder, one column per question, plus submitted-at.
- "Download CSV" built in the client from the already-fetched rows.
- pgTAP: a leader reads responses for their club's form; a member reads only
  their own; a leader of another club reads none.

### M5 — Reliability states

- Error state on the main list queries (events, calendar, announcements, chat,
  forms, data, members) distinguishing failure from empty.
- `useApplyToClub` invalidates `["club-context", clubId]` and the club page
  shows the pending state.
- Dashboard: render recommendations from the shared result and exclude them
  from the general list when the recommended block is shown.
- Calendar: remove the unreachable Create Event modal and the hardcoded month;
  either wire month navigation or remove the inert arrows. Also fix the
  `bg-white`/`text-ink` block that ignores dark mode.
- Onboarding: wrap in `RequireAuth`, surface submit errors, sync state when the
  profile arrives late.

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
