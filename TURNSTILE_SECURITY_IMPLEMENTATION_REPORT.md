# Clubset — Turnstile Security Implementation Report

**Date:** 2026-11-15
**Checkout:** `main` @ `d70895d` + uncommitted work (all changes are in the working tree)
**Architecture:** Supabase-native CAPTCHA (GoTrue verifies every token with Cloudflare
Siteverify). No custom verification function, no auth proxy, no second verification layer.
**Status:** code complete and verified locally. Hosted CAPTCHA was enabled by the project
owner on 2026-11-15 and **live enforcement is now confirmed** (section 5). Nothing was
committed, pushed or deployed; no Cloudflare, Supabase or Vercel setting was touched by
the agent.

---

## 1. Previous vulnerability and confirmed root cause

The app has always rendered a Turnstile widget and forwarded its token on login, magic
link, signup and administrator activation. No hosted check was consuming that token.

**Root cause:** CAPTCHA was disabled in the hosted Supabase project. GoTrue's captcha
middleware returns early when `config.Security.Captcha.Enabled` is false
(`supabase/auth` → `internal/api/middleware.go:251-253`). With it off, the token was
decoration: any client could post to the Auth API directly with no token and get the same
result, and the app's client-side gate was security theatre (and, when the widget could
not load, an availability bug — see `EMAIL_AUTH_INVESTIGATION_REPORT.md` F1).

**Proof of the root cause, before the toggle was flipped:**

```text
POST /auth/v1/token?grant_type=password
  { …, gotrue_meta_security: { captcha_token: "XXXX.DUMMY.TOKEN.XXXX" } }
→ 400 {"error_code":"invalid_credentials"}      # not captcha_failed
```

Captcha runs before the password grant handler (`internal/api/api.go:268`,
`internal/api/middleware.go:247-286`), so a bogus token with captcha *on* can only produce
`captcha_failed`. It produced `invalid_credentials` → the toggle was off.

**After the owner enabled it** (same probe set, section 5) every protected call is
rejected without a valid token — including direct calls that never touch this app.

## 2. Chosen architecture and why

| Option | Outcome |
|---|---|
| **A. Supabase-native CAPTCHA (chosen)** | GoTrue calls Cloudflare Siteverify server-side before the auth operation runs. Direct API calls are rejected too. No secret in the app. Covers password, magic link, signup, OTP, recover and resend. |
| B. Our own Siteverify server function | Rejected: the publishable key is public, so an attacker calls GoTrue directly and skips our function. It cannot satisfy "cannot be bypassed by calling the endpoint directly". |
| C. A + B | Impossible: Turnstile tokens are single-use (`timeout-or-duplicate` on the second verify). |

GoTrue applies the check to `/signup`, `/recover`, `/resend`, `/magiclink`, `/otp` and
`/token` (`internal/api/api.go:229,256,259,262,265,268`), skipping only the `pkce`,
`refresh_token` and `id_token` grants (`middleware.go:288-311`) — none of which is a bot
vector here (the app uses the implicit flow; links are consumed client-side from the URL
hash).

**Hostname and action:** hostname restriction belongs to the Cloudflare widget's hostname
allowlist, not to GoTrue. GoTrue verifies the token and checks the provider's `success`
result; **it does not validate an `action` value**, so no action is set and none is
claimed. Setting one would be decoration.

## 3. Files changed for this task

| File | Change |
|---|---|
| `src/components/auth/turnstile-widget.tsx` | Added a **Try again** control to the existing failure state. Retry clears any token, clears the error, and re-runs the mount effect (the script loader already drops its cached rejection, so the next attempt really hits the network). Credentials stay in the form. Token / expiry / timeout / reset behaviour is unchanged. |
| `src/test/turnstile-widget.test.tsx` (new) | 8 tests: no site key, token forwarding, expiry, timeout, reset, script-load failure, retry without reload, widget render throw. |
| `src/lib/queries.test.ts` | 4 tests that the token reaches `signInWithPassword`, `signInWithOtp` (magic link), `signUp`, and the administrator `signInWithOtp`. Existing tests untouched. |
| `src/lib/queries.ts` | Captcha branch copy now says "Please complete the check and try again" instead of "reload the page", because the widget resets itself and a reload would lose the typed credentials. (The rest of this file's diff is the earlier auth-error work.) |
| `.env.example` | Documents `VITE_TURNSTILE_SITE_KEY` as public, explains that an empty value disables the widget, and states that the secret belongs in Supabase Auth only. |

No migration, RLS policy, grant, server function or route shape changed. CODEMAP is
unchanged because the architecture did not change.

## 4. Protected and unprotected flows

| Flow | Protected | Mechanism |
|---|---|---|
| Student password sign-in | **yes** | `/token?grant_type=password` |
| Magic link | **yes** | `/otp` |
| Signup | **yes** | `/signup` |
| Administrator activation email | **yes** | `/otp` via `useAdminLogin` |
| Password reset | not built | `/recover` is already wrapped, so it is covered when built |
| Email verification click | no | implicit flow, browser-side hash. Not a bot vector |
| Google OAuth start | **no** | `/authorize` is not wrapped and cannot carry a captcha token. Google's own bot defences apply |
| Change password while signed in | **no** | `/user` update; already authenticated |
| Token refresh / sign-out | no | deliberately exempt by GoTrue |
| `enforceAuthRateLimit`, HIBP proxy (our server functions) | no | separate, independent layer; unchanged |

## 5. Test results and security verification

### 5.1 Automated (fresh run, final tree)

```text
npm run typecheck   → exit 0
npm run test        → 9 files, 103 tests passed
npm run check:sql   → All 48 SQL files parse cleanly
npm run build       → exit 0
npx eslint <touched files>
                    → 5 errors, all pre-existing (queries.test.ts:19,107,455,479;
                      queries.ts:411). No new error class.
```

TDD evidence: the retry tests were written first and **failed** (2 of 7: "shows a retry
control…", "retries without a page reload…") because no retry control existed; both pass
after the change. The 4 token-forwarding tests are characterisation tests for existing
behaviour — each fails the moment the `captchaToken` spread is removed from its mutation.

Bundle: `index` 336.38 kB (105.96 gzip), `client` 236.19 kB (63.47 gzip), `styles`
86.75 kB (14.88 gzip) — unchanged from before this task.

### 5.2 Live hosted enforcement (after the owner enabled CAPTCHA)

All probes used the public publishable key and `synthetic-probe-not-a-user@example.invalid`.

```text
POST /auth/v1/token?grant_type=password   (no token)
→ 400 captcha_failed  "no captcha_token found"

POST /auth/v1/token?grant_type=password   (bogus token)
→ 400 captcha_failed  "invalid-input-response"

POST /auth/v1/signup                      (no token)
→ 400 captcha_failed  "no captcha_token found"

POST /auth/v1/otp                         (no token, create_user:false)
→ 400 captcha_failed  "no captcha_token found"
```

`invalid-input-response` (rather than `invalid-input-secret`) proves GoTrue reached
Cloudflare Siteverify with a **valid configured secret**. No account, email or row was
created by these probes.

This is the direct-API bypass test: the request never touched the Clubset app and was
still rejected.

### 5.3 Secret containment

- `TURNSTILE_SECRET_KEY` (local `.env`, read from the file into a variable, never printed)
  appears **0 times** in all 165 build output files, including all 62 public assets.
- `service_role` string appears only in three **server-only** files under `.output/server/`
  (two library warnings and `client.server-*.mjs` reading `process.env`). Nothing public.
- The public site key appears in public assets, as intended.
- `TURNSTILE_SECRET_KEY` is **not read by any source file**. With native verification it
  belongs only in Supabase Auth.

## 6. Required configuration (manual, not performed by the agent)

### Supabase — done by the owner

1. Auth → Bot and Abuse Protection → Enable CAPTCHA → Cloudflare Turnstile.
2. Secret key: the one paired with site key `0x4AAAAAAF76helKiOEKD9yk`. **Done** — live
   probes confirm it is accepted.
3. Do not add the secret to Vercel or to any `VITE_` variable.

### Cloudflare — please confirm

4. The widget's hostname allowlist contains `clubset.vercel.app` (confirmed as the only
   production hostname) **and the Vercel preview domains** (confirmed included).
5. `localhost` is **not** on the list per your instruction to run this on the Vercel site.
   Consequence: local sign-in/signup will fail closed until you add `localhost` (or use a
   preview deployment for testing).

### Vercel

6. Nothing to add. The existing service/public keys are unrelated to CAPTCHA. Do not add
   the Turnstile secret.
7. Deploy this branch to pick up the retry control and the improved captcha message. The
   live bundle predates this change, so today a captcha failure there still shows the old
   generic message — enforcement itself is already active regardless.

## 7. Remaining risks

1. **OAuth is not captcha-protected.** `/authorize` cannot carry a token. Mitigation:
   Google's own protections; the account still cannot become administrator without the
   allowlist handshake.
2. **Change-password is not captcha-protected**; it requires an authenticated session.
3. **A network that blocks `challenges.cloudflare.com` makes auth unavailable.** This is
   inherent to fail-closed enforcement. The widget now offers a retry, and the error copy
   says so.
4. **The rate limiter runs before the captcha check.** An attacker can consume a known
   address's 5/hour budget without solving a challenge. Pre-existing; the layers are
   independent by design.
5. **Action is not validated** by GoTrue; only the token's success result is. Hostname is
   enforced by the Cloudflare widget.
6. **No automated test can prove hosted enforcement**; section 5.2 is a point-in-time live
   probe. Re-run the four curl calls after any Auth config change.
7. Local files: `TURNSTILE_SECRET_KEY` in `.env` is now unused by code; it is gitignored
   and untouched. `@marsidev/react-turnstile` was added to `package.json` during this
   session by someone else and is imported nowhere — see the review.

## 8. Manual verification steps

1. Open `https://clubset.vercel.app/login` (after deploying this branch), enter a
   synthetic email and a password. The Turnstile widget must render before submit.
2. Submit **without** solving it → "The human check could not be completed. Please
   complete the check and try again." The widget shows a fresh challenge.
3. Solve it and submit a wrong password → "Unable to sign in…" and a **new** challenge
   (single-use token reset works).
4. Block `challenges.cloudflare.com` in dev tools and reload → the widget shows "The human
   check could not load…" with **Try again**; unblock and click it → the widget loads
   without losing the typed email.
5. Re-run the four curl probes in 5.2 after any Supabase Auth change.

## 9. Summary

**Completed (code):** retry control in the widget, captcha error copy that points at the
retry instead of a reload, 8 widget tests, 4 token-forwarding tests, `.env.example`
documentation. 103/103 tests pass, typecheck/build/SQL clean, no new lint errors, no
secret in any bundle.

**Verified live (hosted):** password, signup and OTP endpoints reject missing and invalid
tokens, including direct API calls; the configured secret is accepted by Cloudflare.

**Unverified:** widget rendering on `clubset.vercel.app` and preview domains (browser
automation unavailable); whether `localhost` remains usable (per your instruction, not
allowlisted); Cloudflare hostname list contents (dashboard not readable).

**Needs your approval:** deploying this branch; removing the unused
`@marsidev/react-turnstile` dependency; adding `localhost` to the widget allowlist if you
ever want local auth testing; building a password-reset flow (which `/recover` already
covers).
