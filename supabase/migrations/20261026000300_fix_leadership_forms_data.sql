-- ============================================================================
-- Clubset :: 2026-10-26 -- leadership review, form resubmission, templates
--
-- Third remediation batch from supabase/AUDIT_2026-10-24_schema_rls_indexes.md.
-- Policies and one function body only. No table, column or row change.
--
-- FINDINGS ADDRESSED
--   H2  leadership_applications had a single UPDATE policy that only matched
--       the applicant while the row was still 'draft'. A reviewer therefore
--       matched zero rows (review_application returned null while still
--       granting the role) and an applicant could neither submit nor withdraw.
--   H3  form_responses has a SELECT and an INSERT policy but no UPDATE policy,
--       while submit_form_response() upserts. The second submission -- the
--       normal edit path -- always raised 42501.
--   H4  apply_table_template() always raised 42702 "column reference
--       template_key is ambiguous" because the parameter and the column share
--       a name and plpgsql.variable_conflict is `error`.
--   M4  leadership_applications INSERT accepted any status, including
--       'accepted' with reviewer fields pre-filled.
--
-- ROLLBACK
--   Restore leadership_applications_update_self and
--   leadership_applications_insert_via_rpc from 20260101000008_leadership.sql,
--   drop leadership_applications_update_applicant /
--   leadership_applications_update_reviewer, drop
--   form_responses_update_self, and restore apply_table_template from
--   20261003000858_72b0e5f9-fcc4-4941-adc7-a35be672f841.sql.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. leadership_applications: applicant submits/withdraws, staff decides
-- ---------------------------------------------------------------------------
drop policy if exists leadership_applications_update_self on public.leadership_applications;
drop policy if exists leadership_applications_update_applicant on public.leadership_applications;
drop policy if exists leadership_applications_update_reviewer on public.leadership_applications;

-- The applicant may submit a draft or withdraw an undecided application. The
-- same-row subqueries keep role_id/club_id fixed, so a direct PATCH cannot
-- move an application to a role whose eligibility was never checked. Reviewer
-- columns must stay null, so an applicant cannot pre-fill a decision.
create policy leadership_applications_update_applicant on public.leadership_applications
  for update
  using (
    applicant_id = (select auth.uid())
    and status in ('draft', 'submitted', 'under_review', 'rejected')
  )
  with check (
    applicant_id = (select auth.uid())
    and status in ('submitted', 'withdrawn')
    and reviewed_by is null
    and reviewed_at is null
    and role_id = (
      select la.role_id from public.leadership_applications la
      where la.id = leadership_applications.id
    )
    and club_id = (
      select la.club_id from public.leadership_applications la
      where la.id = leadership_applications.id
    )
  );

-- Reviewers decide. The current-holder and supervising-role paths go through
-- review_application() (SECURITY DEFINER), which checks them explicitly; this
-- policy is for leadership-level direct edits only.
create policy leadership_applications_update_reviewer on public.leadership_applications
  for update
  using (
    public.has_club_permission(club_id, 'manage_leadership')
    or public.is_club_admin(club_id)
  )
  with check (
    public.has_club_permission(club_id, 'manage_leadership')
    or public.is_club_admin(club_id)
  );

-- Application rows submitted through apply_for_role() are written by that
-- SECURITY DEFINER function, so the client-facing INSERT path only needs to
-- allow a draft. This closes M4: no self-inserted 'accepted' rows.
drop policy if exists leadership_applications_insert_via_rpc on public.leadership_applications;

create policy leadership_applications_insert_via_rpc on public.leadership_applications
  for insert
  with check (
    applicant_id = (select auth.uid())
    and status = 'draft'
    and reviewed_by is null
    and reviewed_at is null
  );

-- ---------------------------------------------------------------------------
-- 2. form_responses: allow the owner to update their own answer set
--
--    submit_form_response() already re-checks status = 'published' and active
--    membership before it reaches the upsert, so the policy only needs to pin
--    the row owner.
-- ---------------------------------------------------------------------------
drop policy if exists form_responses_update_self on public.form_responses;

create policy form_responses_update_self on public.form_responses
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. apply_table_template(): qualify the parameter
--
--    plpgsql.variable_conflict = error, so `set template_key = template_key`
--    is ambiguous between the parameter and the column. Qualifying the
--    parameter with the function name (the documented PL/pgSQL way) keeps the
--    client-facing RPC signature `apply_table_template(target_table,
--    template_key)` unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.apply_table_template(target_table uuid, template_key text)
returns public.data_table_columns
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_club uuid;
  created_columns public.data_table_columns;
begin
  select dt.club_id into target_club from public.data_tables dt where dt.id = target_table;

  if target_club is null then
    raise exception 'Table not found' using errcode = 'P0002';
  end if;

  if not (
    public.has_club_permission(target_club, 'manage_data_tables')
    or public.is_club_admin(target_club)
  ) then
    raise exception 'You do not have permission to create tables'
      using errcode = '42501';
  end if;

  -- Replace any proposed-but-unapproved columns.
  delete from public.data_table_columns where table_id = target_table;

  insert into public.data_table_columns (table_id, name, column_type, sort_order, is_required)
  values
    (target_table, 'Member', 'member', 0, true),
    (target_table, 'Event', 'event', 1, true),
    (target_table, 'Date', 'date', 2, true),
    (target_table, 'Hours', 'number', 3, false),
    (target_table, 'Notes', 'text', 4, false)
  returning * into created_columns;

  update public.data_tables
  set template_key = apply_table_template.template_key,
      updated_at = now()
  where id = target_table;

  return created_columns;
end;
$$;

revoke all on function public.apply_table_template(uuid, text) from public, anon;
grant execute on function public.apply_table_template(uuid, text) to authenticated;

commit;
