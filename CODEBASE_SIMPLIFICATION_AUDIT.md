# Clubset — Codebase Simplification Audit

**Date:** 2026-11-15
**Checkout:** `main` @ `d70895d` + the uncommitted auth remediation
**Status: REPORT ONLY. Nothing in this document has been implemented.**
Every item below was verified in this working tree before being written down.

---

## Method

- **Reachability:** every `import`/dynamic `import()` under `src/` was resolved
  (`@/` → `src/`, relative → real path) and walked from the real entry points
  (`src/routes/**`, `src/server.ts`, `src/start.ts`, `src/router.tsx`, `src/test/**`).
- **Symbols:** word-boundary search for each exported identifier across `src/` and
  `scripts/`, excluding its own definition file.
- **Dependencies:** each `package.json` dependency searched across `src/`, `scripts/`
  and the Vite/Vitest/ESLint config, then intersected with the file-level
  reachability result.
- **Not done:** no `build`/`tsc` was used to prove reachability, so a file loaded only
  by a string path or a Vite glob would be missed. None was found. No bundle sizes
  below were measured after deletion because nothing was deleted.

---

## MUST-FIX

**None.** No finding in this audit is a correctness, security or data-loss bug. The
one real dead-code hazard (`isTurnstileConfigured`) was already removed as part of the
auth remediation.

---

## SHOULD-FIX

### S1. 26 of 48 `src/components/ui/*` components are never imported

**Problem.** `accordion`, `alert-dialog`, `aspect-ratio`, `avatar`, `breadcrumb`,
`carousel`, `chart`, `collapsible`, `command`, `context-menu`, `drawer`,
`dropdown-menu`, `form`, `hover-card`, `input-otp`, `menubar`, `navigation-menu`,
`pagination`, `popover`, `progress`, `radio-group`, `resizable`, `scroll-area`,
`slider`, `toggle-group`, and `toggle` (imported only by `toggle-group`) have zero
importers outside `src/components/ui/`. `sidebar.tsx` mentions "collapsible" only as a
CSS class name — not an import.

**Fix.** Delete those 26 files in one commit. They are shadcn scaffolding, not product
code, and git history keeps them.

**Risk.** Low, and easy to verify: `npm run typecheck` fails loudly on a missed import.
Do **not** delete `sheet.tsx`, `dialog.tsx`, `tooltip.tsx`, `select.tsx` — they are
live (transitively through `sidebar.tsx`/routes).

**Smallest change.** `git rm src/components/ui/{…the 26…}` then typecheck + build.

**Bundle impact: zero.** They are already tree-shaken; this is a maintenance and
review-surface win, not a size win.

---

### S2. 24 npm dependencies exist only to support that dead code

**Problem.** With S1 done, these have no live importer and can be removed from
`package.json`:

| Dependency | Sole importer |
|---|---|
| `@radix-ui/react-accordion`, `-alert-dialog`, `-aspect-ratio`, `-avatar`, `-collapsible`, `-context-menu`, `-dropdown-menu`, `-hover-card`, `-menubar`, `-navigation-menu`, `-popover`, `-progress`, `-radio-group`, `-scroll-area`, `-slider`, `-toggle`, `-toggle-group` (17) | the matching `components/ui/*.tsx` |
| `react-hook-form` | `components/ui/form.tsx` |
| `cmdk` | `components/ui/command.tsx` |
| `embla-carousel-react` | `components/ui/carousel.tsx` |
| `input-otp` | `components/ui/input-otp.tsx` |
| `recharts` | `components/ui/chart.tsx` (not used by any chart in the product) |
| `vaul` | `components/ui/drawer.tsx` |
| `react-resizable-panels` | `components/ui/resizable.tsx` |

**Fix.** `npm uninstall <the 24>` after S1.

**Risk.** Medium-low. `recharts` and `react-hook-form` are the ones a future feature is
most likely to want; reinstalling is one command. **Do not remove** `react-dom` (no
import, but the renderer needs it), or `zod` / `@lovable.dev/mcp-js` until S3 is done.

**Smallest change.** One `npm uninstall` line; lockfile updates itself.

---

### S3. Seven dead server modules — including a whole MCP server behind a 404

**Problem.** Unreachable from every entry point:

| Path | What it is |
|---|---|
| `src/lib/mcp/index.ts` | `defineMcp(...)` — the hosted MCP handler |
| `src/lib/mcp/supabase.ts`, `src/lib/mcp/tools/list-{announcements,my-clubs,upcoming-events}.ts` | its tools |
| `src/integrations/supabase/auth-middleware.ts:34` | `requireSupabaseAuth`, zero references |
| `src/integrations/supabase/cron-auth.ts:2` | `authenticateCronRequest`, zero references |

`/mcp` is deliberately blocked twice (`src/routes/mcp.ts:11` returns 404;
`src/server.ts:12` `MCP_BLOCKED_PATHS`), and `CODEMAP.md` records it as dead. So this is
an entire authenticated server surface kept in the tree, importing
`@lovable.dev/mcp-js` and `zod`, reachable only by someone removing the block.

**Fix.** Delete the seven files, the `/mcp` 404 route and its
`/.well-known/oauth-protected-resource` companion, then `npm uninstall
@lovable.dev/mcp-js zod` (zod has no other importer).

**Risk.** Low functionally; **medium** organizationally — if the MCP endpoint is a
planned product feature, deleting it is wrong and this item should be closed instead.
Confirm before touching.

**Smallest change.** Delete the files; keep the two `MCP_BLOCKED_PATHS` guards until
the route is gone, then remove them in the same commit.

---

### S4. The motion system is two modules doing one job

**Problem.** `src/components/ui/motion.tsx:16` re-exports everything from
`src/lib/motion.ts`, and both are imported by real routes: 10 routes import
`@/lib/motion` (`staggerStyle`, `motion`) while 13 import `@/components/ui/motion`
(`FadeIn`, `StaggeredList`, `SlideIn`). Staggering exists twice:
`staggerStyle()` (`lib/motion.ts:74`) and `<StaggeredList>` (`ui/motion.tsx:83`).

**Fix.** Keep `lib/motion.ts` as the implementation and make
`components/ui/motion.tsx` a thin re-export (it almost is), or point the 10 routes at
the component module and delete `lib/motion.ts`.

**Risk.** Low, but it touches 20+ route files — mechanical churn in a Lovable-synced
repo. Prefer the smaller direction: leave the imports alone and delete the duplicated
`staggerStyle`/`StaggeredList` pair only if one can be expressed with the other.

**Smallest change.** Delete the duplicate export from `ui/motion.tsx` and re-export it
from `lib/motion.ts`; one line each side.

---

### S5. Two unreferenced helper scripts and one dead npm script

**Problem.**

- `scripts/sql-error.ts` parses one SQL file and prints an error with context. It is a
  strict subset of `scripts/check-sql.ts` (which parses all 48) and **nothing calls
  it** — `package.json:15` wires only `check-sql.ts`.
- `scripts/verify-admin-auth.sql` is referenced only in `SECURITY_NOTES.md:264` and
  `CODEMAP.md:44`; no npm script, no CI (repo has no `.github/`).
- `package.json:9` `"build:dev"` is referenced nowhere.

**Fix.** Delete `scripts/sql-error.ts` and `build:dev`. Keep
`verify-admin-auth.sql` only if it is meant as a manual runbook — if so, say so in
`SECURITY_NOTES.md` instead of leaving it ambiguous.

**Risk.** None for `sql-error.ts`/`build:dev`. The `.sql` file may be a documented
operator tool; decide, don't guess.

---

### S6. Dead exported constants in `src/lib/domain.ts`

**Problem.** `DEFAULT_MEETING_DURATION_MINUTES` (`:211`) and
`REQUIREMENTS_USE_FINALIZED_ATTENDANCE` (`:338`) have zero references anywhere,
including tests. `TableTemplate` (`:276`) is exported but used only by
`TABLE_TEMPLATES` in the same file.

**Fix.** Delete the two constants; drop `export` from `TableTemplate`.

**Risk.** None. If a flag constant is intentionally reserved, it needs a comment saying
what will read it — otherwise it is a lie in the type layer.

---

## NICE-TO-HAVE

### N1. Date formatting is copy-pasted, not shared

Five local helpers do the same job with different behaviour:
`clubs/$clubId/calendar.tsx:177` and `calendar.tsx:43` and `clubs/$clubId/chat.tsx:281`
(`dayKey`, two signatures), `clubs/$clubId/events.tsx:405` (`formatRange`),
`clubs/$clubId/members.tsx:229` (`formatDate`), plus 26 bare
`toLocaleString`/`toLocaleDateString`/`toLocaleTimeString` call sites across routes.

**Fix.** One `formatDate`/`formatTime`/`formatRange` trio in a shared module, then
replace call sites route by route.

**Risk.** Low per file, but **user-visible**: the current output depends on the
browser's locale, so a shared helper that hard-codes `en-US` would change what every
user sees. Keep the default locale and pass options through.

**Smallest change.** Start with the five helpers only; leave the 26 bare call sites
alone until one of them is being edited for another reason.

---

### N2. Exports that only tests (or nobody) use

- `src/lib/auth/permissions.ts:30` `isLeader` — test-only.
- `src/lib/queries.ts:45` `normalizeEmail` — internal + test-only.
- `src/lib/auth/oauth.ts:59` `parseOAuthError`, `:46` `OAuthUrlError` — internal.
- `src/lib/error-capture.ts:18` `describeError` — internal; file is live.
- `src/lib/security/turnstile.ts:28,31,34` — internal (`turnstileSiteKey`,
  `loadTurnstileScript`, the widget).
- `src/lib/queries.ts:337` `ClubFilters` — internal parameter type.
- `src/lib/types/database.ts` — **23 exported types with zero references**
  (`AccountType`, `MembershipStatus`, `VerificationKind`, `RsvpStatus`,
  `AttendanceSource`, `TransactionType`, `DuesStatus`, `FormStatus`,
  `NotificationType`, `SchoolRow`, `ClubAdministratorRow`, `ClubVerificationRow`,
  `RoleAssignmentRow`, `RsvpRow`, `AttendanceCorrectionRow`, `EventPreferenceRow`,
  `RoleMessageRow`, `BudgetRow`, `ApplicationQuestionRow`, `AttendanceStats`,
  `EligibilityResult`, `ClubFinancesRow`, `CalendarConflictRow`).

**Fix.** Drop `export` where the symbol is internal; delete the 23 unused type aliases.

**Risk.** Low, but `database.ts` is hand-maintained (892 lines) while
`integrations/supabase/types.ts` (2621 lines) is generated. Deleting aliases here makes
the two drift further apart. Prefer **not** doing this until the two type sources are
reconciled (see N3).

---

### N3. Two `Database` type definitions, two browser client factories

**Problem.** `src/lib/types/database.ts` (`Database` at :504, hand-maintained) and
`src/integrations/supabase/types.ts` (`Database` at :9, generated) describe overlapping
schemas. Two browser clients exist and are both live:
`src/lib/supabase/client.ts:49` `getSupabaseClient()` (cached singleton, `VITE_*` +
`PUBLIC_*` fallbacks) and `src/integrations/supabase/client.ts:63` `supabase` (lazy
proxy, fetch wrapper, preview storage), reached via `src/start.ts:29`.

**Fix.** Not a cleanup. Merging either pair is a behaviour change: different env
fallbacks, different storage brokering, different type coverage. Treat as a dedicated,
tested migration, not a simplification.

**Risk.** High if attempted casually. `AGENTS.md` also warns that auth wiring is
load-bearing. **Recommendation: leave both alone and document which one each layer
must use.**

---

### N4. Environment-variable drift

**Problem.** Variables read in code but declared in neither `.env.example` nor
`wrangler.jsonc` vars: `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`
(`src/lib/supabase/client.ts:24,28`), `PUBLIC_TURNSTILE_SITE_KEY`
(`src/lib/security/turnstile.ts:65`). `VITE_TURNSTILE_SITE_KEY` is in `wrangler.jsonc`
but not `.env.example`. Conversely `SUPABASE_ACCESS_TOKEN` is documented in
`.env.example` and read by no code — that one is intentional (CLI-only) and should stay,
with its comment.

**Fix.** Add the three `PUBLIC_*` names to `.env.example` as optional fallbacks, and add
`VITE_TURNSTILE_SITE_KEY`; keep `SUPABASE_ACCESS_TOKEN` as-is.

**Risk.** None. This is documentation, not behaviour.

---

### N5. `@vercel/analytics` is installed and never imported

**Problem.** Zero references in `src/`, `scripts/` or `index.html`.

**Fix.** `npm uninstall @vercel/analytics` — or wire it up if analytics was intended.
The current state is the worst of both.

**Risk.** None if unused; adding it would be a product decision (and a network call),
not a cleanup.

---

## Recommended order

1. **S1 + S2** together (dead UI files, then their deps) — biggest reduction in
   surface, smallest behavioural risk.
2. **S5 + S6 + N5 + N4** — pure deletions/documentation, no runtime effect.
3. **S3** — only after confirming MCP is not a planned feature.
4. **S4**, **N1**, **N2** — mechanical, route-by-route, when a file is already being
   edited.
5. **N3** — explicitly out of scope; needs its own plan.

## What this audit deliberately does not do

- It does not touch `supabase/migrations/`, RLS policies or grants. `AGENTS.md` forbids
  hardening-by-deletion there, and nothing found was unsafe.
- It does not propose replacing RLS or any server-side check with client logic.
- It does not delete the two Supabase clients or the two type files, because both are
  live and merging them changes runtime behaviour.
