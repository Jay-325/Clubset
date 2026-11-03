# Security notes

**Date:** 2026-10-26
**Scope:** the remediation batch in `supabase/migrations/2026102600*.sql`, plus the
dependency review that did not change any dependency.

---

## 1. Database authorization invariants (new, do not regress)

These are additions to the invariants already recorded in `AGENTS.md` §2 and
`supabase/AUDIT_2026-10-24_schema_rls_indexes.md`.

### 1.1 `can_read_club()` is private; `can_discover_club()` is school-wide

`can_read_club(club)` is now **active member OR club/school administrator for
that club**. It is the predicate behind every private club table (ledger,
budgets, data tables, events, forms, announcements, leadership, chat banners).

`can_discover_club(club)` is the only school-wide predicate: same-school
**approved** clubs, plus clubs still `awaiting_student_verification` (the
verification flow needs the row visible). It never grants access to a private
club table.

If a new feature needs a school-wide club surface, use `can_discover_club()`.
Do not add a school branch back into `can_read_club()`.

### 1.2 Membership writes are split by actor, not by column

* `memberships_update_leader` — `manage_membership` / club admin only.
* `memberships_update_self` — the student may address their own row, and
  `guard_membership_self_update()` (BEFORE UPDATE) decides what may change:
  `is_priority` yes, `pending|active -> removed` yes, anything else no.
* `joined_at` is the "accepted" marker and is staff-only.

A future migration must not widen `memberships_update_self`'s `WITH CHECK`
beyond `user_id = auth.uid()` **without** also updating the guard trigger;
the policy alone cannot distinguish "withdraw" from "self-admit".

### 1.3 Audit and notification writers are not RPC endpoints

* `private.record_audit()` — non-exposed schema (`private` is not in the Data
  API's exposed schema list). Used by the SECURITY INVOKER RPCs.
* `public.record_audit()` — EXECUTE revoked from `public, anon, authenticated`.
  Only SECURITY DEFINER triggers owned by `postgres` and `service_role` call it.
* `notify_user` / `notify_club_leaders` — EXECUTE revoked from clients
  (`20261024204857`).

New RPCs that need an audit entry must call `private.record_audit()`. Do not
re-grant `public.record_audit()` to `authenticated` to make a feature work; that
reopens `/rest/v1/rpc/record_audit` as an audit-forgery surface.

### 1.4 Policy predicates still need EXECUTE for `anon`

Unchanged from `20261019000100`: any function referenced in a policy expression
must keep EXECUTE for every role that can query the table, including `anon`.
`can_read_club`, `can_discover_club`, `is_club_member`, `is_club_admin`,
`is_club_leader`, `has_club_permission`, `is_administrator`,
`current_school_id` and `current_profile` are predicates, not endpoints.

### 1.5 SECURITY DEFINER only with an explicit caller gate

Three RPCs became `security definer` because the table policies cannot express
the real rule:

| Function | Why | Gate |
|---|---|---|
| `finalize_attendance` | writes `events` + `attendance`; `manage_attendance` alone could not update `events` | `manage_attendance` or club admin |
| `review_application` | reviewers include the current role holder / supervising-role holder, which the narrow table policy does not model | role holder, same-club supervising-role holder, `manage_leadership`, or club admin; self-review refused |
| `apply_for_role` | writes a `submitted` row while the client INSERT policy only allows `draft` | self only (`auth.uid()`), eligibility re-checked server-side |

`leadership_applications` reviewer UPDATE remains narrow
(`manage_leadership` / club admin); the wider reviewer set is only reachable
through the function.

### 1.6 `check_administrator_allowlist()` is the one anon-callable endpoint

`20261101182137_administrator_allowlist_precheck.sql` adds
`public.check_administrator_allowlist(candidate_email text) -> boolean`, the
read-only lookup behind the Administrator tab on `/login`.

It is a deliberate, scoped exception to "no EXECUTE for `anon` on public
functions": the caller is a signed-out visitor, and
`public.admin_allowlist` has no client SELECT policy (staff PII must never reach
a client), so the RPC is the only way the browser can answer "is this address
registered?".

Rules that follow, do not regress:

* It returns **one boolean and nothing else** — never a name, school or
  allowlist id. Keep it that way.
* A revoked row and a never-allowlisted address must stay **indistinguishable**
  (both `false`).
* Malformed/oversized input must short-circuit **before** any table access.
* It grants nothing. `activate_administrator()` remains the only authorization
  step and re-derives the email from `auth.users`, never from the client. A
  client that skips the pre-check can request an activation email, but
  activation still fails with `42501`.
* The pre-check must run **before** `signInWithOtp()` in `useAdminLogin()`.
  Reordering them re-opens the bug this migration fixed: `shouldCreateUser:
  true` would create an auth user — and, via `on_auth_user_created`, a profile
  row — for an address that is not allowed to be an administrator.
* **The verdict must never reach the UI.** `useAdminLogin()` resolves `void` for
  both branches and `/login` shows the same "if that email is on the allowlist,
  an activation link is on its way" message either way. An earlier revision
  returned `"not_allowlisted"` and rendered "you do not have administrator
  permission"; that made the login page an email-enumeration oracle and was
  reverted.
* Residual risk accepted: **the RPC itself is still an oracle.** A client can
  `POST /rest/v1/rpc/check_administrator_allowlist` directly and read the
  boolean, regardless of what the UI shows. The UI change removes the product
  from the business of answering, not the API. If this needs to be closed
  properly, rate limit the endpoint at the edge (or move the lookup behind a
  server function that never returns the boolean), rather than removing the
  grant the gate depends on.

### 1.7 `admin_allowlist` is client-inaccessible and developer-managed

`20261101182953_lock_admin_allowlist_from_anon.sql` revoked all table privileges
on `public.admin_allowlist` from `anon`. `20261103000000_open_student_signup_and_lock_allowlist.sql`
extends this to `authenticated` and drops the `admin_allowlist_admin_all`
policy. Signed-out **and** signed-in clients now get `401`/`42501` from
`/rest/v1/admin_allowlist` instead of `200 []`.

This is the **one** deliberate exception to the "an anon read must be `200` with
zero rows, never `42501`" invariant. It is not the 20261003001241 defect: no
policy evaluates `admin_allowlist` as the querying role, and the three functions
that read it (`handle_new_auth_user`, `activate_administrator`,
`check_administrator_allowlist`) are all `SECURITY DEFINER`, so they are
unaffected by the missing grants.

The allowlist is deliberately **developer-only**. There is no application
allowlist-management screen, and an activated school administrator must not be
able to mint another administrator by writing an allowlist row. Adding,
changing or revoking an entry requires direct database access (dashboard,
`postgres`) or the server-only `service_role` credential, which is never shipped
to the browser. Do not re-add `admin_allowlist_admin_all`, and do not grant the
table to `authenticated`.

Student sign-up is separate and email-domain agnostic:
`handle_new_auth_user()` links every new auth user to the deployment's school
(allowlist row, then `schools.email_domain`, then the oldest school), so any
verified address gets a working student account. Administrator status still
comes only from `activate_administrator()`.

---

## 2. Dependency review — MCP transitive packages

### Finding

`@lovable.dev/mcp-js` pulls two packages that are flagged by dependency
scanning:

```
@lovable.dev/mcp-js@3.0.5 (installed) / 3.3.0 (latest stable)
├── @modelcontextprotocol/sdk@1.28.0
└── @modelcontextprotocol/server@2.0.0
```

Latest published stable versions are `@modelcontextprotocol/sdk@1.32.2` and
`@modelcontextprotocol/server@2.4.0`. However `@lovable.dev/mcp-js@3.3.0`
declares **exact** pins:

```json
"@modelcontextprotocol/sdk": "1.28.0",
"@modelcontextprotocol/server": "2.0.0"
```

so no stable version of the parent package removes those transitive versions.

### Decision: no dependency change

* No stable upgrade removes the flagged packages, so upgrading
  `@lovable.dev/mcp-js` would not change the finding.
* `overrides` / `resolutions` were **not** used. Forcing a newer
  `@modelcontextprotocol/*` under a parent that pins exact versions is
  unsupported and can break the MCP handler at runtime.
* No prerelease/RC packages were introduced.
* `zod` stays at the direct `^3.25.76` dependency. A v3 → v4 migration touches
  every schema and form in the app and is not a security fix.

### Launch recommendation for `/mcp`

The `/mcp` endpoint (`src/routes/mcp.ts`, `src/lib/mcp/index.ts`) is not
required for the student/leader/administrator product. It is an integration
surface for external MCP clients and is the only reason the
`@modelcontextprotocol/*` packages are in the dependency tree.

**Recommendation:** block `/mcp` (and `/.well-known/oauth-protected-resource`)
at the hosting layer for the initial production launch — e.g. a deny rule in
the Cloudflare/Vercel configuration — and keep the packages installed. This
removes the reachable attack surface without an unsupported dependency
override. If MCP is kept enabled, treat the endpoint as internet-facing and
review its authentication/authorization separately.

---

## 3. Known residual risks (intentionally not changed)

These are Medium findings from the audit that are outside this remediation
batch. They are recorded so they are not mistaken for oversights.

1. **`is_club_admin()` gives every school administrator full control of every
   club** (M1). The PRD gives administrators a verification role; this grants
   edit rights over every club's ledger and data tables. Narrowing it changes
   the authorization model for many screens and needs its own tested change.
2. **`profiles_select_school` exposes same-school peers' `email`, `grade` and
   `account_type`** (M2). Accepted by the owner in `20261025002233`; the fix is
   a restricted-column view, not a grant change.
3. **`clubs_update_leader` WITH CHECK only asserts `school_id`** (M3). The
   `clubs_guard_status` trigger (`20261020021156`) blocks status/founder
   changes from `authenticated`, but a SECURITY DEFINER path bypasses it.
4. **No `force row level security`** (M6). Everything currently runs through
   PostgREST, so this is not exploitable, but table owners bypass RLS.
5. **Personal address in `20261019000200_authorize_administrator.sql`** (M5).
   VCS-visible PII and an administrator grant in every fresh environment.
6. **Non-`CONCURRENTLY` index creation** (L3). All new indexes in
   `20261026000400` are plain `CREATE INDEX`, matching the rest of the repo.
   They are fine at current table sizes; on a live table with traffic, build
   them `CONCURRENTLY` outside a transaction.
7. **`auth.uid()` inside SECURITY DEFINER SQL helpers** is still evaluated per
   call. The policy-level `(select auth.uid())` rewrite in `20261026000400`
   removes the per-row re-evaluation in policy quals; it does not inline the
   definer helpers (PostgreSQL never inlines SECURITY DEFINER functions).

## 4. Verification limits

`npm run check:sql` parses every migration with the real PostgreSQL grammar,
but it cannot check semantics (missing columns, ambiguous references, policy
interactions). The Docker engine is not available in this environment, so
`supabase db reset` could not be run. The migrations in this batch were **not
applied to a live Postgres** as part of this change; they should be applied to
a staging project and the authorization cases below verified there:

* signed-out `GET /rest/v1/clubs` → `200` with zero rows (not `42501`);
* a non-member `GET /rest/v1/transactions` → zero rows, while an active member
  sees their own club's rows;
* `PATCH /rest/v1/memberships?id=eq.<own row>` with `{"status":"active"}` →
  `42501` from `guard_membership_self_update`; `{"status":"removed"}` succeeds;
* `POST /rest/v1/rpc/finalize_attendance` as a `manage_attendance`-only leader →
  summary JSON, no `42703`;
* `POST /rest/v1/rpc/correct_attendance` / `veto_rsvp` as a leader → correction
  row inserted, no `42501`;
* `POST /rest/v1/rpc/submit_form_response` twice → second call updates, no
  `42501`;
* `POST /rest/v1/rpc/review_application` by the current role holder → accepted;
  by an unrelated student → `42501`; by the applicant → `42501`;
* `POST /rest/v1/rpc/apply_table_template` → columns created, no `42702`;
* `POST /rest/v1/rpc/record_audit` as `authenticated` → `42501`/404 (no grant);
* `POST /rest/v1/rpc/apply_for_role` → row `submitted`, and a second call on an
  already-accepted application → error instead of reopening it.
