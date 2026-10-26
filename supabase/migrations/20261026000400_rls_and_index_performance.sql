-- ============================================================================
-- Clubset :: 2026-10-26 -- RLS evaluation cost, FK indexes, club search
--
-- Fourth remediation batch from supabase/AUDIT_2026-10-24_schema_rls_indexes.md.
-- Additive only: policies are re-created with identical semantics, indexes are
-- `if not exists`, and one RPC predicate is rewritten to an equivalent form
-- that the existing GIN index can serve. No row, column or table is changed.
--
-- FINDING H6 -- auth.uid() is evaluated once per candidate row
--   auth.uid() is STABLE, not IMMUTABLE, so the planner will not hoist it out
--   of a per-row qual. Wrapping it in an uncorrelated scalar subquery
--   `(select auth.uid())` makes it an InitPlan: evaluated once per statement.
--   Every policy below is the previous policy text with only that substitution
--   -- USING / WITH CHECK logic is unchanged.
--
-- FINDING H8 -- 30 foreign keys had no index
--   Each entry below names the access pattern. Two kinds recur:
--     * a cascade path: the FK is ON DELETE CASCADE / SET NULL, so deleting a
--       profile, club, event or table scans the child table; and
--     * an application read: the column is filtered directly by a query.
--   In both cases no existing index can serve it because the existing
--   composite / unique indexes lead with a different column. Each index is
--   `if not exists` and has its own rollback line.
--   NOT MEASURED: the project has no production-scale data, so this is
--   access-pattern reasoning, not a timing comparison.
--
-- FINDING H7 / M7 -- club discovery search
--   search_clubs() filters `name ILIKE '%q%'` / `description ILIKE '%q%'`.
--   A leading-wildcard ILIKE cannot use a GIN tsvector index
--   (clubs_name_search_idx), so the planner falls back to a sequential scan.
--   pg_trgm GIN indexes serve exactly that predicate. The tsvector index is
--   deliberately kept: it is still correct, and AGENTS.md forbids dropping an
--   index just because Supabase reports it unused.
--   `filter_field = any (c.fields)` is rewritten to `c.fields @> array[...]`,
--   which is logically identical and is the operator clubs_fields_idx
--   accelerates.
-- ============================================================================

begin;

-- Trigram operator classes may live in `public` or in Supabase's `extensions`
-- schema. Putting both on the local search_path lets the unqualified
-- `gin_trgm_ops` resolve either way, which keeps the migration re-runnable.
set local search_path = public, extensions;

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. RLS policies: hoist auth.uid() to a statement-level InitPlan
-- ---------------------------------------------------------------------------

-- profiles ---------------------------------------------------------------
drop policy if exists profiles_select_school on public.profiles;

create policy profiles_select_school on public.profiles
  for select
  using (
    id = (select auth.uid())
    or (school_id is not null and school_id = public.current_school_id())
  );

drop policy if exists profiles_insert_self on public.profiles;

create policy profiles_insert_self on public.profiles
  for insert
  with check (id = (select auth.uid()) and account_type = 'student');

drop policy if exists profiles_update_self_safe on public.profiles;

create policy profiles_update_self_safe on public.profiles
  for update
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    -- Cannot change account type
    and account_type = (
      select account_type from public.profiles where id = (select auth.uid())
    )
    -- Cannot change school
    and school_id is not distinct from (
      select school_id from public.profiles where id = (select auth.uid())
    )
    -- Cannot change email
    and email = (
      select email from public.profiles where id = (select auth.uid())
    )
  );

drop policy if exists admin_verifications_select_own on public.admin_verifications;

create policy admin_verifications_select_own on public.admin_verifications
  for select
  using (user_id = (select auth.uid()) or public.is_administrator());

-- clubs ------------------------------------------------------------------
drop policy if exists clubs_insert_founder on public.clubs;

create policy clubs_insert_founder on public.clubs
  for insert
  with check (
    school_id = (select public.current_school_id())
    and founder_id = (select auth.uid())
  );

drop policy if exists clubs_update_leader on public.clubs;

create policy clubs_update_leader on public.clubs
  for update
  using (
    founder_id = (select auth.uid())
    or public.has_club_permission(id, 'manage_settings')
    or public.is_club_admin(id)
  )
  with check (school_id = (select public.current_school_id()));

drop policy if exists club_verifications_insert on public.club_verifications;

create policy club_verifications_insert on public.club_verifications
  for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.clubs c
      where c.id = club_verifications.club_id
        and c.school_id = (select public.current_school_id())
        and c.status = 'awaiting_student_verification'
    )
  );

drop policy if exists club_verifications_delete on public.club_verifications;

create policy club_verifications_delete on public.club_verifications
  for delete
  using (
    user_id = (select auth.uid())
    or public.has_club_permission(club_id, 'manage_settings')
  );

drop policy if exists announcements_insert on public.announcements;

create policy announcements_insert on public.announcements
  for insert
  with check (
    author_id = (select auth.uid())
    and public.has_club_permission(club_id, 'send_announcements')
  );

drop policy if exists announcements_delete on public.announcements;

create policy announcements_delete on public.announcements
  for delete
  using (
    author_id = (select auth.uid())
    or public.has_club_permission(club_id, 'send_announcements')
  );

-- events / attendance ----------------------------------------------------
drop policy if exists events_insert_leader on public.events;

create policy events_insert_leader on public.events
  for insert
  with check (
    created_by = (select auth.uid())
    and public.has_club_permission(club_id, 'manage_events')
  );

drop policy if exists rsvps_select on public.rsvps;

create policy rsvps_select on public.rsvps
  for select
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.events e
      where e.id = rsvps.event_id
        and (public.has_club_permission(e.club_id, 'manage_events')
             or public.has_club_permission(e.club_id, 'manage_attendance')
             or public.is_club_admin(e.club_id))
    )
  );

drop policy if exists rsvps_insert_via_rpc on public.rsvps;

create policy rsvps_insert_via_rpc on public.rsvps
  for insert
  with check (user_id = (select auth.uid()));

drop policy if exists rsvps_update_own on public.rsvps;

create policy rsvps_update_own on public.rsvps
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists attendance_select on public.attendance;

create policy attendance_select on public.attendance
  for select
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.events e
      where e.id = attendance.event_id
        and (public.has_club_permission(e.club_id, 'manage_attendance')
             or public.is_club_admin(e.club_id))
    )
  );

drop policy if exists attendance_corrections_select on public.attendance_corrections;

create policy attendance_corrections_select on public.attendance_corrections
  for select
  using (
    user_id = (select auth.uid())
    or corrected_by = (select auth.uid())
    or exists (
      select 1 from public.events e
      where e.id = attendance_corrections.event_id
        and public.has_club_permission(e.club_id, 'manage_attendance')
    )
  );

drop policy if exists event_preferences_own on public.event_preferences;

create policy event_preferences_own on public.event_preferences
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- chat -------------------------------------------------------------------
drop policy if exists messages_select_member on public.messages;

create policy messages_select_member on public.messages
  for select
  using (
    public.is_club_member(club_id)
    and (
      -- Full history
      exists (
        select 1 from public.clubs c
        where c.id = messages.club_id
          and c.new_members_get_chat_history
      )
      -- Or only messages sent after this member joined
      or exists (
        select 1 from public.memberships m
        where m.club_id = messages.club_id
          and m.user_id = (select auth.uid())
          and m.joined_at is not null
          and messages.created_at >= m.joined_at
      )
    )
  );

drop policy if exists messages_insert_member on public.messages;

create policy messages_insert_member on public.messages
  for insert
  with check (
    sender_id = (select auth.uid())
    and public.is_club_member(club_id)
  );

drop policy if exists messages_delete_moderator on public.messages;

create policy messages_delete_moderator on public.messages
  for delete
  using (
    deleted_at is not null
    or sender_id = (select auth.uid())
    or public.has_club_permission(club_id, 'moderate_chat')
  );

drop policy if exists role_messages_select_party on public.role_messages;

create policy role_messages_select_party on public.role_messages
  for select
  using (
    sender_id = (select auth.uid())
    or exists (
      select 1 from public.role_assignments ra
      where ra.role_id = role_messages.role_id
        and ra.user_id = (select auth.uid())
    )
    or public.has_club_permission(club_id, 'manage_leadership')
  );

drop policy if exists role_messages_insert_member on public.role_messages;

create policy role_messages_insert_member on public.role_messages
  for insert
  with check (
    sender_id = (select auth.uid())
    and public.is_club_member(club_id)
  );

drop policy if exists role_messages_update_recipient on public.role_messages;

create policy role_messages_update_recipient on public.role_messages
  for update
  using (
    exists (
      select 1 from public.role_assignments ra
      where ra.role_id = role_messages.role_id
        and ra.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.role_assignments ra
      where ra.role_id = role_messages.role_id
        and ra.user_id = (select auth.uid())
    )
  );

-- finances ---------------------------------------------------------------
drop policy if exists transactions_insert_leader on public.transactions;

create policy transactions_insert_leader on public.transactions
  for insert
  with check (
    created_by = (select auth.uid())
    and public.has_club_permission(club_id, 'manage_finances')
  );

drop policy if exists dues_select on public.dues;

create policy dues_select on public.dues
  for select
  using (
    user_id = (select auth.uid())
    or public.has_club_permission(club_id, 'manage_finances')
    or public.is_club_admin(club_id)
  );

-- forms ------------------------------------------------------------------
drop policy if exists form_responses_select on public.form_responses;

create policy form_responses_select on public.form_responses
  for select
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.forms f
      where f.id = form_responses.form_id
        and (public.has_club_permission(f.club_id, 'manage_forms')
             or public.is_club_admin(f.club_id))
    )
  );

drop policy if exists form_responses_insert_self on public.form_responses;

create policy form_responses_insert_self on public.form_responses
  for insert
  with check (user_id = (select auth.uid()));

-- leadership -------------------------------------------------------------
drop policy if exists leadership_applications_select on public.leadership_applications;

create policy leadership_applications_select on public.leadership_applications
  for select
  using (
    applicant_id = (select auth.uid())
    or exists (
      select 1 from public.role_assignments ra
      where ra.role_id = leadership_applications.role_id
        and ra.user_id = (select auth.uid())
    )
    or public.has_club_permission(club_id, 'manage_leadership')
    or public.is_club_admin(club_id)
  );

-- notifications ----------------------------------------------------------
drop policy if exists notifications_select_own on public.notifications;

create policy notifications_select_own on public.notifications
  for select
  using (user_id = (select auth.uid()));

drop policy if exists notifications_update_own on public.notifications;

create policy notifications_update_own on public.notifications
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Missing foreign-key indexes
-- ---------------------------------------------------------------------------

-- Cascade: deleting a profile (ON DELETE SET NULL on clubs.founder_id).
-- Query: clubs_update_leader USING founder_id = auth.uid().
-- No index leads with founder_id (clubs_school_idx / clubs_status_idx do not).
-- rollback: drop index if exists public.clubs_founder_idx;
create index if not exists clubs_founder_idx on public.clubs (founder_id);

-- Query: "which clubs do I administer" (club_administrators.administrator_id).
-- Cascade: profile delete. The PK is (club_id, administrator_id).
-- rollback: drop index if exists public.club_administrators_admin_idx;
create index if not exists club_administrators_admin_idx
  on public.club_administrators (administrator_id);

-- Cascade: profile delete (ON DELETE SET NULL).
-- rollback: drop index if exists public.club_administrators_linked_by_idx;
create index if not exists club_administrators_linked_by_idx
  on public.club_administrators (linked_by);

-- Query: "my club verifications"; cascade on profile delete.
-- The unique (club_id, user_id) index leads with club_id.
-- rollback: drop index if exists public.club_verifications_user_idx;
create index if not exists club_verifications_user_idx
  on public.club_verifications (user_id);

-- Query: has_club_permission() / is_club_leader() filter user_id across clubs.
-- Cascade: profile delete. The unique (role_id, user_id) and
-- role_assignments_club_idx (club_id, user_id) both lead with another column.
-- rollback: drop index if exists public.role_assignments_user_idx;
create index if not exists role_assignments_user_idx
  on public.role_assignments (user_id);

-- Cascade: profile delete (ON DELETE SET NULL).
-- rollback: drop index if exists public.role_assignments_assigned_by_idx;
create index if not exists role_assignments_assigned_by_idx
  on public.role_assignments (assigned_by);

-- Cascade: profile delete (ON DELETE SET NULL); feed join by author.
-- rollback: drop index if exists public.announcements_author_idx;
create index if not exists announcements_author_idx
  on public.announcements (author_id);

-- Cascade: profile delete (ON DELETE SET NULL).
-- rollback: drop index if exists public.events_created_by_idx;
create index if not exists events_created_by_idx on public.events (created_by);

-- Cascade: profile delete (ON DELETE SET NULL).
-- rollback: drop index if exists public.attendance_finalized_by_idx;
create index if not exists attendance_finalized_by_idx
  on public.attendance (finalized_by);

-- Cascade: deleting an attendance row deletes its correction rows. Neither
-- existing index (event_id, created_at) nor (user_id, created_at) leads with
-- attendance_id.
-- rollback: drop index if exists public.attendance_corrections_attendance_idx;
create index if not exists attendance_corrections_attendance_idx
  on public.attendance_corrections (attendance_id);

-- Cascade: profile delete (ON DELETE SET NULL).
-- rollback: drop index if exists public.attendance_corrections_corrected_by_idx;
create index if not exists attendance_corrections_corrected_by_idx
  on public.attendance_corrections (corrected_by);

-- Cascade: profile delete (ON DELETE SET NULL) would otherwise scan the whole
-- ledger. Existing indexes lead with club_id.
-- rollback: drop index if exists public.transactions_created_by_idx;
create index if not exists transactions_created_by_idx
  on public.transactions (created_by);

-- Query: useMyDues() filters dues by user_id. The unique (club_id, user_id)
-- index leads with club_id, so it cannot bound a per-user read.
-- Cascade: profile delete.
-- rollback: drop index if exists public.dues_user_idx;
create index if not exists dues_user_idx on public.dues (user_id);

-- Cascade: transaction delete (ON DELETE SET NULL).
-- rollback: drop index if exists public.dues_transaction_idx;
create index if not exists dues_transaction_idx on public.dues (transaction_id);

-- Cascade: profile delete (ON DELETE SET NULL).
-- rollback: drop index if exists public.dues_marked_paid_by_idx;
create index if not exists dues_marked_paid_by_idx on public.dues (marked_paid_by);

-- Cascade: profile delete (ON DELETE CASCADE).
-- rollback: drop index if exists public.forms_created_by_idx;
create index if not exists forms_created_by_idx on public.forms (created_by);

-- Cascade: data-table delete (ON DELETE SET NULL).
-- rollback: drop index if exists public.forms_target_table_idx;
create index if not exists forms_target_table_idx on public.forms (target_table_id);

-- Query: "my form responses"; cascade on profile delete. The unique
-- (form_id, user_id) index leads with form_id.
-- rollback: drop index if exists public.form_responses_user_idx;
create index if not exists form_responses_user_idx
  on public.form_responses (user_id);

-- Cascade: profile delete (ON DELETE CASCADE).
-- rollback: drop index if exists public.data_tables_created_by_idx;
create index if not exists data_tables_created_by_idx
  on public.data_tables (created_by);

-- Cascade: profile delete (ON DELETE SET NULL).
-- rollback: drop index if exists public.data_table_rows_created_by_idx;
create index if not exists data_table_rows_created_by_idx
  on public.data_table_rows (created_by);

-- Query: "my leadership applications". The unique (role_id, applicant_id)
-- index leads with role_id. Cascade: profile delete.
-- rollback: drop index if exists public.leadership_applications_applicant_idx;
create index if not exists leadership_applications_applicant_idx
  on public.leadership_applications (applicant_id);

-- Cascade: profile delete (ON DELETE SET NULL).
-- rollback: drop index if exists public.leadership_applications_reviewed_by_idx;
create index if not exists leadership_applications_reviewed_by_idx
  on public.leadership_applications (reviewed_by);

-- Cascade: profile delete (ON DELETE SET NULL).
-- rollback: drop index if exists public.chat_banners_created_by_idx;
create index if not exists chat_banners_created_by_idx
  on public.chat_banners (created_by);

-- Cascade: club delete. The thread index leads with role_id.
-- rollback: drop index if exists public.role_messages_club_idx;
create index if not exists role_messages_club_idx on public.role_messages (club_id);

-- Cascade: profile delete.
-- rollback: drop index if exists public.role_messages_sender_idx;
create index if not exists role_messages_sender_idx
  on public.role_messages (sender_id);

-- Cascade: school delete. notifications is the one table that grows without
-- bound and has no index leading with school_id.
-- rollback: drop index if exists public.notifications_school_idx;
create index if not exists notifications_school_idx
  on public.notifications (school_id);

-- Cascade: club delete. The PK is (user_id, club_id), so it leads with user_id.
-- rollback: drop index if exists public.event_preferences_club_idx;
create index if not exists event_preferences_club_idx
  on public.event_preferences (club_id);

-- Cascade: allowlist delete (ON DELETE SET NULL).
-- rollback: drop index if exists public.admin_verifications_allowlist_idx;
create index if not exists admin_verifications_allowlist_idx
  on public.admin_verifications (allowlist_id);

-- Cascade: school delete.
-- rollback: drop index if exists public.admin_verifications_school_idx;
create index if not exists admin_verifications_school_idx
  on public.admin_verifications (school_id);

-- Cascade: auth user delete (ON DELETE SET NULL).
-- rollback: drop index if exists public.admin_allowlist_created_by_idx;
create index if not exists admin_allowlist_created_by_idx
  on public.admin_allowlist (created_by);

-- ---------------------------------------------------------------------------
-- 3. Trigram indexes for the two leading-wildcard search predicates
--
--    Query 1 (search_clubs, src/lib/queries.ts useClubSearch):
--      where c.status = 'approved' and c.school_id = current_school_id()
--        and (c.name ilike '%' || search_text || '%'
--             or c.description ilike '%' || search_text || '%')
--      ILIKE with a leading wildcard cannot use clubs_name_search_idx
--      (GIN tsvector) or any btree; a trigram GIN index can.
--
--    Query 2 (useMemberSearch, src/lib/queries.ts):
--      select * from profiles where full_name ilike '%' || q || '%'
--      profiles has no text index at all.
--
--    rollback:
--      drop index if exists public.clubs_name_trgm_idx;
--      drop index if exists public.clubs_description_trgm_idx;
--      drop index if exists public.profiles_full_name_trgm_idx;
-- ---------------------------------------------------------------------------
create index if not exists clubs_name_trgm_idx
  on public.clubs using gin (name gin_trgm_ops);

create index if not exists clubs_description_trgm_idx
  on public.clubs using gin (description gin_trgm_ops);

create index if not exists profiles_full_name_trgm_idx
  on public.profiles using gin (full_name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 4. search_clubs(): let the fields filter use clubs_fields_idx
--
--    `filter_field = any (c.fields)` is not an array operator, so the GIN
--    index on fields could not serve it. `c.fields @> array[filter_field]` is
--    the same predicate expressed with the containment operator. Everything
--    else -- visibility, ranking, ordering, ILIKE matching -- is unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.search_clubs(
  search_text text default null,
  filter_type public.club_type default null,
  filter_field text default null,
  filter_commitment public.commitment_level default null
)
returns table (
  id uuid,
  name text,
  description text,
  type public.club_type,
  commitment public.commitment_level,
  fields text[],
  room text,
  meeting_day text,
  meeting_time time,
  welcome_message text,
  member_count bigint,
  is_member boolean,
  match_reasons text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    select c.* from public.clubs c
    where c.status = 'approved'
      and c.school_id = public.current_school_id()
  ),
  scored as (
    select
      c.id, c.name, c.description, c.type, c.commitment, c.fields, c.room,
      c.meeting_day, c.meeting_time, c.welcome_message,
      (select count(*) from public.memberships m
        where m.club_id = c.id and m.status = 'active') as member_count,
      public.is_club_member(c.id) as is_member,
      -- PRD 21: recommendations must explain WHY, not just appear.
      coalesce(
        (select array_agg(distinct reason)
         from unnest(
           case
             when p.interests && c.fields
               then array['Matches your interests: ' || array_to_string(c.fields, ', ')]
             else '{}'::text[]
           end
           || case
                -- profiles stores availability as weekly hours; the bands are
                -- the ones the app publishes: low < 1, medium 1-2, high 3+.
                when p.commitment_hours is not null and (
                  (c.commitment = 'low'      and p.commitment_hours < 1)
                  or (c.commitment = 'medium' and p.commitment_hours >= 1 and p.commitment_hours < 3)
                  or (c.commitment = 'high'   and p.commitment_hours >= 3)
                )
                  then array['Matches your commitment level']
                else '{}'::text[]
              end
         ) as reason),
        '{}'::text[]
      ) as match_reasons
    from visible c
    cross join public.profiles p
    -- Same InitPlan hoist as the policies: one JWT read per search, not one
    -- per candidate club row.
    where p.id = (select auth.uid())
      and (
        search_text is null
        or c.name ilike '%' || search_text || '%'
        or c.description ilike '%' || search_text || '%'
      )
      and (filter_type is null or c.type = filter_type)
      -- `@>` is the containment operator clubs_fields_idx can serve;
      -- it is equivalent to `filter_field = any (c.fields)`.
      and (filter_field is null or c.fields @> array[filter_field])
      and (filter_commitment is null or c.commitment = filter_commitment)
      and not public.is_club_member(c.id)
  )
  select
    s.id, s.name, s.description, s.type, s.commitment, s.fields, s.room,
    s.meeting_day, s.meeting_time, s.welcome_message, s.member_count,
    s.is_member, s.match_reasons
  from scored s
  order by array_length(s.match_reasons, 1) desc nulls last, s.name;
$$;

comment on function public.search_clubs(text, public.club_type, text, public.commitment_level) is
  'Approved same-school club discovery. Uses pg_trgm indexes for the ILIKE search and clubs_fields_idx (@>) for the field filter.';

commit;
