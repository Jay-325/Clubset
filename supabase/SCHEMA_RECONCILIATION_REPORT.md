# Clubset — Schema / Migration Reconciliation Report

Status: **REPO-SIDE COMPLETE — LIVE VERIFICATION BLOCKED**
Project ref: `omcddzmtjqhrsxdxiewn`
Authoritative commit at time of review: `954be68` (working tree HEAD `b57b3be`, +1 "supabase skills" commit)
Report created: 2026-10-11

> This report was produced **before** making any schema changes, as required.
> It is intentionally explicit about what is known from the repository and what
> **cannot be determined without live database access**.

---

## 0. Hard blocker (P0 process blocker)

The Supabase MCP server configured for this workspace reports:

```
⚠ supabase  needs authentication
```

Live database inspection — required by Phase 1 (schema dump), Phase 2
(drift), Phase 3 (authorization testing), advisor review, storage checks, and
the end-to-end scenario — **cannot be performed until the MCP server is
authenticated.**

No schema change has been applied to the live database. No migration has been
replayed. This is deliberate: the repository is not a reliable proxy for the
live schema (see §3).

---

## 1. Repository inventory

- Framework: TanStack Start + React 19 + Vite + TypeScript + Tailwind, Supabase JS.
- App client: `src/lib/supabase/client.ts` (`getSupabaseClient()`), reads
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` **or** `VITE_SUPABASE_PUBLISHABLE_KEY`.
- The Lovable-generated clients under `src/integrations/supabase/*`
  (`supabase`, `supabaseAdmin`, auth middleware) are **not imported** by app code.
- Data access is centralized in `src/lib/queries.ts` and `src/lib/hooks/use-club.ts`;
  club sub-pages also call the client directly.
- Tests: one suite (`src/test/app-routing.test.tsx`) — routing smoke only. No
  security/RLS/RPC tests exist.
- `scripts/check-sql.ts` parses migrations with `libpg-query` (syntax only; it
  does **not** connect to a database and cannot detect missing columns/RPCs).
- `supabase/config.toml` contains only `project_id = "omcddzmtjqhrsxdxiewn"` —
  no `[auth]` or `[storage.buckets]` sections, so the `receipts` bucket is **not**
  declared as code and must exist via the dashboard/API.

### Environment

`.env` defines: `SUPABASE_PROJECT_ID`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`,
`VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`.
`.env.example` documents only `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`
(correct). **But** `src/routes/login.tsx` and `README.md` still reference the old
`VITE_SUPABASE_ANON_KEY` name. No service-role key is present in any `VITE_` var. ✅

---

## 2. Migration inventory (21 files)

Two timestamp series coexist:

| Series      | Files          | Nature                                                                                                |
| ----------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| `20260101*` | 14             | Hand-authored, descriptive names. Base 03/05 are **idempotent** (guarded with `do $$ if not exists`). |
| `20261003*` | 7 (UUID names) | Lovable-generated. Later, and **not idempotent** in general.                                          |

Per the task, the live DB migration history **stops at `20261003000536`**.

Applied-to-live (assumed by ordering ≤ 536), `20260101*`:
`...0001`–`...0009`, `...0100`, `...0200`, `...0210`, `...0220`, `...0300`, and `...0536`.

Unapplied (per task): `20261003000659`, `...0812`, `...0858`, `...0954`, `...1201`, `...1241`.

---

## 3. Critical drift hazard — `20261003000659` is NOT idempotent

`20260101000003_events_attendance.sql` (applied) and
`20261003000659_...sql` (unapplied) are the **same logical migration**, but:

- base `...0003` wraps enum/table/index/trigger creation in
  `do $$ if not exists ... $$` (safe to re-run);
- `...0659` issues raw `create type public.rsvp_status ...`,
  `create table public.rsvps`, etc. with **no guards**.

Therefore, if the live DB already contains `events`/`rsvps`/`attendance` (from
base `...0003`), **replaying `...0659` will error on the first
`create type public.rsvp_status`** (duplicate type) and abort.

This is precisely the "partially reflected migration" the task warns about.
`...0659` must **not** be blindly replayed. A guard or a reconciliation
migration is required.

> **Both** the applied base `...0003` **and** unapplied `...0659` contain the
> `finalize_attendance` column bug (§6.1), so the bug is live regardless.

---

## 4. What each unapplied migration does

| Migration | Change                                                                                                                                                                                        | Risk if applied as-is to current live                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `...0659` | Consolidated events/RSVP/attendance (+ security-invoker view).                                                                                                                                | **Duplicate-object error** if events schema already exists (see §3). Also still carries the `finalize_attendance` bug.                                       |
| `...0812` | `alter table public.dues enable row level security;`                                                                                                                                          | Safe. Fixes a live P0 (dues table fully readable/writable).                                                                                                  |
| `...0858` | Recreates `apply_table_template` as **SECURITY INVOKER** + revokes anon.                                                                                                                      | Safe. Removes a live privilege-escalation shortcut.                                                                                                          |
| `...0954` | Rewrites `check_eligibility` to authorize the caller; revokes anon on `check_eligibility`, `eligible_roles_for`, `application_review_packet`.                                                 | Safe. Fixes live P0 (any user could read any student's standing).                                                                                            |
| `...1201` | Notifications enum+table+RLS, notification triggers, `search_clubs` fix (commitment_hours + ORDER BY), `upcoming_events`, `admin_club_overview`, audit triggers, `receipts` storage policies. | Mostly safe, **but** `create type public.notification_type` / `create table public.notifications` are unguarded and may collide if a partial version exists. |
| `...1241` | Dynamic pass revoking `EXECUTE` from `public`/`anon` on **every** function in `public`, granting `authenticated`/`service_role`.                                                              | Safe and desirable. Closes the anon-executable advisor findings.                                                                                             |

---

## 5. Frontend RPC matrix (existence in live = UNKNOWN pending auth)

All calls originate from `src/lib/queries.ts` unless noted. "Repo def" = migration
that creates the function. "Live" is marked `?` until MCP auth.

| RPC                       | Called at          | Repo def                      | Live?              |
| ------------------------- | ------------------ | ----------------------------- | ------------------ |
| `activate_administrator`  | queries.ts:58      | 0001 / 0200                   | ?                  |
| `search_clubs`            | queries.ts:163,181 | 0009 / 0210 / 0220 / **1201** | ?                  |
| `create_club`             | queries.ts:256     | 0002                          | ?                  |
| `submit_club_for_review`  | queries.ts:311     | 0002                          | ?                  |
| `review_club`             | queries.ts:328     | 0002                          | ?                  |
| `review_membership`       | queries.ts:402     | 0002                          | ?                  |
| `upcoming_events`         | queries.ts:426     | **1201 only**                 | likely **MISSING** |
| `set_rsvp`                | queries.ts:495     | 0003 / 0659                   | ?                  |
| `veto_rsvp`               | queries.ts:532     | 0003 / 0659                   | ?                  |
| `finalize_attendance`     | queries.ts:547     | 0003 / 0659                   | ? (buggy)          |
| `admin_club_overview`     | queries.ts:603     | **1201 only**                 | likely **MISSING** |
| `correct_attendance`      | attendance.tsx:162 | 0003 / 0659                   | ?                  |
| `add_manual_attendance`   | attendance.tsx:177 | 0003 / 0659                   | ?                  |
| `attendance_stats`        | attendance.tsx:444 | 0003 / 0659                   | ?                  |
| `apply_table_template`    | data.tsx:189       | 0007 / 0858                   | ?                  |
| `propose_table_structure` | data.tsx:209       | 0007                          | ?                  |
| `publish_form`            | forms.tsx:219      | 0006                          | ?                  |
| `submit_form_response`    | forms.tsx:228      | 0006                          | ?                  |
| `add_transaction`         | funds.tsx:211      | 0005                          | ?                  |
| `mark_dues_paid`          | funds.tsx:349      | 0005                          | ?                  |
| `eligible_roles_for`      | leadership.tsx:186 | 0008 / 0954                   | ?                  |
| `review_application`      | leadership.tsx:230 | 0008                          | ?                  |
| `apply_for_role`          | leadership.tsx:243 | 0008                          | ?                  |

**P1:** `upcoming_events` and `admin_club_overview` are defined **only** in the
unapplied `...1201`. If live is truly at `...0536`, these two RPCs **do not
exist**, and the corresponding screens will fail at runtime. This must be
confirmed live and, if missing, remediated.

---

## 6. Findings (from repository + static analysis)

Severity: P0 = security/authorization/data integrity; P1 = core functionality.

### 6.1 P1 — `finalize_attendance` references a non-existent column

`20260101000003` (applied) line 487 and `20261003000659` line 456:

```sql
update public.attendance
set status = 'attended', finalized_by = auth.uid(), finalized_at = now()
where event_id = target_event
  and status = 'rsvp_pending'
  and attendance_finalized_at is null;   -- ← column is `finalized_at`
```

`attendance_finalized_at` does not exist ⇒ the RPC raises at runtime. Finalizing
attendance (and therefore finalized-attendance-driven eligibility) is broken.

### 6.2 P0 — Membership self-accept via direct table update

`20260101000002_clubs.sql` `memberships_update_leader`:

```sql
using (user_id = auth.uid() or has_club_permission(...) or is_club_admin(...))
with check (user_id = auth.uid() or has_club_permission(...) or is_club_admin(...))
```

`user_id = auth.uid()` satisfies the `with check`, so a student can update **their
own** membership row and set `status = 'active'` directly (bypassing
`review_membership`). Membership acceptance must not be self-service.

### 6.3 P0 — Founder can self-approve / arbitrarily change club status

`clubs_update_leader` (`20260101000002`):

```sql
using (founder_id = auth.uid() or has_club_permission(id,'manage_settings') or is_club_admin(id))
with check (school_id = public.current_school_id())
```

The founder matches `using` and only `school_id` is checked, so a founder can
`update clubs set status='approved'` directly, skipping administrator review.

### 6.4 P0 — `is_club_admin()` grants every same-school administrator control of every club

`20260101000002`:

```sql
... or (public.is_administrator() and exists (
  select 1 from public.clubs c where c.id = target_club and c.school_id = public.current_school_id()))
```

So any school administrator is treated as a full club administrator (finances,
membership, attendance, leadership, events) for **all** clubs in the school.
The PRD/prompt require distinguishing **school administrator** (oversight/approval)
from **linked club administrator** (assigned per club) via `club_administrators`.

### 6.5 P0 — `can_read_club()` exposes private club data to every same-school user

`20260101000002`:

```sql
select is_club_member(...) or is_club_admin(...) or exists (
  select 1 from public.clubs c where c.id = target_club and c.school_id = public.current_school_id())
```

`can_read_club` gates: `announcements`, `leadership_roles`, `role_assignments`,
`club_administrators`, `club_verifications`, `eligibility_requirements`,
`application_questions`, `transactions`, `budgets`, `forms`, `data_tables` /
columns / rows, and (in `...0659`) `events`. Any student in the same school can
therefore read private announcements, finances, events, data tables, etc. The
public welcome surface must be separated from private content.

### 6.6 P0 — Administrator activation has Ridgeway fallback + domain-only grant

`20260101000200` (applied):

- Auto-grants `account_type='administrator'` to **any** `@fairfieldschools.net` /
  `@fairfieldschools.org` address, even with **no allowlist row**.
- Falls back to `where s.slug = 'ridgeway'` to pick the school for such users.
  The prompt requires: allowlist remains authoritative; exact/normalized matching;
  no lookalike domains; **no Ridgeway fallback**; do not fabricate schools.

### 6.7 P0 — Founder bootstrap circular dependency

`leadership_roles_write` / `role_assignments_write` require
`has_club_permission(...,'manage_leadership')` or `is_club_admin`. A newly created
club's founder holds **no role** and is not a linked administrator, so the founder
cannot create leadership roles or assign leadership. There is no initial
founder/club-leader grant. This is the exact circular dependency the task names.

### 6.8 P0 — `review_application` misuses `is_review_supervisor` as authorization

`20260101000008`:

```sql
if not ( exists(role assignment for caller) or role_is_supervisor or has_club_permission(...) or is_club_admin(...) ) then raise ...
```

`role_is_supervisor` is a property of the **role**, not proof the **caller** is the
supervisor. Any signed-in user can review any application whose role has
`is_review_supervisor = true`. (Also `review_application` is SECURITY INVOKER, so
RLS would normally gate the `update`, but the status transition to `accepted`
plus automatic `role_assignments` insert then depends on RLS; the bug is the
authorization predicate.)

### 6.9 P0 — `apply_table_template` SECURITY DEFINER (live)

`20260101000007`: `security definer`, callable to write `data_table_columns`.
Fixed by unapplied `...0858` (→ security invoker). Live remains exposed.

### 6.10 P0 — `dues` row level security never enabled (live)

`20260101000005` creates `dues_select` / `dues_write` policies but never
`alter table public.dues enable row level security;`. Fixed by unapplied `...0812`.
Until then the `dues` table is fully readable/writable by any signed-in user.

### 6.11 P0 — `check_eligibility` leaks any student's standing (live)

`20260101000008` `check_eligibility(role, student_id)` and `eligible_roles_for(student_id)`
are SECURITY DEFINER and take an arbitrary `student_id`. Fixed by unapplied `...0954`.

### 6.12 P1 — Anonymous-executable SECURITY DEFINER functions

`...0536` (applied) already revoked anon on 5 core helpers, but many other
helpers (`create_club`, `review_club`, `set_rsvp`, `add_transaction`, …) still
default to `PUBLIC`/`anon` EXECUTE until unapplied `...1241`. Advised to apply.

### 6.13 P1 — Notification triggers/functions absent in live

All `notify_*` functions and their triggers live **only** in unapplied `...1201`.
So join requests, acceptance, RSVPs, announcements, etc. currently produce **no**
notifications in live.

### 6.14 P1 — Onboarding cannot set `school_id`

`handle_new_auth_user` only assigns `school_id` when the signup email matches an
`admin_allowlist` row. Normal students get `school_id = null`. The hardened
`profiles_update_self_safe` policy (`20260101000300`) forbids changing
`school_id`. There is no RPC to assign a student's school, so a normal student
cannot complete school-scoped onboarding. Needs a safe, domain→school assignment
path (no Ridgeway hardcoding).

### 6.15 P2 — RLS init-plan / perf advisories

`profiles_update_self_safe` uses correlated `select ... from public.profiles`
subqueries in its `with check`; flagged class of "auth RLS initialization plan"
warnings. Unindexed FKs likely remain (e.g., `club_administrators.administrator_id`,
`role_assignments.user_id` is covered, etc.). Address **after** correctness.

### 6.16 P2 — Storage receipts bucket not declared as code

`config.toml` has no `[storage.buckets]`, and `...1201` states the bucket "is
created through the storage API". The `receipts` bucket must be verified to
exist and be **private** live before claiming receipt uploads work. The frontend
currently has **no** upload/download code — it only displays `receipt_path`.

### 6.17 P3 — Doc/UI drift

`README.md` and `login.tsx` still tell users to configure `VITE_SUPABASE_ANON_KEY`
instead of `VITE_SUPABASE_PUBLISHABLE_KEY`; `README.md` references the removed
`ms.rivera@ridgeway.edu` seed.

---

## 7. Ridgeway residue to remove (per task)

- `20260101000100` — deletes `ms.rivera@ridgeway.edu`, inserts allowlist row under `slug='ridgeway'`.
- `20260101000200` — denylist of `ms.rivera@ridgeway.edu`; Ridgeway fallback in `activate_administrator`.
- `supabase/seed.sql` — seeds `Ridgeway High School` / `ridgeway.edu` + `arinjaypal@gmail.com` allowlist.
- `README.md` — instructs `ms.rivera@ridgeway.edu`.
  These are **already-applied history**; a corrective migration (not an edit of applied
  files) is required, plus a decision on the development seed.

---

## 8. Pending live verification checklist (requires MCP auth)

1. Dump `supabase_migrations.schema_migrations`; confirm the applied set and exact stop point.
2. Enumerate live tables/columns/enums/functions/triggers/policies/grants.
3. Confirm whether `events`/`rsvps`/`attendance` already exist (decides whether `...0659` can apply at all).
4. Confirm existence + signatures of every RPC in §5, especially `upcoming_events`, `admin_club_overview`, `propose_table_structure`, `search_clubs`.
5. Confirm `dues` RLS state; `apply_table_template` security mode; `check_eligibility` grants.
6. Confirm `receipts` bucket exists and is private; inspect storage policies.
7. Run Supabase security advisors; record all findings.
8. Determine the real school(s) present; identify any Ridgeway rows to migrate (without dropping data).
9. Determine how live `events` table defines `attendance_finalized`/`finalized_at` (confirm §6.1).

---

## 9. Recommended corrective plan (not yet executed)

1. **Authenticate MCP**, complete §8, then finalize this report with live facts.
2. Produce a **reconciliation migration** that makes `...0659` unnecessary/safe
   (guarded), rather than replaying the unguarded file.
3. Apply the already-correct hardening migrations (`...0812`, `...0858`, `...0954`,
   `...1241`) after reconciling collisions; ensure `...1201` types/tables are
   created guardedly.
4. New corrective migrations for §6.1–6.8, §6.14, §6.17 (idempotent, small):
   `finalize_attendance` column; membership update policy; club status transition
   guard; scope `is_club_admin` to linked admins; split public vs private
   `can_read_club`; rewrite `activate_administrator` (allowlist-authoritative, no
   Ridgeway fallback); founder bootstrap grant; `review_application` caller check.
5. Add RLS/RPC security tests (Supabase test harness) and expand the TS suite.
6. Re-run typecheck/lint/test/check:sql, advisors, and the end-to-end scenario.

---

## 10. Explicit statement

No live database change has been made. No migration has been replayed. No feature
has been marked "working". Every §6 item is a static/repository finding pending
live confirmation. Production readiness is **not** claimed.
