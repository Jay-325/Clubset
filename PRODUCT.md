# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Students** at a secondary school (grade levels in the app are 9th–12th) browsing, joining, and taking part in clubs, usually on a phone between classes. They need to find a club that fits their interests and available time, then act without learning a system.
- **Student club leaders** (president, vice president, officers) running the club from a phone at a meeting: members and join requests, events, attendance, funds, forms, data tables, announcements, and leadership handoff.
- **School administrators**, a small allowlisted group doing oversight and verification — approving new clubs and viewing school-wide activity — not day-to-day club operations.

Confirmed: no faculty-advisor, staff-wide, or parent role is in scope. Administrator accounts are the only staff-facing role and exist for oversight.

## Product Purpose

Clubset is a student-friendly platform that manages a school's clubs in one place: discovery, membership, events, attendance, communication, leadership applications, finances, forms, and shared data. It exists so club life does not live across group chats, spreadsheets, sign-in sheets, and cash boxes.

Success is stated in `.lovable/north-star/north-star.md`: students find clubs that fit them and take part in club life, measured by **members marked present at club events each week**.

## Positioning

One system for the whole club lifecycle instead of a patchwork of tools, with the complicated work done behind the scenes so students only make simple decisions (README). The mechanism is visible in the product:

- A single club record carries membership, roles, events, attendance, funds, forms, and data, so entering something once makes it available everywhere (for example, an RSVP creates the expected-attendance record).
- Fixed, plain-language vocabulary (interests, club types, commitment levels, suggested roles, data-table templates) replaces free-text configuration, so a student never has to invent a category.
- Progressive complexity: a member sees what they can use, and management surfaces appear only when a permission is held.

## Operating Context

- The school year and its weekly meeting rhythm; clubs recruit, meet, take attendance, collect dues, run events, and hand over leadership annually.
- Creating a club takes three student verifications, then administrator approval, before it becomes active.
- Leadership applications use eligibility requirements (time in club, attendance rate, events attended, volunteer hours) that read **finalized** attendance, so an RSVP never counts as showing up.
- Users reach the product through student sign-up/sign-in (email/password or Google) or the administrator email-link path; every signed-in route sits behind `RequireAuth`, and there is no public marketing site.
- Every new account is linked to the deployment's school at sign-up, and administrator identities come from a developer-managed, private allowlist — administrator access is never granted inside the app.

## Capabilities and Constraints

Confirmed capabilities: club discovery with search, filters, and recommendations that explain why a club was suggested; club home, announcements, chat, calendar with RSVP, events, attendance, funds (budgets, dues, transactions), forms, data tables, members, leadership and role permissions, notifications, onboarding, settings, and an administrator dashboard.

Constraints and undecided facts:

- **Deployment scope (confirmed):** one school per deployment today; multi-school is planned soon. Cross-school discovery and isolation are not built yet, and no school-switching model exists.
- **Access control is server-side.** Postgres RLS and RPCs decide every read and write; UI permission helpers only decide what to show. No design or client change may replace RLS with client filtering.
- **Security commitments from `AGENTS.md`:** no service-role key in client code or `VITE_*`; the administrator allowlist is private and developer-managed; activation is the only path to `account_type = 'administrator'`; functions used inside policies keep `EXECUTE` for every role that queries the table, while writing functions are revoked from `anon`.
- **Migrations only**, additive and idempotent, with new timestamped files; no hand-run DDL on the live project.
- Stack in place: TanStack Start + React 19, Vite/Nitro built for a Cloudflare Worker (`wrangler.jsonc`), Tailwind CSS v4 + shadcn/ui, Supabase for Postgres, Auth, Storage, and Realtime.
- Not decided: the multi-school isolation model (per-deployment default school versus shared database with school-scoped access).

## Brand Commitments

- The name **Clubset**.
- A student-friendly, plain-word voice: product copy explains a choice in ordinary language rather than naming a system concept.
- An otters mascot character ships with the app (`src/components/otter/OtterBuddy.tsx`, `public/assets/otter-idle.webp`, `public/assets/otter-hover.webp`) and is the incumbent brand character.
- No logo beyond the favicon, and no external brand guidelines exist.

## Evidence on Hand

- **Pre-pilot/prototype (confirmed):** there are no real users, testimonials, adoption numbers, case studies, press, or partner schools. Future work must not cite any as proof.
- Internal-only artifacts: the north-star metric, migration suite and schema audit, security investigation/remediation reports, an accessibility contrast audit, and standalone demo HTML pages.
- The contrast audit's ratios are computed from design tokens, not measured in a browser, and it records that authenticated routes were not checked with a session.
- Absent and not to be fabricated: pricing, customer logos, testimonials, benchmarks, and any claim of live school adoption.

## Product Principles

1. Do the complicated work behind the scenes so a student only makes simple decisions.
2. Show people only what they can use; reveal management surfaces when a permission is held.
3. Speak in plain words — no system vocabulary in the student's path.
4. Enter it once, reuse it everywhere; a club's data should not be asked for twice.
5. Trust finalized records, not intentions: attendance and eligibility reflect what was confirmed.
6. Security and permissions live in the database; the interface displays them and never enforces them alone.

## Accessibility & Inclusion

No product-specific standard has been confirmed by the owners. The repository's contrast audit uses WCAG 2.1 AA as its working baseline and states its results are unverified in-browser; treat in-browser verification as outstanding rather than done.
