# Auth Email Redirect Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Supabase auth emails return to the Clubset origin instead of the obsolete Joinin Vercel domain, without weakening captcha, rate limiting, or administrator authorization.

**Architecture:** One pure helper (`emailRedirectUrl`) picks an exact, allowlisted origin and appends `/login`. The three email-sending auth hooks pass it as `options.emailRedirectTo`. The hosted redirect allow-list remains the enforcement point: GoTrue falls back to its Site URL for anything it does not list.

**Tech Stack:** React 19, TanStack Query/Router, `@supabase/supabase-js` 2.117, Vitest + Testing Library.

**Spec:** live investigation in `AUTH_REDIRECT_REMEDIATION_REPORT.md` (evidence section) and the task brief.

## Global Constraints

- Production origin is exactly `https://clubset.vercel.app`.
- Never read a redirect destination from a URL parameter.
- No second Siteverify call, no auth proxy, no hosted config change.
- No commit, push, deploy, or database change.

## Review Focus

- A preview or localhost deployment must not silently send users to an unlisted origin.
- An expired email link must not be reported as a failed Google sign-in.
- Administrator activation must still call `activate_administrator()` after the link.

---

### Task 1: `emailRedirectUrl` and link-error parsing

**Files:**
- Modify: `src/lib/auth/oauth.ts`
- Test: `src/lib/auth/oauth.test.ts`

**Interfaces:**
- Produces: `CANONICAL_APP_ORIGIN: string`, `emailRedirectUrl(origin?: string): string`, `OAuthUrlError.errorCode?: string | null`.

- [ ] **Step 1: Write the failing tests** for canonical selection, trailing slash, rejected origin, env-listed local origin, and `error_code` parsing.
- [ ] **Step 2: Run** `npx vitest run src/lib/auth/oauth.test.ts` → FAIL (missing export / extra field).
- [ ] **Step 3: Implement** the helper and parser field; correct the stale `site_url` comment.
- [ ] **Step 4: Run** the same command → PASS.

### Task 2: Pass the redirect on every email flow

**Files:**
- Modify: `src/lib/queries.ts`
- Test: `src/lib/queries.test.ts`

**Interfaces:**
- Consumes: `emailRedirectUrl()`.
- Produces: `signUp`/`signInWithOtp` options include `emailRedirectTo`.

- [ ] **Step 1: Write failing assertions** that signup, magic link and administrator activation pass `emailRedirectTo`.
- [ ] **Step 2: Run** `npx vitest run src/lib/queries.test.ts` → FAIL.
- [ ] **Step 3: Implement** the three option spreads.
- [ ] **Step 4: Run** the same command → PASS.

### Task 3: Expired email link copy

**Files:**
- Modify: `src/routes/login.tsx`
- Test: `src/test/email-link-landing.test.tsx`

- [ ] **Step 1: Write a failing route test** that renders `/login#error=access_denied&error_code=otp_expired` and expects a "link has expired" message.
- [ ] **Step 2: Run** it → FAIL (shows Google copy).
- [ ] **Step 3: Implement** the `otp_expired` branch.
- [ ] **Step 4: Run** it → PASS.

### Task 4: Session landing after verification

**Files:**
- Test: `src/test/auth-session-landing.test.tsx`

- [ ] **Step 1: Write a failing test** that renders `AuthProvider` with a mocked session + incomplete student profile and expects navigation to `/onboarding` and a call to `activate_administrator`.
- [ ] **Step 2: Run** it → FAIL.
- [ ] **Step 3: No production change expected**; if it fails for a real reason, fix the root cause.
- [ ] **Step 4: Run** it → PASS.

### Task 5: Configuration docs and reports

- [ ] Document `VITE_AUTH_REDIRECT_ORIGINS` in `.env.example`.
- [ ] Write `AUTH_REDIRECT_REMEDIATION_REPORT.md` and `AUTH_EMAIL_DELIVERY_REPORT.md`.
- [ ] Run typecheck, full tests, build, check:sql, lint.
