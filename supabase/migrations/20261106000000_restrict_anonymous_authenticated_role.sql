-- ============================================================================
-- Clubset :: 2026-11-06
--   * restrict the PostgreSQL `authenticated` role so anonymous JWTs cannot
--     inherit authenticated-user access
--
-- WHY
--   Supabase anonymous sign-in issues a JWT with role `authenticated` and the
--   claim `is_anonymous = true`. Ordinary `authenticated` RLS policies therefore
--   also apply to anonymous sessions. Because `handle_new_auth_user()` provisions
--   a profile (and a school_id, via the oldest-school fallback) for every new
--   auth user -- including anonymous ones -- an anonymous session can satisfy
--   school-scoped predicates (`current_school_id()`) and self-scoped predicates
--   (`auth.uid()`), gaining read/write access it should not have.
--
--   Clubset does not use anonymous/guest accounts anywhere (no
--   `signInAnonymously()` in the repository), so this restriction does not
--   remove any product behavior.
--
-- WHAT
--   Adds `(auth.jwt() ->> 'is_anonymous') IS DISTINCT FROM 'true'` to the
--   USING / WITH CHECK of the policies that an anonymous JWT could otherwise
--   satisfy. `IS DISTINCT FROM` is used so a missing `is_anonymous` claim
--   (ordinary authenticated JWTs, and unauthenticated `anon` requests with no
--   JWT) evaluates to TRUE and preserves existing behavior.
--
--   Policies are dropped and recreated (the repo's established pattern) so the
--   change is convergent. No table grants change, no rows are deleted, and no
--   existing student/leader/administrator permission is narrowed for
--   non-anonymous sessions.
--
-- ROLLBACK
--   Recreate each policy without the `is_anonymous` clause using the definition
--   from the original migration.
--
-- NOTE
--   This migration must be tested against a local Docker Supabase with real
--   anonymous JWTs before being applied anywhere. Anonymous sign-in should also
--   be disabled in Supabase Auth (Authentication > Settings) as the preferred
--   application-level fix; this migration is defense in depth.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Broad school-scoped reads an anonymous session with a provisioned profile
-- could otherwise satisfy.
-- ---------------------------------------------------------------------------

drop policy if exists clubs_select_school on public.clubs;
create policy clubs_select_school on public.clubs
  for select
  using (
    school_id = public.current_school_id()
    and (auth.jwt() ->> 'is_anonymous') IS DISTINCT FROM 'true'
  );

drop policy if exists profiles_select_school on public.profiles;
create policy profiles_select_school on public.profiles
  for select
  using (
    (id = auth.uid()
      or (school_id is not null and school_id = public.current_school_id()))
    and (auth.jwt() ->> 'is_anonymous') IS DISTINCT FROM 'true'
  );

drop policy if exists schools_select on public.schools;
create policy schools_select on public.schools
  for select
  using (
    id = public.current_school_id()
    and (auth.jwt() ->> 'is_anonymous') IS DISTINCT FROM 'true'
  );

-- ---------------------------------------------------------------------------
-- Self-scoped writes an anonymous session could otherwise perform.
-- ---------------------------------------------------------------------------

drop policy if exists memberships_insert_self on public.memberships;
create policy memberships_insert_self on public.memberships
  for insert
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and exists (
      select 1 from public.clubs c
      where c.id = club_id
        and c.school_id = public.current_school_id()
        and c.status = 'approved'
    )
    and (auth.jwt() ->> 'is_anonymous') IS DISTINCT FROM 'true'
  );

drop policy if exists club_verifications_insert on public.club_verifications;
create policy club_verifications_insert on public.club_verifications
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.clubs c
      where c.id = club_id
        and c.school_id = public.current_school_id()
        and c.status = 'awaiting_student_verification'
    )
    and (auth.jwt() ->> 'is_anonymous') IS DISTINCT FROM 'true'
  );

drop policy if exists rsvps_insert_via_rpc on public.rsvps;
create policy rsvps_insert_via_rpc on public.rsvps
  for insert
  with check (
    user_id = auth.uid()
    and (auth.jwt() ->> 'is_anonymous') IS DISTINCT FROM 'true'
  );

drop policy if exists form_responses_insert_self on public.form_responses;
create policy form_responses_insert_self on public.form_responses
  for insert
  with check (
    user_id = auth.uid()
    and (auth.jwt() ->> 'is_anonymous') IS DISTINCT FROM 'true'
  );

drop policy if exists event_preferences_own on public.event_preferences;
create policy event_preferences_own on public.event_preferences
  for all
  using (
    user_id = auth.uid()
    and (auth.jwt() ->> 'is_anonymous') IS DISTINCT FROM 'true'
  )
  with check (
    user_id = auth.uid()
    and (auth.jwt() ->> 'is_anonymous') IS DISTINCT FROM 'true'
  );

drop policy if exists leadership_applications_insert_via_rpc on public.leadership_applications;
create policy leadership_applications_insert_via_rpc on public.leadership_applications
  for insert
  with check (
    applicant_id = auth.uid()
    and (auth.jwt() ->> 'is_anonymous') IS DISTINCT FROM 'true'
  );
