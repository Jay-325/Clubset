# Auth Redirect Remediation Report

**Date:** 2026-11-15
**Branch:** `main` @ `d70895d` (all work below is uncommitted)
**Scope:** email-link destinations for student signup verification, student magic-link login, and
administrator activation; plus the Turnstile/deployment readiness check.
**Out of scope:** hosted Supabase settings, Cloudflare, Vercel, SMTP, commits, deploys.

---

## 1. Confirmed root causes

### R1 — Hosted Site URL points at the obsolete Joinin deployment

The hosted project's Auth **Site URL** is still
`https://joinin-44b91fde-joinin1.vercel.app`. GoTrue uses the Site URL for **every** emailed link
that does not carry an explicit `emailRedirectTo`. Both domains currently serve the same bundle
(`index-9vx0vh-M.js`, SHA-256 prefix `9271A2941E21E5E4`), which is why the wrong-domain link still
"works" today and hid the bug.

### R2 — The client never sent a redirect target

Before this change, `signUp()` and both `signInWithOtp()` call sites passed only `captchaToken` (and
`data` for signup). No `emailRedirectTo` existed anywhere in `src/`, so the fallback in R1 was
always taken.

### R3 — Stale redirect documentation

`src/lib/auth/oauth.ts` claimed the Site URL was `https://clubset.lovable.app`. It is not. The
comment is corrected; `oauthRedirectUrl()` behaviour itself was already correct (it uses the
browser's own origin, which the hosted allow-list accepts).

### Not a cause — the redirect allow-list

The allow-list already accepts Clubset. Probed with `GET /auth/v1/verify` and a bogus token
(303 + `Location` inspection):

| `redirect_to` sent | Result |
| --- | --- |
| `https://clubset.vercel.app/`, `/onboarding`, `/auth/callback` | honoured (`https://clubset.vercel.app/**`) |
| `http://127.0.0.1:8080/login` | honoured |
| `http://localhost:8080/login`, `http://localhost:3000/login` | fell back to Joinin |
| `https://clubset.lovable.app`, `https://example.com`, `http://clubset.vercel.app` | fell back to Joinin |
| `https://clubset.vercel.app.evil.example` | fell back to Joinin (no suffix trick) |
| guessed preview `https://clubset-git-main-clubset.vercel.app` | fell back to Joinin |

`/auth/v1/authorize` echoes any `redirect_to` and is therefore **not** a valid oracle;
`/auth/v1/verify` is.

---

## 2. Files changed

| File | Change |
| --- | --- |
| `src/lib/auth/oauth.ts` | Added `CANONICAL_APP_ORIGIN = "https://clubset.vercel.app"` and `emailRedirectUrl(origin?)`. Added `OAuthUrlError.errorCode` and `error_code` parsing. Corrected the stale Site URL comment. |
| `src/lib/queries.ts` | `useAdminLogin`, `useSignIn` (magic link) and `useSignUp` now pass `options.emailRedirectTo = emailRedirectUrl()`. |
| `src/routes/login.tsx` | `error_code=otp_expired` gets its own "link is invalid or has expired" copy instead of the Google-failure message. |
| `.env.example` | Documented `VITE_AUTH_REDIRECT_ORIGINS` (exact origins only, must also be on the hosted allow-list). |
| `src/lib/auth/oauth.test.ts` | New tests: canonical selection, trailing slash, rejected origins, env-listed origin, `error_code` parsing. |
| `src/lib/queries.test.ts` | CAPTCHA assertions now include the redirect; new describe block for the three email flows. |
| `src/test/email-link-landing.test.tsx` | New: `/login#error=access_denied&error_code=otp_expired` shows the expired-link copy, not the Google copy. |
| `src/test/auth-session-landing.test.tsx` | New: a verified session with an incomplete student profile routes to `/onboarding` and `activate_administrator()` still runs. |
| `docs/superpowers/plans/2026-11-15-auth-redirects.md` | Implementation plan. |

No other `signUp` / `signInWithOtp` / `resetPasswordForEmail` / `resend` call sites exist in `src/`.

---

## 3. Redirect behaviour by environment and flow

`emailRedirectUrl()` accepts only an **exact** origin: the canonical origin plus anything listed in
`VITE_AUTH_REDIRECT_ORIGINS`. It never reads a URL parameter, never accepts a wildcard, and falls
back to the canonical origin otherwise. The hosted allow-list remains the real enforcement point —
GoTrue returns to the Site URL for anything it does not list.

| Environment | Signup verification | Magic link | Admin activation |
| --- | --- | --- | --- |
| Production `https://clubset.vercel.app` | `…/login` | `…/login` | `…/login` |
| Obsolete `joinin-…vercel.app` still serving | `https://clubset.vercel.app/login` | same | same |
| Unlisted preview deployment | `https://clubset.vercel.app/login` | same | same |
| `http://127.0.0.1:8080` **and** listed in `VITE_AUTH_REDIRECT_ORIGINS` | `http://127.0.0.1:8080/login` | same | same |
| `http://localhost:8080` | canonical (not on allow-list) | canonical | canonical |
| Any user-supplied value | not read | not read | not read |

### What happens after the link lands

1. `createClient(..., { detectSessionInUrl: true })` consumes the `?code=` / `#access_token`
   payload on `/login`.
2. `AuthProvider.getSession()` picks the session up; `onAuthStateChange` drives the same path as an
   inline sign-in.
3. `activate_administrator()` runs once per session (refused for non-allowlisted addresses).
4. An incomplete student is sent to `/onboarding`; everyone else continues to the saved `next` or
   home. Verified by `src/test/auth-session-landing.test.tsx`.

`/login` is the landing path for all three flows because it is the only route that already owns the
session handshake and error copy; it does not require a session and does not render protected data.

---

## 4. Verification

| Command | Result |
| --- | --- |
| `npx vitest run` (targeted, 4 files) | 67 passed |
| `npm run test` | **11 files / 114 tests passed** |
| `npm run typecheck` | pass, no output |
| `npm run build` | pass |
| `npm run check:sql` | 48 SQL files parse cleanly |
| `npm run lint` | 2844 problems (2829 errors, 15 warnings) — down from 2847; **no new lint classes** |

Lint detail: the three prettier errors this change introduced in `src/lib/auth/oauth.test.ts` were
fixed. The remaining findings in touched files (`oauth.ts:172`, `queries.ts:417`,
`queries.test.ts` ×4, `login.tsx:11`) and the ~2800 CRLF errors are pre-existing in this Windows
checkout / earlier uncommitted work. Nothing was reformatted wholesale.

Build output (includes the pre-existing uncommitted Turnstile work):

```
.output/public/assets/index-5-dzmDQI.js    336.38 kB │ gzip: 105.97 kB
.output/public/assets/client-CUanzI2U.js   236.19 kB │ gzip:  63.47 kB
.output/public/assets/styles-Mxn5FzfX.css   86.75 kB │ gzip:  14.88 kB
```

The bundle grew only by the new helper and the three `emailRedirectTo` properties (single chunk,
no new dependency). `src/lib/security/turnstile.ts`'s secret stays absent from the client bundle.

---

## 5. Turnstile status (unchanged architecture)

- Supabase-native CAPTCHA remains the only enforcement boundary: the browser obtains a Turnstile
  token, `captchaToken` is forwarded to `signInWithPassword`, `signUp`, `signInWithOtp`; the hosted
  project verifies it. No second Siteverify call, no auth proxy was added.
- Independent rate limiting (`enforceAuthRateLimit`) still runs before every auth call.
- Widget states covered by tests: load failure, expiry, timeout, reset after each attempt, retry,
  and the "token missing" path. A missing token is decided by the server, not by a client-side gate
  — a widget that cannot load can never lock a student out of password sign-in.
- Live hosted probes (earlier in this session): `/token`, `/signup`, `/otp` reject both a missing
  and an invalid captcha token.
- The currently deployed bundles are older than this working tree (no retry UI, no newer auth error
  copy). Deployment is what closes that gap — it is awaiting approval.

---

## 6. Manual configuration required (not performed here)

1. **Supabase → Authentication → URL Configuration → Site URL**
   set to `https://clubset.vercel.app` (the user is doing this manually).
2. **Redirect URLs** — confirm `https://clubset.vercel.app/**` stays listed. Optionally keep
   `http://127.0.0.1:8080` for local testing. Add a preview origin **before** putting it in
   `VITE_AUTH_REDIRECT_ORIGINS`.
3. **Email templates** — the link must be `{{ .ConfirmationURL }}` (or built from
   `{{ .TokenHash }}` + `{{ .RedirectTo }}`). A template that hardcodes `{{ .SiteURL }}` ignores
   `emailRedirectTo`; the hosted templates are not readable without dashboard access.
4. **Cloudflare Turnstile hostnames** — add `clubset.vercel.app` (and any preview host) to the
   widget if it is not already there. Dashboard access required; not changed here.

## 7. Unverified behaviour and remaining risks

- **No real email was sent or received in this session.** Delivery, template content and the real
  redirect cannot be proven without an inbox test (see `AUTH_EMAIL_DELIVERY_REPORT.md`).
- The fix only reaches users **after the frontend is deployed**. Until then, production keeps
  sending links to the Joinin domain.
- If the hosted email templates hardcode `{{ .SiteURL }}`, they must be corrected in the dashboard;
  code alone cannot override that.
- Local development on `http://localhost:8080` will produce **production** links, because that
  origin is not allow-listed. Use `http://127.0.0.1:8080` when testing links locally.
- Not verified: PKCE (`?code=`) vs implicit (`#access_token`) return handling in a real browser;
  only the fragment error path is covered by an automated test.

---

## 8. Simplification audit — findings only, nothing bundled

| Finding | Evidence | Impact | Smallest recommendation |
| --- | --- | --- | --- |
| Two origin helpers do the same normalisation | `oauthRedirectUrl` and `emailRedirectUrl` (`src/lib/auth/oauth.ts`) both strip trailing slashes and append `/login` | Duplication only; different trust rules (one takes the live origin, one filters an allow-list) | Later: one private `withLoginPath(origin)` used by both |
| `emailRedirectUrl(origin?)` parameter exists for tests | called with no argument everywhere in `src/` | none | keep — same shape as the existing `oauthRedirectUrl` |
| Obsolete-domain strings in tests | `src/lib/auth/oauth.test.ts` still uses `https://clubset.lovable.app` as a fixture origin | misleading but harmless (those tests cover URL surgery, not redirects) | rename fixtures to `https://clubset.vercel.app` in a separate cleanup |
| Stale baseline numbers in `AGENTS.md` | documents `367.76 kB` index and "5 lint errors"; reality is `336.38 kB` and ~2844 problems | misleads future agents | update the baseline in a dedicated change |

---

## 9. Ponytail review verdict

- **Correct:** all three email-producing call sites pass one allow-listed origin; the landing path
  is the page that already owns session detection.
- **Safe:** origin is chosen from a constant + an explicit env list; no request input reaches it.
  Exact string comparison, so `clubset.vercel.app.evil.example` cannot pass. Nothing about the
  administrator allowlist, session detection or captcha moved.
- **Load:** trivial (one string build per auth call).
- **Tested:** 5 new/updated test groups, all green; red state observed first.
- **Lean:** ~40 production lines, no new dependency, no new module.
