# Clubset — schema, RLS & index audit

**Date:** 2026-10-24
**Scope:** `supabase/migrations/*.sql`, cross-checked read-only against the live
project (`omcddzmtjqhrsxdxiewn`) via catalog queries.
**Rules applied:** `supabase-postgres-best-practices` — `security-rls-basics`,
`security-rls-performance`, `security-privileges`, `query-missing-indexes`,
`query-composite-indexes`, `query-partial-indexes`,
`schema-foreign-key-indexes`, `schema-constraints`.
**Changes made:** none. No DDL, no migration edits, no writes. Every "fix"
below is a proposal.

Severity: **Critical** = exploitable now, or a core flow that cannot complete.
**High** = wrong authorization model, broken feature path, or a hot query that
cannot use any index. **Medium** = defence-in-depth and data-hygiene gaps.
**Low** = index hygiene, operability.

---

## 1. Summary

| # | Finding | Severity | Where |
|---|---------|----------|-------|
| C1 | Membership self-accept still in the repo; live is patched manually | Critical | `20260101000002_clubs.sql:424` |
| C2 | `can_read_club()` grants every student in the school access to club financials and data tables | Critical | `20260101000002_clubs.sql:288` |
| C3 | `finalize_attendance()` references a non-existent column | Critical | `20260101000003_events_attendance.sql:487` |
| C4 | `attendance_corrections` has no INSERT policy → correction flow always 42501 | Critical | `20260101000003_events_attendance.sql:714` |
| H1 | `review_application()` uses a *role property* as caller authorization | High | `20260101000008_leadership.sql:305` |
| H2 | `review_application()` cannot update the application row at all | High | `20260101000008_leadership.sql:478` |
| H3 | `form_responses` has no UPDATE policy but `submit_form_response()` upserts | High | `20260101000006_forms.sql:173` |
| H4 | `apply_table_template()` always raises (ambiguous `template_key`) | High | `20260101000007_data_tables.sql:116` |
| H5 | `record_audit`, `notify_user`, `notify_club_leaders` are callable by any signed-in user | High | grants, live-verified |
| H6 | 24 policies call `auth.uid()` per row instead of `(select auth.uid())` | High | many |
| H7 | `search_clubs` uses `ILIKE '%…%'`; the GIN `tsvector` index cannot serve it | High | `20261003001201:…`, `src/lib/queries.ts:167` |
| H8 | 30 foreign keys have no index | High | catalog |
| M1 | `is_club_admin()` gives every school administrator control of every club | Medium | `20260101000002_clubs.sql:229` |
| M2 | `profiles_select_school` exposes every student's email to every student | Medium | `20260101000001_core_schema.sql:294` |
| M3 | `clubs_update_leader` WITH CHECK only asserts `school_id` | Medium | `20260101000002_clubs.sql:330` |
| M4 | `leadership_applications` INSERT policy allows any `status` | Medium | `20260101000008_leadership.sql:474` |
| M5 | Personal address hard-coded in a migration | Medium | `20261019000200_authorize_administrator.sql` |
| M6 | No `force row level security` anywhere | Medium | `20260101000001_core_schema.sql:287` |
| M7 | `clubs_fields_idx` cannot serve `filter_field = any(c.fields)` | Medium | `20260101000002_clubs.sql` |
| L1 | `profiles_email_idx` is functional (`lower(email)`), queries are not | Low | `20260101000001_core_schema.sql:79` |
| L2 | `admin_allowlist_lookup_idx` does not match the actual lookup | Low | `20260101000001_core_schema.sql:103` |
| L3 | Index creation is not `CONCURRENTLY` | Low | all migrations |
| L4 | No statement-timeout guidance in the repo | Low | — |

---

## 2. Critical

### C1 — Membership self-accept is still in the repo (live is patched by hand)

`supabase/migrations/20260101000002_clubs.sql:424-435`

```sql
create policy memberships_update_leader on public.memberships
  for update
  using (
    user_id = auth.uid()
    or public.has_club_permission(club_id, 'manage_membership')
    or public.is_club_admin(club_id)
  )
  with check ( ... same ... );
```

`user_id = auth.uid()` satisfies both USING and WITH CHECK, so a student can
`PATCH /rest/v1/memberships?id=eq.<own row>` with `{"status":"active"}` and
admit themselves to any club. RLS is the only gate, so nothing else stops it.

**Live is safe, and that is the problem.** The live policy is:

```
memberships_update_leader | UPDATE | {authenticated}
  qual:       has_club_permission(club_id,'manage_membership') OR is_club_admin(club_id)
  with_check: has_club_permission(club_id,'manage_membership') OR is_club_admin(club_id)
```

There are also three objects that exist **only in the live database** and in no
migration:

* function `guard_membership_self_update()`
* trigger `memberships_guard_self_update` on `public.memberships`
* policy `memberships_leave_self` (`UPDATE`, self, `pending|active → removed`)

Consequences: `supabase db reset`, CI, and any new environment are vulnerable;
`supabase migration list` reports no difference; nobody reviewing the repo can
see the fix.

**Fix:** add one migration that reproduces the live state exactly — recreate
`memberships_update_leader` without the self branch, add `memberships_leave_self`
so "leave club" still works, and add the guard trigger. Then the repo and
production agree.

---

### C2 — `can_read_club()` grants school-wide read of private club data

`supabase/migrations/20260101000002_clubs.sql:288-302`

```sql
select public.is_club_member(target_club)
    or public.is_club_admin(target_club)
    or exists (select 1 from public.clubs c
               where c.id = target_club
                 and c.school_id = public.current_school_id());
```

The third branch makes the helper true for **every signed-in user in the
school**, and the helper is the SELECT predicate for:

| Table | Policy | Line |
|-------|--------|------|
| `transactions` | `transactions_select` | `20260101000005_finances.sql:156` |
| `budgets` | `budgets_select` | `20260101000005_finances.sql:185` |
| `events` | `events_select` | `20260101000003_events_attendance.sql:616` |
| `forms`, `form_questions` | `forms_select`, `form_questions_select` | `20260101000006_forms.sql:196, 216` |
| `data_tables`, `data_table_columns`, `data_table_rows` | `*_select` | `20260101000007_data_tables.sql:217, 229, 257` |
| `announcements` | `announcements_select` | `20260101000002_clubs.sql:439` |
| `club_administrators` | `club_admins_select` | `20260101000002_clubs.sql:351` |
| `leadership_roles`, `role_assignments` | `*_select` | `20260101000002_clubs.sql:385, 394` |
| `club_verifications` | `club_verifications_select` | `20260101000002_clubs.sql:362` |
| `chat_banners` | `chat_banners_select` | `20260101000004_chat.sql:62` |
| `application_questions` | `application_questions_select` | `20260101000008_leadership.sql:489` |

So any student can read every club's ledger and budget, every club's
`data_table_rows` (PRD 26-29 — that is where member-collected PII lands), and
every leadership role assignment.

**Fix:** split the predicate. Keep a `can_discover_club()` (school-wide) for the
public welcome page, `clubs_select_school`, published forms, and school-wide
announcements; use a member/admin-only `can_read_club()` everywhere else. This
is the single highest-leverage security change in the schema.

---

### C3 — `finalize_attendance()` references a column that does not exist

`supabase/migrations/20260101000003_events_attendance.sql:487`

```sql
update public.attendance
set status = 'attended', finalized_by = auth.uid(), finalized_at = now()
where event_id = target_event
  and status = 'rsvp_pending'
  and attendance_finalized_at is null;   -- column is `finalized_at`
```

Verified: the live function body still contains `attendance_finalized_at`, and
`public.attendance` has no such column → `42703 undefined_column` on every call.

Effect: final attendance can never be produced, which means `attendance_stats`,
eligibility (`check_eligibility` / `eligible_roles_for`, PRD 34 / 53.14) and
leadership review all evaluate against zero finalized attendance.

**Fix:** use `finalized_at` (or drop the predicate — the `status` filter already
covers it). One-line migration.

---

### C4 — `attendance_corrections` has no INSERT policy; the correction flow always fails

`supabase/migrations/20260101000003_events_attendance.sql`

* table `188-203`, `alter table … enable row level security` at `609`
* only policy: `attendance_corrections_select` at `714-724`

`correct_attendance()` inserts at `:363` and `veto_rsvp()` writes the same table,
and both are `security invoker` — so RLS applies to the caller. With no INSERT
policy, every correction and every veto raises `42501`, including for club
leaders and administrators.

This breaks the PRD's signature flow (Event → RSVP → Expected → Meeting →
Correction → Final Attendance).

**Fix:** add an INSERT policy gated on the event's club:

```sql
create policy attendance_corrections_insert_staff on public.attendance_corrections
  for insert with check (
    exists (select 1 from public.events e
            where e.id = attendance_corrections.event_id
              and (public.has_club_permission(e.club_id,'manage_attendance')
                   or public.is_club_admin(e.club_id)))
  );
```

Add a matching audit note that `corrected_by`/`user_id` are set by the function,
not trusted from the client.

---

## 3. High

### H1 — `review_application()` treats a role property as caller authorization

`supabase/migrations/20260101000008_leadership.sql:305-320`

```sql
select lr.is_review_supervisor into role_is_supervisor
from public.leadership_roles lr where lr.id = app.role_id;

if not (
  exists (select 1 from public.role_assignments ra
          where ra.role_id = app.role_id and ra.user_id = auth.uid())
  or role_is_supervisor                     -- <-- property of the ROLE, not the caller
  or public.has_club_permission(app.club_id, 'manage_leadership')
  or public.is_club_admin(app.club_id)
) then raise exception ...
```

`is_review_supervisor` says "this role is supervised", not "you supervise it".
For any role flagged true the whole gate passes for every authenticated user.

Today the damage is contained by table RLS (`role_assignments_write` needs
`manage_leadership`/`is_club_admin`; `leadership_applications` has no reviewer
UPDATE policy), so the function returns `null` or raises a `role_assignments`
permission error rather than escalating. But the gate itself is wrong, and it
becomes a direct escalation the moment either policy is widened. It also makes
the RPC fail in a confusing, order-dependent way.

**Fix:** delete the `or role_is_supervisor` branch. Supervision is already
expressed by a `role_assignments` row on the supervising role — model that
explicitly if needed.

---

### H2 — `review_application()` cannot update the application row

`supabase/migrations/20260101000008_leadership.sql:478-481`

```sql
create policy leadership_applications_update_self on public.leadership_applications
  for update
  using (applicant_id = auth.uid() and status = 'draft')
  with check (applicant_id = auth.uid() and status = 'draft');
```

Two failures from one policy:

1. A reviewer is not the applicant, so the `UPDATE` at `:322-329` matches zero
   rows. `result` is `null`, the function returns `null`, and because the
   `accept` branch at `:332-336` runs afterwards, the `role_assignments` insert
   still happens. Net result: the role is granted, the application stays
   `submitted`, and `reviewed_by`/`reviewed_at`/`review_notes` are never written.
2. An applicant cannot move their own application out of `draft` (submit) or
   withdraw it, because WITH CHECK requires `'draft'`.

**Fix:** two policies —

```sql
-- applicant may submit / withdraw their own application
create policy leadership_applications_update_applicant on public.leadership_applications
  for update
  using (applicant_id = auth.uid())
  with check (applicant_id = auth.uid()
              and status in ('draft','submitted','withdrawn'));

-- reviewer may decide
create policy leadership_applications_update_reviewer on public.leadership_applications
  for update
  using (public.has_club_permission(club_id,'manage_leadership')
         or public.is_club_admin(club_id))
  with check (public.has_club_permission(club_id,'manage_leadership')
         or public.is_club_admin(club_id));
```

and move the `role_assignments` insert behind a check that the UPDATE actually
affected a row (`if result.id is null then raise …`).

---

### H3 — `form_responses` has no UPDATE policy but `submit_form_response()` upserts

`supabase/migrations/20260101000006_forms.sql:173-178`

```sql
insert into public.form_responses (form_id, user_id, answers)
values (target_form, auth.uid(), response_answers)
on conflict (form_id, user_id) do update
  set answers = excluded.answers,
      submitted_at = now()
returning * into result;
```

Policies at `:242-256` are SELECT and INSERT only. `(form_id, user_id)` is
unique, so the *second* submission — the normal edit path — always takes the
`do update` branch, which requires an UPDATE policy → `42501`.

**Fix:** add

```sql
create policy form_responses_update_self on public.form_responses
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

(the function already re-checks `status = 'published'` and club membership).

---

### H4 — `apply_table_template()` always raises

`supabase/migrations/20260101000007_data_tables.sql:116` and
`20261003000858_72b0e5f9-fcc4-4941-adc7-a35be672f841.sql:48`

```sql
update public.data_tables
   set template_key = template_key, updated_at = now()
 where id = target_table;
```

The function parameter is also named `template_key`.
`plpgsql.variable_conflict` is `error` on this project (verified:
`pg_settings` → `setting = error`, `source = default`), so the right-hand
identifier is ambiguous between the parameter and the column and the statement
raises `42702 column reference "template_key" is ambiguous`. The whole function
aborts, so neither the column insert nor the table update persists.

**Fix:** qualify the parameter — `set template_key = apply_table_template.template_key`
— or rename the parameter to `p_template_key` throughout both definitions.

---

### H5 — Audit-log and notification writers are callable by any signed-in user

Verified live:

| function | `security definer` | `anon` EXECUTE | `authenticated` EXECUTE |
|----------|:--:|:--:|:--:|
| `record_audit` | yes | no | **yes** |
| `notify_user` | yes | no | **yes** |
| `notify_club_leaders` | yes | no | **yes** |

None of these is a policy predicate, so `authenticated` does not need EXECUTE.
As it stands any signed-in user can:

* `POST /rest/v1/rpc/record_audit` with arbitrary `action` / `entity_type` /
  `entity_id` / `details` → forge rows in `audit_logs`, which is the table the
  app treats as the record of what happened;
* `POST /rest/v1/rpc/notify_user` with an arbitrary `user_id`, `title`, `body`
  and `link` → inject notifications into any inbox, which is a ready-made
  phishing surface (`link` is rendered in the app shell).

**Fix:** `revoke execute on function public.record_audit(...), public.notify_user(...),
public.notify_club_leaders(...) from authenticated;` and let only the trigger
owner / `service_role` call them. If a client genuinely needs to notify, add a
narrow RPC that derives the recipient server-side (e.g. "notify the leaders of
club X") rather than taking `user_id` from the caller.

---

### H6 — 24 policies evaluate `auth.uid()` once per row

Live `pg_policies` scan, `qual like '%auth.uid()%'`:

```
admin_verifications.admin_verifications_select_own
announcements.announcements_delete
attendance.attendance_select
attendance_corrections.attendance_corrections_select
club_verifications.club_verifications_delete
club_verifications.club_verifications_select
clubs.clubs_update_leader
dues.dues_select
event_preferences.event_preferences_own
form_responses.form_responses_select
leadership_applications.leadership_applications_select
leadership_applications.leadership_applications_update_self
memberships.memberships_leave_self
memberships.memberships_select
messages.messages_delete_moderator
messages.messages_select_member
notifications.notifications_select_own
notifications.notifications_update_own
profiles.profiles_select_school
profiles.profiles_update_self_safe
role_messages.role_messages_select_party
role_messages.role_messages_update_recipient
rsvps.rsvps_select
rsvps.rsvps_update_own
```

`auth.uid()` is `stable`, not `immutable`; the planner will not hoist it out of
the per-row qual on its own, so it is re-evaluated for every candidate row, and
each evaluation reads the request JWT.

The worst offender is `profiles_update_self_safe`
(`20260101000300_harden_profiles_security.sql:11-22`): three uncorrelated
subqueries on `profiles` per candidate row.

**Fix:** mechanically wrap in `(select auth.uid())`. This is a pure
rewrite of `qual`/`with_check` — no behaviour change.
**NOT MEASURED** (no production-scale data in this project; the win scales with
row count).

---

### H7 — `search_clubs` cannot use its search index

The only text index on `clubs` is:

```
clubs_name_search_idx: gin (to_tsvector('english', name || ' ' || description))
```

but `search_clubs` filters (`20261003001201_…`, latest definition, and
`20260101000220_fix_search_clubs_orderby.sql`):

```sql
or c.name ilike '%' || search_text || '%'
or c.description ilike '%' || search_text || '%'
```

A leading-wildcard `ILIKE` cannot be answered by a GIN `tsvector` index. The
planner falls back to a sequential scan of `clubs` for every debounced
keystroke, and the GIN index is pure write cost with no reader.

`useMemberSearch` (`src/lib/queries.ts:167-183`) has the same shape against
`profiles.full_name`, which has **no index at all**.

**Fix:** enable `pg_trgm` and add trigram indexes that match the query:

```sql
create extension if not exists pg_trgm;
create index if not exists clubs_name_trgm_idx on public.clubs using gin (name gin_trgm_ops);
create index if not exists clubs_description_trgm_idx on public.clubs using gin (description gin_trgm_ops);
create index if not exists profiles_full_name_trgm_idx on public.profiles using gin (full_name gin_trgm_ops);
```

then drop `clubs_name_search_idx` unless a query is switched to `tsquery`.
Each index names its query in the migration comment, per `AGENTS.md` §3.
**NOT MEASURED** — the tables are effectively empty in this project; the
argument is access-pattern, not a timing.

---

### H8 — 30 foreign keys have no index

Verified live: `pg_constraint` FKs where no valid index has that column as its
leading key. The ones on read/write hot paths:

| table.column | why it matters |
|---|---|
| `transactions.created_by` | delete of a profile scans the ledger |
| `dues.user_id`, `dues.transaction_id` | `useMyDues` filters by user |
| `form_responses.user_id` | the unique key leads with `form_id` |
| `leadership_applications.applicant_id` | "my applications" per user |
| `attendance_corrections.attendance_id` | correction lookup |
| `role_assignments.user_id`, `.assigned_by` | permission checks per request |
| `events.created_by` | cascade on profile delete |
| `clubs.founder_id` | `clubs_update_leader` |
| `announcements.author_id` | feed join |
| `notifications.school_id` | the only unbounded table |

Also unindexed: `admin_allowlist.created_by`, `admin_verifications.allowlist_id`,
`admin_verifications.school_id`, `attendance.finalized_by`,
`attendance_corrections.corrected_by`, `chat_banners.created_by`,
`club_administrators.administrator_id`, `.linked_by`, `club_verifications.user_id`,
`data_table_rows.created_by`, `data_tables.created_by`, `dues.marked_paid_by`,
`event_preferences.club_id`, `forms.created_by`, `forms.target_table_id`,
`leadership_applications.reviewed_by`, `role_messages.club_id`, `.sender_id`.

Each of these is the subject of an `ON DELETE CASCADE`/`SET NULL`, and the
cascade path is a sequential scan of the child table.

**Fix:** add them in one migration, and (per `AGENTS.md` §3) name the query or
the cascade that justifies each. Low-risk, additive, `if not exists`.
**NOT MEASURED** for the same reason as H7.

---

## 4. Medium

### M1 — `is_club_admin()` makes every school administrator an all-powerful club admin
`20260101000002_clubs.sql:229-248`. It is the `or` branch of essentially every
write policy (`manage_finances`, `manage_forms`, `manage_leadership`,
`manage_membership`, `manage_data_tables`). The PRD gives administrators a
*verification* role; this gives them edit rights over every club's ledger and
data tables. Consider a narrower `can_verify_club()` for the review workflow and
keep `is_club_admin()` for true emergency access, documented as such.

### M2 — `profiles_select_school` exposes every student's email
`20260101000001_core_schema.sql:294-299`. Any signed-in user reads `email`,
`account_type`, `grade_level`, `commitment_hours` for the whole school. If the
member directory is intended, expose it through a view with a restricted column
list instead of the base table.

### M3 — `clubs_update_leader` WITH CHECK only asserts `school_id`
`20260101000002_clubs.sql:330-337`. A founder or `manage_settings` holder can
set `status = 'approved'` or reassign `founder_id`. Production is saved by the
`clubs_guard_status` trigger (`20261020021156`), but that trigger keys off
`current_user`, so any `security definer` path that updates `clubs` bypasses it.
Repeat the invariant in the policy: `status = (select status from clubs where id = clubs.id)`.

### M4 — `leadership_applications` INSERT policy allows any `status`
`20260101000008_leadership.sql:474-476` only checks `applicant_id = auth.uid()`.
A student can insert a row already marked `status='accepted'`, with
`reviewed_by` and `reviewed_at` set. It grants no role, but it pollutes reviewer
queues and the audit narrative. Add `and status = 'draft'`.

### M5 — Administrator allowlist provisioning is operator-managed
`20261019000200_authorize_administrator.sql` and `20261025005921_authorize_second_administrator.sql`
insert administrator allowlist rows into `public.admin_allowlist`. Those migrations are
already applied and must not be edited; their contents are the live production
authorization state and the two authorized administrators must remain intact.

Real administrator contact details are deliberately NOT committed to seed data or
documentation. `supabase/seed.sql` now uses developer placeholders (see the local
development provisioning notes in `AGENTS.md`). Provisioning a fresh environment
requires an authorized operator to insert operator-supplied allowlist values outside
the committed repository; the process is documented with placeholders only.

### M6 — No `force row level security`
`20260101000001_core_schema.sql:287-291` is the only enable block in the repo and
`force` appears nowhere. Everything runs through PostgREST today, so this is not
exploitable, but any `security definer` function owned by `postgres` silently
ignores RLS. Worth stating as an invariant next to the grant invariant in
`AGENTS.md`.

### M7 — `clubs_fields_idx` cannot serve the query it was added for
`gin (fields)` only accelerates array operators (`@>`, `<@`, `&&`). The filter
in `search_clubs` is `filter_field = any (c.fields)`, which is not one of those,
so the index is write-only. Either rewrite the predicate as
`c.fields @> array[filter_field]` or drop the index.

---

## 5. Low

* **L1** `profiles_email_idx` is `lower(email)` (`20260101000001:79`) but the RLS
  subqueries filter `email = …`. Functional index, non-functional match.
* **L2** `admin_allowlist_lookup_idx` is on `email` (`20260101000001:103`) while
  `activate_administrator()` looks up `lower(email)`, and the unique index leads
  with `school_id`. Neither index serves the lookup. The table is tiny, so this
  is bookkeeping rather than performance.
* **L3** Every `create index` in the migrations is non-concurrent. Fine at
  current sizes; on a table with traffic it takes an `ACCESS EXCLUSIVE`-class
  lock. State the reason in the migration comment before adding an index to a
  live table.
* **L4** Live `statement_timeout = 120s`, `idle_in_transaction_session_timeout = 0`.
  No repo guidance; consider documenting the expected maximum for RPCs.

---

## 6. Live-vs-repo drift (operational)

The live database is fully migrated through `20261020021156`, but it is **not
reproducible from `supabase/migrations/`**. Three objects exist only in
production:

1. `public.guard_membership_self_update()` — `security invoker`, `search_path = ''`
2. `public.memberships_guard_self_update` trigger on `public.memberships`
3. `public.memberships_leave_self` policy (`UPDATE`, `{authenticated}`,
   self, `pending|active → removed`)

and one object differs:

4. live `memberships_update_leader` is leader-only; the repo version still has
   the `user_id = auth.uid()` branch (C1).

`grep -r guard_membership_self_update supabase/` → no matches. A `supabase db
reset` will produce a database that is *weaker* than production, and
`supabase migration list` will report it as identical.

**Fix:** one "reconcile live memberships policy" migration, written to be
idempotent (`drop policy if exists … ; create policy … ; create or replace
function … ; drop trigger if exists … ; create trigger …`).

---

## 7. What is already correct

Worth recording, so a future change does not regress it:

* RLS is enabled on **every** table in `public`, and no RLS-enabled table lacks a
  policy (both verified live: zero rows returned).
* The `42501 permission denied for function` regression from `20261003001241` is
  fixed — the eight policy predicates keep EXECUTE for `anon`
  (`20261019000100_restore_rls_policy_helper_grants.sql`).
* `notifications_user_created_idx (user_id, created_at desc)` and
  `events_starts_at_idx` exist and match their queries exactly.
* `messages_club_time_idx (club_id, created_at desc)`,
  `attendance_corrections_event_idx (event_id, created_at desc)` and
  `attendance_corrections_user_idx (user_id, created_at desc)` are correctly
  ordered (equality first, then range).
* Every `security definer` function sets `search_path`.
* `dues` RLS was enabled retroactively (`20261003000812`) and is live.
* `check_eligibility` / `eligible_roles_for` are scoped to the caller
  (`20261003000954`) — the earlier "read another student's activity" hole is
  closed.

---

## 8. Suggested order of fixes

1. **C1 + §6** — one migration that matches the live memberships policy and
   brings the guard trigger into the repo. Highest risk, smallest diff.
2. **C4 + C3** — INSERT policy on `attendance_corrections`, fix the
   `finalized_at` predicate. This is the PRD's signature flow.
3. **H3 + H2** — `form_responses` UPDATE policy; applicant/reviewer policies on
   `leadership_applications`.
4. **H4 + H1** — qualify `template_key`; remove the `role_is_supervisor` branch.
5. **H5** — revoke `record_audit` / `notify_*` from `authenticated`.
6. **C2** — split `can_read_club`; the widest change, do it last of the
   security items and test every club page.
7. **H7 + H8 + H6** — index work in one additive migration, with the query each
   index serves written in the comment.

After each step, run the `AGENTS.md` definition of done
(`typecheck`, `test`, `build`, `check:sql`, `lint`) and record bundle sizes if
imports changed.
