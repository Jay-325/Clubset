<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Performance & Security Rules

These rules are mandatory for every change in this repository, including
changes made by Lovable, by agents, or by hand. They exist because the
optimizations below were audited and verified once; nothing stops them from
silently regressing. If a rule genuinely cannot be followed, say so in the pull
request/commit message and explain why.

## 1. Definition of done

Run all of these before committing. A change is not done if any fails:

```bash
npm run typecheck     # must pass
npm run test          # must pass
npm run build         # must pass
npm run check:sql     # must pass (parses every migration with the real PG grammar)
npm run lint          # must not add NEW errors
```

`npm run lint` currently reports pre-existing CRLF/formatting errors in files
that have not been touched (for example `src/start.ts`,
`src/routes/clubs/new.tsx`). Treat that as the baseline: do not introduce new
lint classes, and do not "fix" the baseline by rewriting whole files — a
whole-file reformat destroys the diff and confuses the Lovable sync.

Record bundle sizes from `npm run build` before and after any change that
touches imports. The current baseline is: `index-*.js` 367.76 kB
(115.56 kB gzip), `client-*.js` 236.20 kB (63.32 kB gzip), `styles-*.css`
81.23 kB (13.61 kB gzip).

## 2. React Query rules (TanStack Query v5)

- **One question, one cache entry.** Two call sites that issue the same request
  must build the same key. Normalise the inputs in the hook (see
  `normalizeClubFilters` in `src/lib/queries.ts`) instead of letting each caller
  hash its own object shape. The Main page used to run the `search_clubs` RPC
  twice for identical arguments for exactly this reason.
- **The key must contain every input the `queryFn` depends on.** If the body
  reads `ids`, `activeId`, `viewerId`, or a filter, it belongs in the key.
  Omitting it is how stale rows get rendered after switching tables or forms.
- **Invalidation prefixes must be real key prefixes.** `["club", clubId,
  "leadership"]` does **not** cover `["club", clubId, "leadership-roles"]`.
  A no-op `invalidateQueries` is a correctness bug, not a performance
  opportunity — fix it and accept the extra refetch.
- **Never serialise independent reads.** Batch with `Promise.all`. A hook that
  awaits `getUser()` then `club` then `role_assignments` then `profiles` pays
  for four round trips on the critical path of every page that uses it. Two
  batches is usually achievable: `getUser()` + the first read together, then
  the reads that depend on the user id together.
- **Join in the query, not in a second query.** Use PostgREST embedded selects
  (`memberships.select("user_id, profiles(id, full_name)")`) instead of a
  follow-up `.in(...)` request.
- **Gate privileged queries with `enabled`.** A query that only administrators
  can read must not fire for every visitor (`useAdminClubOverview(enabled)`).
- **Do not bypass `supabase.auth.getUser()`** for the session in application
  data hooks. It validates the JWT server-side. `useViewerId()` is the shared
  reader; do not declare a new `["viewer-id"]` query in a route.
- Memoise only when there is a concrete mechanism (context value identity,
  per-keystroke work). Do not blanket-`useMemo`/`memo` as a habit.

## 3. Database rules

- **Migrations only.** Never run DDL against the live project by hand, and never
  edit a migration that has already been applied. Add a new timestamped file in
  `supabase/migrations/`.
- **Additive and idempotent.** Use `create index if not exists`, `create table if
  not exists`, `drop policy if exists` before `create policy`. No destructive
  statements without an explicit rollback comment.
- **An index needs a named query and an access pattern.** In the migration
  comment, write the exact query, why the existing indexes cannot serve it, and
  the rollback. "It might be slow" is not a justification. An index costs
  writes and storage on every row.
- **Match the access pattern.** Equality columns first, then the range or sort
  column: `(user_id, created_at desc)` serves `where user_id = $1 order by
  created_at desc limit 50`; a partial index cannot serve a query that does not
  carry the partial predicate.
- **Do not drop indexes, constraints, policies or columns** without a
  DESTRUCTIVE CHANGE note and a rollback plan.
- **Performance must never be bought with security.** Do not disable or loosen
  RLS, do not add `security definer` without `set search_path = public`, do not
  grant `execute` to `anon`/`public`, and do not replace RLS with client-side
  filtering. `20261003001241_*.sql` is the hardening baseline; do not regress it.
- Never put a service-role key in `src/`, in `VITE_*`, or in a migration.

### Current index invariants (do not drop without replacing the query)

- `notifications_user_created_idx (user_id, created_at desc)` backs the
  notification list read by `AppShell` on every route.
  `notifications_user_unread_idx` is **partial** (`where read_at is null`) and
  cannot serve that query — the app never filters on `read_at`.
- `events_starts_at_idx (starts_at)` backs `upcoming_events()`, which filters
  `starts_at >= now() - interval '1 day'` and orders by `starts_at`.
  `events_club_time_idx (club_id, starts_at)` cannot serve it because `club_id`
  is not a constant there.
- A new `where`, `join` or `order by` on a table that can grow without bound
  needs the same treatment: name the query, justify the index, add it.

## 4. Frontend and network rules

- Debounce search inputs (`useDebouncedValue`, 300 ms). One request per pause,
  not one per keystroke.
- Keep server-only packages out of the client bundle. Heavy UI libraries that no
  route imports stay tree-shaken; do not import them speculatively.
- Give every `<img>` explicit dimensions or a fixed container to prevent layout
  shift.
- Do not add polling, realtime subscriptions or `refetchInterval` without a
  stated freshness requirement.
- Do not move `RequireAuth`/`AppShell` into a shared layout route ad hoc — the
  re-render/mount behaviour of every club page depends on it. That refactor is
  a separate, tested change.

## 5. Adding a performance change

1. Name the user-visible symptom or the query that is slow.
2. Measure or reason precisely. If a measurement is unavailable (for example no
   Docker/Postgres in the environment), say **NOT MEASURED** and explain the
   access-pattern reasoning instead of inventing a number.
3. Make the smallest change that addresses it.
4. Verify with the definition of done, plus the specific flow if it is
   behavioural.
5. Report what changed, what was measured, and what remains unverified.
