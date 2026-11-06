# Handoff brief: open security findings

## 1. Leaked passwords accepted (lov_db_auth_leaked_password_protection_v1, info)

**Problem:** The auth setting `password_hibp_enabled` is off. Sign-up and password changes don't check new passwords against the Have I Been Pwned breach list.

**Where passwords enter the app:**
- `src/routes/signup.tsx` calls `useSignUp().mutateAsync({ email, password })`.
- That hook, in `src/lib/queries.ts` (around line 189), calls `supabase.auth.signUp(...)`.
- Password change goes through `supabase.auth.updateUser({ password })` in `src/lib/queries.ts` (around line 219).
- Password sign-in is `signInWithPassword` (around line 157). It isn't affected: existing passwords are never re-checked.
- Admin login uses an email link (`signInWithOtp`), so it isn't affected.

**Fix:** This is a project setting, not code. Turn on Cloud → Users → Auth settings → Email → "Password HIBP Check". No migration.

**Optional code step:** Make sure the signup and password-change screens show the error that comes back when a password is rejected as leaked (a "weak password" error), in plain words.

**Verify:** Sign up with a well-known leaked password such as `password123`. It should be refused.

## 2. Guests count as signed-in users (lov_db_rls_anonymous_in_authenticated_v1, info)

**Problem:** Guest sign-in is enabled. Guest sessions get the same `authenticated` role as real users, so the signed-in access rules on 32 tables also cover guests. Examples: clubs, events, attendance, budgets, dues, form_responses, admin_verifications, audit_logs. No rule checks the `is_anonymous` claim.

**Fix options:**
- **A (preferred if the app never uses guests):** Turn off anonymous sign-ins in auth settings. First confirm nothing in `src/` calls `signInAnonymously` (a search found none).
- **B:** Add a new migration with a restrictive rule on each affected table:
  `create policy "<table>_no_anon" on public.<table> as restrictive for all to authenticated using ((auth.jwt() ->> 'is_anonymous')::boolean is not true) with check ((auth.jwt() ->> 'is_anonymous')::boolean is not true);`
  Use `drop policy if exists` first.

**Rules for option B:** Follow the repo rules: only add new migrations, never edit applied ones, and don't loosen existing RLS or change the grants on policy helper functions.

**Verify:** A guest session should read zero rows. A normal student session should behave as it does today.
