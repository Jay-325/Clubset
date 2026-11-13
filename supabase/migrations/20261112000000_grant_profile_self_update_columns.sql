-- ============================================================================
-- Clubset :: 2026-11-12 -- let students save their own profile columns
--
-- WHY
--   Finishing onboarding (POST /rest/v1/profiles via useUpdateProfile) writes
--   full_name, grade, interests, commitment_hours and onboarding_complete.
--   On the live project `authenticated` holds UPDATE only on full_name and
--   avatar_url:
--
--     has_table_privilege('authenticated','public.profiles','update') = false
--     has_column_privilege(...,'grade'|'interests'|'commitment_hours'
--                              |'onboarding_complete','update')      = false
--
--   PostgreSQL therefore rejects the whole statement with
--   42501 permission denied for table profiles. The mutation rejects, so the
--   Finish setup button never reaches its navigate({ to: "/" }) and the student
--   stays on /onboarding with onboarding_complete still false -- the
--   post-sign-in backstop keeps sending them back there. Settings > Save has
--   the same failure.
--
-- WHAT
--   Grant column-level UPDATE for exactly the columns a student owns through
--   the UI. Row scope and the sensitive columns are unchanged:
--     * profiles_update_self_safe still limits writes to the caller's own row;
--     * account_type / school_id / email stay non-updatable (policy WITH CHECK
--       + no column grant), so no self-promotion path is opened;
--     * INSERT/DELETE are deliberately not granted -- profiles are provisioned
--       by handle_new_auth_user() (SECURITY DEFINER).
--
-- ROLLBACK
--   revoke update (full_name, grade, interests, commitment_hours,
--     onboarding_complete, avatar_url) on table public.profiles
--   from authenticated;
-- ============================================================================

begin;

grant update (full_name, grade, interests, commitment_hours, onboarding_complete, avatar_url)
  on table public.profiles
  to authenticated;

commit;
