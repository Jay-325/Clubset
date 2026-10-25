# Clubset

School club management and discovery. Communication, membership, events,
attendance, finances, forms, and data tables in one student-friendly system.

> **Clubset should do the complicated work behind the scenes so students only
> have to make simple decisions.**

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | TanStack Start (SSR, file-based routing, React 19) |
| Build | Vite 8 + Nitro (Cloudflare Workers target) |
| UI | shadcn/ui (new-york, slate) + Tailwind v4 |
| Data | Supabase (Postgres + Auth + Storage + Realtime) |
| Authorization | Row Level Security + Postgres functions |

---

## Getting started

```bash
npm install
cp .env.example .env      # then fill in your Supabase keys
npm run dev
```

### 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Copy **Project Settings → API** values into `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` (the anon key; `VITE_SUPABASE_ANON_KEY`
     is accepted as a legacy alias)
3. Open the SQL editor and run the migrations in `supabase/migrations/` **in
   filename order**. Or with the CLI:

   ```bash
   npx supabase link --project-ref <your-ref>
   npx supabase db push
   npx supabase db seed    # optional: dev school + admin allowlist entry
   ```

### 2. Enable email sign-in

Supabase projects ship with email sign-in available, but confirm
**Authentication → Providers → Email** is enabled. For local development,
disable "Confirm email" so magic links work without a real inbox.

### 3. Create the first administrator

`supabase/seed.sql` inserts two allowlist entries, for
`arinjaypal@gmail.com` and `ray.d.villaflor@gmail.com`. After signing in with
one of those addresses and confirming the emailed link, activate the role:

```sql
select public.activate_administrator();
```

The function raises an exception if the signed-in email is not an active row in
`public.admin_allowlist`, so a user cannot promote themselves and a school
domain grants nothing (PRD 5, 53.21). Both addresses must exist as confirmed
users before they can activate; the allowlist row only makes activation
possible.

---

## Environment variables

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public publishable (anon) key. `VITE_SUPABASE_ANON_KEY` is accepted as a legacy alias. |

If neither is set, the build falls back to the checked-in public config in
`src/lib/supabase/public-config.ts`, so a deployment with no environment
variables still starts instead of showing "Connect Supabase to continue".
Environment variables always take precedence over that fallback.

The anon key is designed to be public. It is safe in the browser **only**
because every table has RLS enabled and every RPC re-checks permissions
server-side (PRD 41). Never put the `service_role` key in a `VITE_` variable —
anything prefixed `VITE_` is shipped to the browser.

---

## How authorization works

The frontend decides what to **show**. Postgres decides what a user is
allowed to **do** (PRD 41, 53.20).

- **Every table has RLS enabled.** School data is isolated in policies that
  compare `school_id` against `current_school_id()`.
- **Permissions are per role, per club.** A student is a "leader" only inside a
  specific club — there is no global leader account type (PRD 3).
- **Mutations go through RPCs** that re-check the caller's permission:
  `review_membership`, `correct_attendance`, `veto_rsvp`, `add_transaction`,
  `apply_for_role`, `review_club`, and so on.
- **`admin_allowlist` has no client read policy.** Only
  `activate_administrator()` (a `SECURITY DEFINER` function) can consult it.

Hiding a button is a UX affordance. Removing an admin policy row is a security
change; do not treat the two as equivalent.

---

## Schema layout

| Migration | Contents |
| --- | --- |
| `01_core_schema` | Schools, profiles, admin allowlist, auth helpers |
| `02_clubs` | Clubs, 3-student verification, memberships, roles, audit log |
| `03_events_attendance` | Events, RSVPs, attendance, corrections, conflicts |
| `04_chat` | Group chat, banners, role messaging |
| `05_finances` | Transactions, budgets, dues, balance view |
| `06_forms` | Forms, questions, responses |
| `07_data_tables` | Tables, columns, rows, templates |
| `08_leadership` | Roles, eligibility, applications |
| `09_notifications` | Notifications, discovery, admin views, storage |

`src/lib/types/database.ts` mirrors this schema and can be regenerated with
`npx supabase gen types typescript --project-id <ref>`.

---

## The attendance model

This is the part of Clubset that differs most from a normal calendar RSVP
(PRD 16–18, 47):

```
Event → RSVP → expected attendance → meeting → leader corrects → final attendance
```

- An RSVP **creates** an attendance record automatically via a database
  trigger — the leader never types in who is coming.
- That record starts as `rsvp_pending`, **not** `attended`. An RSVP is a
  statement of intent, not a claim about reality.
- A leader can **veto** an RSVP, which sets the record to `did_not_attend`. A
  veto is not a ban and carries no penalty (PRD 53.13).
- Leadership eligibility and attendance statistics read from
  `finalized_attendance` only, so a student cannot earn attendance credit by
  clicking RSVP (PRD 34, 53.14).

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run test` | Run the test suite |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |