# Clubset — Email Authentication Investigation Report

**Date:** 2026-11-15
**Checkout:** `main` @ `d70895d` (clean working tree at start; same commit as the GitHub snapshot inspected earlier)
**Investigator:** agent session, read-only against the hosted project
**Scope:** student email/password login, magic-link login, student signup and
email verification, Google OAuth return, administrator passwordless activation,
Turnstile, application rate limiting, and the error copy those flows surface.

---

## 1. Reported symptom

> Email authentication shows a generic message ("Something went wrong. Please
> try again.") instead of a useful one, or does not complete.

No reproduction steps were supplied. Per the task brief the cause was treated as
unknown until proved. The only user-supplied datum is that the attempt happens
on the Vercel deployment (`clubset.vercel.app`).

---

## 2. Assumptions (stated, then tested)

| # | Assumption | Status |
|---|-----------|--------|
| A1 | `clubset.vercel.app` serves a build of *this* repository | **Confirmed.** `/assets/login-DGSTofdd.js` contains this repo's login implementation verbatim, including the exact captcha-gate block and `normalizeAuthError`. |
| A2 | The Vercel build talks to the same Supabase project as the checked-in config | **Confirmed indirectly.** The bundle's server-function id resolves on the host (`/_serverFn/<id>` returns a handler error, an unknown id returns the HTML 500 page), and the checked-in public config is the only URL available to a build with no env vars. |
| A3 | The hosted Auth project is configured for email + Google with verification required | **Confirmed.** `GET /auth/v1/settings` → `mailer_autoconfirm: false`, `external.email: true`, `external.google: true`, `disable_signup: false`. |
| A4 | A generic message means `normalizeAuthError()` fell through to its final branch | **Confirmed** by reading `src/lib/queries.ts` and reproducing each branch. |
| A5 | Real credentials or PII would not be needed to prove anything | **Confirmed.** All probes used a synthetic address (`synthetic-probe-not-a-user@example.invalid`) and the public publishable key. |

Not assumed: that Supabase itself is at fault. It is not, in any reproduced case.

---

## 3. What was inspected

Code:

- `src/lib/queries.ts` — `useSignIn()`, `useAdminLogin()`, `useSignUp()`,
  `useChangePassword()`, `normalizeAuthError()`, `requestAdministratorActivation()`,
  `useGoogleSignIn()`, `useViewerId()`.
- `src/routes/login.tsx`, `src/routes/signup.tsx`, `src/routes/settings.tsx`.
- `src/lib/auth/context.tsx` — session query, profile query, activation
  handshake, post-sign-in routing.
- `src/lib/auth/oauth.ts` — redirect URL, returned-OAuth-error parsing.
- `src/lib/supabase/client.ts`, `src/lib/supabase/public-config.ts`,
  `src/integrations/supabase/client.ts`, `.server.ts`, `.env`, `.env.example`,
  `wrangler.jsonc`, the generated `.output/server/wrangler.json`.
- `src/components/auth/turnstile-widget.tsx`, `src/lib/security/turnstile.ts`.
- `src/lib/security/auth-rate-limit.functions.ts`,
  `src/lib/security/passwords.ts`, `pwned-passwords.functions.ts`,
  `pwned-passwords.server.ts`.
- `supabase/migrations/20261107000000_add_auth_rate_limiting.sql`,
  `20261111014718_lock_rate_limits_table.sql`, and the allowlist migrations.

Live, read-only:

- `GET /auth/v1/settings`, `POST /auth/v1/token?grant_type=password` (synthetic,
  deliberately wrong), `POST /rest/v1/rpc/check_administrator_allowlist`,
  `GET /rest/v1/{clubs,profiles,rate_limits}`, `GET /auth/v1/...` error paths.
- Logs Explorer (`auth_logs`, `auth_audit_logs`, `postgres_logs`) via the
  Supabase MCP server.
- The deployed bundles of `clubset.vercel.app`.
- Local dev server (`npm run dev`, port 8080) and the generated server output.

---

## 4. Confirmed findings

### F1 — A broken Turnstile widget locks every login form (availability bug)

**Evidence**

- `src/lib/security/turnstile.ts:28` hard-codes
  `FALLBACK_TURNSTILE_SITE_KEY = "0x4AAAAAAF76helKiOEKD9yk"`.
- `turnstileSiteKey()` (`:64-71`) returns that fallback whenever no env
  override is set — which is always, because `.env` has no
  `VITE_TURNSTILE_SITE_KEY` and `wrangler.jsonc` sets the same value.
  Therefore `isTurnstileConfigured()` was **always true**.
- `src/routes/login.tsx` (pre-fix `:86, :125-128`) and
  `src/routes/signup.tsx` (pre-fix `:50, :69-72`) refused to submit while
  `captchaRequired && !captchaToken`, showing
  *"Please complete the human check first, then try again."*
- `src/components/auth/turnstile-widget.tsx:82-92` calls
  `onToken(null)` when the challenge script fails to load or the widget errors.
  It also prints *"The human check could not load."*
- Consequence: on a network that blocks `challenges.cloudflare.com` (school
  Wi-Fi, privacy extensions, strict CSP, offline), the token never arrives, so
  **email/password sign-in, magic link, signup and administrator activation all
  become impossible** — with no way for the user to proceed.

**And the gate protects nothing today.** The hosted Auth server does not verify
captcha:

```text
POST /auth/v1/token?grant_type=password
  { email: synthetic…@example.invalid,
    password: "not-a-real-password",
    gotrue_meta_security: { captcha_token: "XXXX.DUMMY.TOKEN.XXXX" } }
→ 400 { "error_code": "invalid_credentials", "msg": "Invalid login credentials" }
```

A bogus token produced `invalid_credentials`, not `captcha_failed`. A request
with **no** token produced the same. So CAPTCHA is disabled project-wide, the
client-side gate was pure availability risk, and the server is (correctly) the
only enforcement point.

### F2 — `normalizeAuthError()` flattens actionable errors into the generic string

**Evidence** — `src/lib/queries.ts` (pre-fix) recognised only four families:
"already registered", "invalid login/credentials", "not confirmed",
"too many/rate limit". Everything else became
*"Something went wrong. Please try again."*

Reproduced by running the real function in this checkout:

```text
normalizeAuthError("This password has appeared in a known data breach. Please choose a different password.")
→ "Something went wrong. Please try again."
normalizeAuthError("We couldn't verify this password right now. Please try again.")
→ "Something went wrong. Please try again."
```

The first message is produced by the app itself (`BREACHED_PASSWORD_MESSAGE`,
`src/lib/security/passwords.ts:7`) and is then destroyed by the page before it
reaches the user (`src/routes/signup.tsx:93`). The second is the deliberate
fail-closed HIBP outcome (`passwords.ts:10`).

The hosted Auth server's weak-password rejection is in the same bucket. Exact
message observed:

```text
422 { "error_code": "weak_password",
      "msg": "Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789." }
```

That also normalized to the generic string before the fix. A student choosing an
all-lowercase password is therefore told nothing useful — this is the most
likely single explanation for the reported message on a signup attempt.

Other messages that reached the same dead end: `captcha_failed`,
`user_banned`, `signup_disabled`, `email_address_invalid`, any 5xx, and every
network/CORS failure (`Failed to fetch`).

Because `src/routes/login.tsx:294-298` renders `normalizeAuthError(signIn.error)`,
any unrecognised password-grant failure produces the generic line there too.

### F3 — The rate limiter's documented "fail open" path does not fail open

**Evidence**

- `src/lib/security/auth-rate-limit.functions.ts:72-96` (pre-fix): the service-role
  client is imported and `supabaseAdmin.rpc(...)` is awaited **outside** any
  `try`. Only a *returned* `error` was handled
  (`if (error) { … return true; }`, comment: *"Fail open"*).
- `src/integrations/supabase/client.server.ts:31-46` **throws** when
  `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing. A thrown error
  therefore escaped `checkOne`, rejected the server function, and surfaced to the
  page as an unrecognised error — i.e. F2's generic message.
- The key is missing from every place the server runtime reads it:
  - `.env` (local): `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` set;
    **`SUPABASE_SERVICE_ROLE_KEY` absent**.
  - `wrangler.jsonc` vars → generated `.output/server/wrangler.json`: only the
    three public `VITE_*` values. No service-role key, no `SUPABASE_URL`.
- `enforceAuthRateLimit` runs **before** `signInWithOtp` (magic link),
  `signUp`, and the administrator `signInWithOtp` (`queries.ts:187-192`,
  `:258-263`, `:78-83`). So on a runtime without the key, all three of those
  flows fail before Supabase Auth is ever contacted, and the user sees the
  generic message. Password sign-in never calls the limiter, which is why it is
  unaffected.

**Honest limit on the evidence:** the Vercel environment's server-side
variables cannot be read from outside, so whether *that* deployment carries the
key is **unverified**. What is proved is the code path: when the key is absent —
as it provably is locally and in the repository's own Cloudflare config — the
flow fails with a generic message instead of failing open as documented.

### F4 — The per-IP rate limit is never applied

**Evidence** — `AUTH_RATE_LIMITS` defines `perEmail` **and** `perIp`
(`auth-rate-limit.functions.ts:39-44`), but the handler passed the whole config
to `checkOne`, which always used `config.perEmail` for both buckets:

```ts
checkOne(`email:${…}`, data.operation, config),
checkOne(`ip:${ip}`,    data.operation, config),   // also perEmail
```

Result: the IP bucket is throttled at the *email* limit — 5/h for `signup` and
`magic_link` instead of the declared 10/h. On a shared school NAT that locks out
a whole classroom sooner than intended, and the declared `perIp` values are
dead configuration.

### F5 — No email flow supplies a redirect target

`emailRedirectTo` appears **nowhere** in `src/`. `signInWithOtp` (`queries.ts:103`,
`:194`) and `signUp` (`:274`) pass only `shouldCreateUser`/`data`/`captchaToken`.

Consequence: where the verification / magic-link email lands is decided entirely
by the hosted **Site URL** and **Redirect URLs** allow-list, which are not in
this repository and could not be read. If Site URL is not this deployment, the
emailed link returns the browser to a different origin, `detectSessionInUrl`
never sees a session there, and the user experiences "the link did nothing".

**Status: unresolved, needs the project owner.** It cannot be confirmed without
the dashboard, and it must not be "fixed" blindly: GoTrue validates
`redirect_to` against the allow-list, and an unlisted origin is only safe to send
if the allow-list already contains it.

### F6 — Accounts created by Google or magic link have no password

`signInWithPassword` on an account with no password returns
`invalid_credentials`. `login.tsx` renders that as
*"Unable to sign in. Please check your email and password."* — which invites the
user to keep retrying a password that was never set. Not a crash, not a security
issue, but a real dead end on the same form (the password field is labelled
"optional").

---

## 5. Ruled out (with the evidence that ruled them out)

| Candidate | Verdict |
|---|---|
| Wrong Supabase URL / rotated key | **No.** `GET /auth/v1/settings` with the checked-in publishable key returns `200`; `GET /rest/v1/clubs` returns `200 []`. |
| CAPTCHA misconfiguration causing rejections | **No, but see F1.** A deliberately invalid captcha token is not rejected at all, so no captcha failure can be occurring. |
| `signInWithPassword` request shape | **Correct.** `{ email, password, options?: { captchaToken } }` matches supabase-js v2. |
| Signup trigger (`handle_new_auth_user`) crashing | **No.** No `ERROR`/`FATAL` rows in `postgres_logs` for the last 24 h. |
| Rate-limit table exposed to clients | **No.** `public.rate_limits` has RLS and **no** grants for `anon`/`authenticated` (verified in `pg_class.relacl` and by a `42501` on an anon read); `check_rate_limit` is not executable by either role. `20261111014718_lock_rate_limits_table.sql` is the migration that locked it. |
| Blanket `EXECUTE` revoke breaking RLS for signed-out visitors (AGENTS.md trap) | **No.** `GET /rest/v1/clubs` (anon) = `200 []`; `check_administrator_allowlist` (anon) = `200 false`. The only `42501`s are on tables/functions that are intentionally authenticated-only (`profiles`, `search_clubs`, `upcoming_events`). |
| Email case-sensitivity / normalisation mismatch | **No.** Client normalises with `lower(btrim())`, matching `check_administrator_allowlist()` and `handle_new_auth_user()`; GoTrue normalises independently. |
| A stale/other deployment | **Partly.** `clubset.vercel.app` **is** this code (see A1), but the Auth logs also show traffic from `joinin-…vercel.app` and `clubset.vercel.app` hitting `grant_type=password` with `invalid_credentials`. Those requests are consistent with a wrong password, and are *not* evidence of a code fault. |

---

## 6. Root-cause chain

```text
reported generic message
├── signup / password choice
│     └── GoTrue weak_password  ─┐
│         HIBP breached         ─┼─→ normalizeAuthError(): no branch → generic   [F2]
│         HIBP unavailable      ─┘
├── magic link / admin activation / signup
│     └── enforceAuthRateLimit → service-role client throws
│         (SUPABASE_SERVICE_ROLE_KEY absent from .env and wrangler vars)
│         → server fn rejects → unrecognised error → generic                    [F3]
├── any flow, browser cannot load Turnstile
│     └── client-side gate blocks submit forever                                 [F1]
└── email link lands on the wrong origin (Site URL not in this repo)
      └── no session established                                                  [F5, unverified]
```

Password login with a wrong password is **not** part of this chain: it already
produced *"Unable to sign in. Please check your email and password."*

---

## 7. Unresolved issues

1. **F5** — hosted Auth Site URL / Redirect URLs. Needs dashboard access.
2. Whether the Vercel project sets `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` for its server runtime. Not observable from here.
3. Whether the deployment in use is the Vercel one or a Lovable preview. The
   preview origin answers `401` without project credentials and could not be
   inspected.
4. **No password-reset flow exists** (no route, no `resetPasswordForEmail`
   call, no request form), even though the schema and `AUTH_RATE_LIMITS` both
   reserve `password_reset`. This is a product gap, not a defect in a flow.
5. A user whose account has no password, or whose email is unconfirmed, is not
   steered to the magic-link option on `/login` (F6).

---

## 8. Limitations of this investigation

- No browser automation was available, so the flows were verified through the
  code path, unit/route tests, the live Auth/REST endpoints, and the deployment's
  own bundles — not by clicking through the UI.
- The hosted Auth service configuration (Site URL, redirect allow-list, email
  templates, rate-limit values) is not readable from this environment.
- A request to the local `/_serverFn/<rate-limit id>` returned `500`, but the
  body was rejected by the seroval request decoder before the handler ran. That
  probe therefore **does not** prove the env-var failure; F3 rests on the code
  path plus the repository's own generated runtime config, and on the unit test
  that reproduces the throw.
