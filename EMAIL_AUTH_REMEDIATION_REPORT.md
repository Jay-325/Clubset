# Clubset — Email Authentication Remediation Report

**Date:** 2026-11-15
**Checkout:** `main` @ `d70895d`, dirty working tree (all changes below uncommitted)
**Companion:** `EMAIL_AUTH_INVESTIGATION_REPORT.md` (findings F1–F6)
**Status:** code changes complete and verified locally. **Nothing committed, pushed or deployed. No hosted config changed.**

---

## 1. What was wrong, in one paragraph

Three independent code defects produced the reported "Something went wrong. Please
try again." and could stop a legitimate student:

1. **F1** — a client-side Turnstile gate blocked submit on `/login` and `/signup`
   whenever no token existed, and the token could never exist when
   `challenges.cloudflare.com` was unreachable. The hosted Auth server does not
   enforce captcha at all, so the gate protected nothing while breaking every
   email flow on a filtered network.
2. **F2** — `normalizeAuthError()` recognised four message families and flattened
   everything else, including the app's own actionable password messages, the
   project password policy, captcha failures and network failures.
3. **F3/F4** — the auth rate limiter ran before every email-sending flow, used the
   service-role client outside a `try`, and therefore rejected the server function
   instead of failing open when `SUPABASE_SERVICE_ROLE_KEY` was absent. Its per-IP
   bucket also used the per-email limit.

## 2. Changes made (all in the working tree)

| # | File | Change | Finding |
|---|------|--------|---------|
| 1 | `src/lib/queries.ts:891` `normalizeAuthError()` | Pass the app's own `BREACHED_PASSWORD_MESSAGE` / `PASSWORD_CHECK_UNAVAILABLE_MESSAGE` through unchanged; add branches for the project password policy (`password should`, `weak password`, `too short`), captcha, and network/`Failed to fetch` failures. | F2 |
| 2 | `src/lib/security/auth-rate-limit.functions.ts:72` | `checkOne` is now `(key, operation, limit, windowSeconds)`, wrapped in `try/catch` that logs server-side and returns `true` (fail open). | F3 |
| 3 | `src/lib/security/auth-rate-limit.functions.ts:141-149` | Email bucket uses `config.perEmail`, IP bucket uses `config.perIp`. | F4 |
| 4 | `src/routes/login.tsx:119-176` | Removed the `captchaRequired && !token` early return from both the student and administrator submit handlers. The token is still forwarded when the widget produced one. | F1 |
| 5 | `src/routes/signup.tsx:58-90` | Same removal. | F1 |
| 6 | `src/lib/security/turnstile.ts` | Deleted `isTurnstileConfigured()` — its only callers were the gates removed above. `turnstileSiteKey()` and the widget are unchanged. | F1 |

Net: 6 files changed, +129 / −53 lines. No schema, RLS, grant or migration change.
No new dependency.

## 3. Test evidence (red first, then green)

Eight tests were written before the implementation.

| Test | File | Red evidence |
|------|------|--------------|
| password policy is explained, not flattened | `src/lib/queries.test.ts` (4 new cases) | all 4 failed against the old `normalizeAuthError`, which returned the generic string |
| app-owned password messages survive | same | failed: message was replaced by the generic string |
| captcha failure is actionable and does not echo upstream text | same | failed |
| unreachable auth server is a connection problem | same | failed |
| `checkOne` fails open when the client cannot be constructed | `src/lib/security/auth-rate-limit.test.ts` (new, 4 cases) | threw instead of resolving `true` |
| `checkOne` fails open on an RPC error | same | passed before and after (guard against regression) |
| `checkOne` returns the store verdict | same | passed before and after |
| caller's limit/window reach the RPC (proves F4) | same | failed: the old signature had no limit parameter |
| login submits without a captcha token | `src/test/login-captcha.test.tsx` (new) | verified red by stashing only `src/routes/login.tsx`: the handler returned early and `signIn` was never called |

Green (fresh run, this checkout):

```text
npm run typecheck   → exit 0
npm run test        → 8 files, 91 tests passed
npm run check:sql   → All 48 SQL files parse cleanly
npm run build       → exit 0
npx eslint <touched files>
                    → 6 errors, all pre-existing (queries.test.ts:19,92,440,464;
                      queries.ts:411; login.tsx:11). No new error class.
```

## 4. Bundle impact: zero

Measured by building the same tree with and without the change (changes stashed,
rebuilt, restored):

| Bundle | Before | After |
|--------|--------|-------|
| `index-*.js` | 336.38 kB (105.97 kB gzip) | 336.38 kB (105.97 kB gzip) |
| `client-*.js` | 236.19 kB (63.47 kB gzip) | 236.19 kB (63.47 kB gzip) |
| `styles-*.css` | 86.75 kB (14.88 kB gzip) | 86.75 kB (14.88 kB gzip) |

Identical byte sizes. The deleted import was already tree-shaken; the new branches
are in a module the login route already loads.

Note: `AGENTS.md` records an older baseline (index 367.76 kB). Current `HEAD` builds
at 336.38 kB, so that baseline line is stale — it is not a regression from this change.

## 5. Security impact

**Removing the client gate does not weaken enforcement.** Turnstile is enforced by
Supabase Auth against the secret key, never by the browser. Live evidence: a request
carrying `captcha_token: "XXXX.DUMMY.TOKEN.XXXX"` returned `invalid_credentials`, not
`captcha_failed`, so captcha is currently disabled project-wide. If it is re-enabled in
the dashboard, `supabase-js` still forwards a token whenever the widget produced one;
a request without one is rejected by the server, and the user now gets
*"The human check could not be completed. Please reload the page and try again."*
instead of silence. The failure direction is correct: the server decides.

**Rate limiting still enforces.** Both buckets are checked and both must pass. The
per-IP bucket now uses its declared value (10/h for signup and magic link, 20/h for
admin activation) instead of 5/h, which is the intended shared-school-network
allowance. Failing open on infrastructure error was already the documented behaviour;
it now also covers the thrown-constructor case. Residual risk, unchanged in kind: a
caller who can make the rate-limit RPC fail gets unlimited attempts, bounded by
GoTrue's own limits. The RPC is service-role only and `rate_limits` has no client grant.

**No new information disclosure.** The password policy text is public; captcha and
network copy reveal nothing about any account. `normalizeAuthError` still does not
confirm or deny account existence (the "already registered" branch is untouched).

## 6. Actions required outside this repository — **not performed**

These need the project owner and were deliberately left alone:

1. **Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the Vercel server
   environment.** Until then the limiter fails open (now silently correct, but not
   enforcing) and logs `[auth rate limit] check threw: …` on every email flow. This is
   the one remaining deployment action; it is server-side only and must never be a
   `VITE_*` variable.
2. **F5 — hosted Auth Site URL / Redirect URLs.** Unresolved and untouched. Magic-link
   and verification emails land wherever the dashboard sends them. Do not add
   `emailRedirectTo` until the allow-list is known, because GoTrue rejects an unlisted
   origin and the flow would get worse, not better.
3. **Optional:** re-enable CAPTCHA in the Auth dashboard only after confirming the
   widget renders on the deployment origin. With the client gate gone this is now safe
   to do later — it becomes a server-side policy, not a lockout.

## 7. Rollback

`git checkout -- <the six modified files>` and delete the three untracked files. No
data, schema or hosted state was touched, so there is nothing else to undo.

## 8. What this report does not claim

- The Vercel server environment could not be read, so "the key is missing on Vercel"
  remains **unverified**. What is proved is that the flow fails hard when it is missing
  and now fails open instead.
- No browser automation was available: the UI flows were verified through the route
  test and the code path, not by clicking through the deployed site.
