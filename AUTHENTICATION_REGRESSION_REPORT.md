# Clubset — Authentication Regression Report

**Date:** 2026-11-15
**Checkout:** `main` @ `d70895d` + the uncommitted remediation in
`EMAIL_AUTH_REMEDIATION_REPORT.md`
**Environment:** this checkout and the hosted Supabase project reached with the
**public publishable key only**. No production account, email inbox or
administrator credential was used.
**Method constraint:** no browser automation was available, so "verified" below means
*automated test + code path + live endpoint behaviour*, not a click-through.

---

## 1. Summary

| Flow | Verdict |
|------|---------|
| Student email/password sign-in | **Works** — route test proves submit no longer blocked; live GoTrue answers a wrong password correctly |
| Student magic link (password left blank) | **Code path works; delivery unverified** — needs the hosted Site URL |
| Student signup (email + password) | **Works**; password-policy and breach messages now reach the user |
| Email verification after signup | **Depends on hosted Site URL — unresolved (F5)** |
| Password reset / recovery | **Not implemented in this product** (no route, no `resetPasswordForEmail`) |
| Google OAuth | **Code path unchanged and correct; not exercised live** |
| Administrator passwordless activation | **Works as designed** — silent for non-allowlisted, activation gated in DB |
| Change password (settings) | **Code path present and guarded; not exercised** |
| Session persistence / sign-out | Unchanged by this work |

Project checks (fresh run):

| Check | Result |
|-------|--------|
| `npm run typecheck` | exit 0 |
| `npm run test` | 8 files, **91 tests passed** |
| `npm run check:sql` | all 48 SQL files parse cleanly |
| `npm run build` | exit 0, bundle sizes identical to before the change |
| `npm run lint` (touched files) | 6 pre-existing errors, **no new ones** |

---

## 2. Flow-by-flow

### 2.1 Student email/password sign-in

**Path:** `login.tsx:119` → `useSignIn()` (`queries.ts:172`) → `signInWithPassword`.

- Before this change the handler returned early whenever `captchaRequired && !token`,
  and `captchaRequired` was always true. On any network that could not load
  `challenges.cloudflare.com` the form could never be submitted.
- Now the handler always calls `useSignIn`; a token is forwarded only if the widget
  produced one.
- **Automated:** `src/test/login-captcha.test.tsx` renders `/login`, fills email and
  password, clicks *Continue*, and asserts `signIn` is called with
  `{ email, password }` while no token exists. This test **fails against the old
  `login.tsx`** (verified by stashing that one file) and passes now.
- **Live:** a password grant for a synthetic address with a deliberately invalid
  captcha token returns
  `HTTP 400 {"error_code":"invalid_credentials"}` — the project does not enforce
  captcha, and a wrong password is reported as a wrong password, never as a captcha
  failure.
- **Error copy:** the page renders `normalizeAuthError(signIn.error)`. Wrong
  credentials still produce *"Unable to sign in. Please check your email and
  password."* Network failures now produce *"We couldn't reach the sign-in service…"*
  instead of the generic line.

### 2.2 Student magic link (leave password blank)

**Path:** same handler, empty password branch → `enforceAuthRateLimit(magic_link)` →
`signInWithOtp({ shouldCreateUser: true })`.

- This is the flow most likely to have failed before: if the server runtime lacked
  `SUPABASE_SERVICE_ROLE_KEY`, the server function rejected and the page showed the
  generic message before Supabase Auth was contacted at all. `checkOne` now fails
  open, so the email is requested regardless.
- **Automated:** `auth-rate-limit.test.ts` proves `checkOne` resolves `true` when the
  service-role client throws and when the RPC errors, and that the per-IP limit passed
  to the RPC is `perIp`.
- **Not verified:** actual email delivery and the destination of the link (F5).

### 2.3 Student signup

**Path:** `signup.tsx:58` → `useSignUp()` (`queries.ts:248`) → rate limit →
`assertPasswordNotBreached` → `signUp`.

- Before: the same always-on captcha gate; then, if the password failed the project
  policy (which requires lower case **and** upper case **and** a digit), GoTrue's
  `422 weak_password` was flattened to the generic string. This is the most likely
  cause of the reported message on a signup attempt.
- Now: policy failures read *"Please choose a stronger password with lower case and
  upper case letters and at least one number."*; a breached password keeps the app's
  own *"This password has appeared in a known data breach…"*; an unavailable breach
  check keeps its own retry message instead of the generic one.
- **Automated:** 4 new `normalizeAuthError` cases cover exactly these messages, plus
  the captcha and network families. All 4 failed before the change.
- **Not verified:** a real account creation end-to-end (would require an inbox and a
  real address, which the brief forbids).

### 2.4 Email verification

Unchanged by this work. Signup sets nothing in `options`, and `emailRedirectTo`
appears nowhere in `src/`. Where the verification link lands is decided by the hosted
**Site URL / Redirect URLs** allow-list. `mailer_autoconfirm` is `false`
(confirmed live), so verification is required.

**Unresolved (F5).** This cannot be fixed from the repository: GoTrue validates
`redirect_to` against the allow-list, so adding a redirect target blindly would make
the flow fail harder. Needs the project owner.

### 2.5 Password reset / recovery

**Absent from the product.** There is no route, no form and no
`resetPasswordForEmail` call. `AUTH_RATE_LIMITS.password_reset` config is reserved but
unused. This is a product gap, not a regression; it is listed rather than fixed
because no requirement asked for it.

### 2.6 Google OAuth

`useGoogleSignIn()` (`queries.ts:230`) calls `signInWithOAuth` with
`prompt: "select_account"` and `oauthRedirectUrl()`. The hosted project reports
`external.google: true` (live). Nothing in this change touches OAuth; the login page
still reports returned OAuth errors through `readOAuthError()` /
`oauthErrorMessage()`.

**Not exercised live** — a real Google account was out of scope.

### 2.7 Administrator passwordless activation

**Path:** `login.tsx:151` → `useAdminLogin()` (`queries.ts:74`):
rate limit (`admin_allowlist`) → `check_administrator_allowlist(email)` → if
allowlisted, `signInWithOtp`; if not, stop **silently**. After the emailed link,
`AuthProvider` calls `requestAdministratorActivation()` →
`activate_administrator()`.

- The client gate that pre-blocked this form is removed; the allowlist pre-check is
  still the only thing consulted, and the hook still resolves identically for
  allowlisted and non-allowlisted addresses (no enumeration oracle).
- **Live:** `check_administrator_allowlist` is callable by `anon` and returns
  `false` for a synthetic address without revealing anything else. `admin_allowlist`
  itself has no client grant.
- **Not verified:** the full emailed activation handshake (needs a real allowlisted
  address and its inbox). `activate_administrator` remains authenticated-only and
  allowlist-authoritative in the database; that was not changed.

### 2.8 Change password

`useChangePassword()` (`queries.ts:302`) runs `assertPasswordNotBreached` before
`updateUser({ password })`. Unchanged and untested by this work.

---

## 3. Rate limiting

| Bucket | Declared | Applied before | Applied now |
|--------|----------|----------------|-------------|
| signup, per email | 5 / h | 5 / h | 5 / h |
| signup, per IP | 10 / h | **5 / h** (bug) | 10 / h |
| magic link, per email | 5 / h | 5 / h | 5 / h |
| magic link, per IP | 10 / h | **5 / h** (bug) | 10 / h |
| admin allowlist, per email | 10 / h | 10 / h | 10 / h |
| admin allowlist, per IP | 20 / h | **10 / h** (bug) | 20 / h |
| password reset | 3 / email, 5 / IP | n/a — flow absent | n/a |

Infrastructure failure (RPC error **or** thrown client construction) now fails open
and logs server-side. Previously a throw rejected the whole server function.

---

## 4. Database security re-checked (unchanged by this work)

| Probe | Result |
|-------|--------|
| anon `GET /rest/v1/clubs` | `200 []` — no `42501`, so policy predicates still have `EXECUTE` |
| anon `check_administrator_allowlist(...)` | `200 false` |
| anon `GET /rest/v1/rate_limits` | `42501` — intentionally not client-readable |
| `check_rate_limit` executable by client roles | no |
| `activate_administrator` | authenticated only |
| `admin_allowlist` client grants | none |

No migration, policy or grant was added or modified by this work.

---

## 5. What was **not** tested, and why

1. **Clicking through the deployed site.** No browser automation; the route test plus
   the live endpoint behaviour is the substitute.
2. **Email delivery** (magic link, verification, activation). Requires a real inbox;
   the brief forbids real addresses. `mailer_autoconfirm: false` is confirmed.
3. **The hosted redirect allow-list / Site URL.** Not readable from this environment.
   This is the remaining unresolved cause (F5).
4. **The Vercel server environment variables.** Not readable. Whether that deploy has
   `SUPABASE_SERVICE_ROLE_KEY` remains unknown; the code no longer depends on it to
   avoid a hard failure.
5. **A real Google sign-in and a real administrator activation.**
6. **Password reset** — the feature does not exist.

---

## 6. Verdict

The reported generic message had three code-level causes; all three are fixed and
covered by tests. Password sign-in and signup now either succeed or explain
themselves. One cause — the hosted email redirect target — cannot be resolved from
this repository and is handed back to the project owner together with the one
server-side environment variable the deployment still needs.
