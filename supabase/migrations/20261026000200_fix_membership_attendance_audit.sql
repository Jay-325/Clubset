-- ============================================================================
-- Clubset :: 2026-10-26 -- membership self-update, attendance, audit writers
--
-- This migration is the second remediation batch from
-- supabase/AUDIT_2026-10-24_schema_rls_indexes.md. It changes no table, no
-- column and no row. Everything here is a policy, function, trigger or grant.
--
-- FINDINGS ADDRESSED
--   C1  memberships: the repo still let a student set their own row to
--       'active' (self-admission to any club). Live was patched by hand and
--       the patch existed in no migration.
--   C3  finalize_attendance() referenced attendance_finalized_at, a column
--       that does not exist, so final attendance could never be produced.
--   C4  attendance_corrections had no INSERT policy, so every correction and
--       every veto raised 42501 for leaders as well as students.
--   H1  review_application() authorized on a property of the ROLE
--       (is_review_supervisor) instead of on the caller.
--   H2  review_application() could not update the application row, so it
--       granted the role while leaving the application 'submitted'.
--   H5  public.record_audit() was callable by any signed-in user through
--       /rest/v1/rpc/record_audit and could forge audit_logs rows.
--
-- WHY finalize_attendance() BECOMES SECURITY DEFINER
--   It writes two tables: events.attendance_finalized and attendance.status.
--   The events UPDATE policy requires 'manage_events' (or club admin), but the
--   documented permission for finalizing attendance is 'manage_attendance'.
--   A leader holding only manage_attendance therefore cannot finalize at all.
--   Running as the definer with an explicit has_club_permission check keeps
--   the authorization rule in one place instead of widening events_update_leader
--   (which would let an attendance manager rewrite event details).
--
-- WHY review_application() / apply_for_role() BECOME SECURITY DEFINER
--   Both write leadership_applications; the reviewer UPDATE policies (added in
--   20261026000300) are intentionally narrow (manage_leadership / club admin),
--   while a current role holder or supervising-role holder is a legitimate
--   reviewer. The explicit caller gate below is the single authorization
--   point. apply_for_role() also writes a 'submitted' row, which the tightened
--   INSERT policy (draft-only) deliberately refuses to clients.
--
-- AUDIT HARDENING
--   private.record_audit() is the non-exposed implementation. The `private`
--   schema is not in the Data API's exposed schema list, so it cannot be
--   reached through /rest/v1/rpc. The six SECURITY INVOKER RPCs that used to
--   call public.record_audit() now call the private one, which lets
--   public.record_audit() lose its EXECUTE grant for `authenticated`.
--   The SECURITY DEFINER audit triggers keep calling public.record_audit();
--   they run as the owner (postgres), which retains EXECUTE.
--
-- ROLLBACK
--   Restore memberships_update_leader / memberships_select /
--   memberships_insert_self from 20260101000002_clubs.sql, drop
--   memberships_update_self, guard_membership_self_update() and its trigger,
--   drop policy attendance_corrections_insert_staff, restore
--   correct_attendance / finalize_attendance / add_transaction / publish_form
--   / apply_for_role / review_application from their original migrations,
--   grant execute on public.record_audit(text, text, uuid, jsonb) to
--   authenticated, and drop schema private cascade.
--   No table, column or row is affected by the rollback.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Memberships: leaders decide, students may only maintain their own row
--
--    The original policy let `user_id = auth.uid()` satisfy USING and
--    WITH CHECK, so a PATCH of your own row with {"status":"active"} admitted
--    you to any club. Two separate concerns replace it:
--      * memberships_update_leader -- staff only (unchanged live behaviour).
--      * memberships_update_self   -- the student may touch their own row, and
--        guard_membership_self_update() decides what may actually change.
-- ---------------------------------------------------------------------------
drop policy if exists memberships_update_leader on public.memberships;

create policy memberships_update_leader on public.memberships
  for update
  using (
    public.has_club_permission(club_id, 'manage_membership')
    or public.is_club_admin(club_id)
  )
  with check (
    public.has_club_permission(club_id, 'manage_membership')
    or public.is_club_admin(club_id)
  );

-- The live-only `memberships_leave_self` policy is superseded by the pair
-- below. Dropping it keeps a single self-update rule in the repo.
drop policy if exists memberships_leave_self on public.memberships;
drop policy if exists memberships_update_self on public.memberships;

create policy memberships_update_self on public.memberships
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists memberships_select on public.memberships;

create policy memberships_select on public.memberships
  for select
  using (
    user_id = (select auth.uid())
    or public.has_club_permission(club_id, 'manage_membership')
    or public.is_club_admin(club_id)
  );

drop policy if exists memberships_insert_self on public.memberships;

create policy memberships_insert_self on public.memberships
  for insert
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1 from public.clubs c
      where c.id = memberships.club_id
        and c.school_id = (select public.current_school_id())
        and c.status = 'approved'
    )
  );

-- The RLS policy alone cannot express "you may withdraw, but you may not
-- promote yourself", because both are a change to the same column. A BEFORE
-- UPDATE trigger can. Staff updates return early and keep full control.
create or replace function public.guard_membership_self_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Staff path: manage_membership / club administrator keeps existing rights.
  if public.has_club_permission(new.club_id, 'manage_membership')
     or public.is_club_admin(new.club_id) then
    return new;
  end if;

  -- Trusted non-user context (service_role, a SECURITY DEFINER back-office
  -- path, a seed script). RLS already governs every client path: both
  -- memberships UPDATE policies are false when auth.uid() is null, so only a
  -- role that bypasses RLS can reach this branch.
  if auth.uid() is null then
    return new;
  end if;

  if new.user_id <> auth.uid() then
    raise exception 'You can only change your own membership'
      using errcode = '42501';
  end if;

  -- Identity columns are immutable for the student.
  if new.id <> old.id
     or new.user_id <> old.user_id
     or new.club_id <> old.club_id then
    raise exception 'Membership identity cannot be changed'
      using errcode = '42501';
  end if;

  -- joined_at is the "accepted" marker; only staff may set it.
  if new.joined_at is distinct from old.joined_at then
    raise exception 'Only club leadership can accept a membership'
      using errcode = '42501';
  end if;

  -- The only status transition a student may perform is withdrawal.
  if new.status is distinct from old.status then
    if not (old.status in ('pending', 'active') and new.status = 'removed') then
      raise exception 'Membership status can only be changed by club leadership'
        using errcode = '42501';
    end if;
  end if;

  -- is_priority is organizational only (PRD 22), so it stays self-service.

  return new;
end;
$$;

comment on function public.guard_membership_self_update() is
  'BEFORE UPDATE guard on memberships: staff keep full control; a student may only set is_priority and withdraw (pending|active -> removed). Reproduces the live-only protection in a migration.';

drop trigger if exists memberships_guard_self_update on public.memberships;

create trigger memberships_guard_self_update
  before update on public.memberships
  for each row execute function public.guard_membership_self_update();

-- ---------------------------------------------------------------------------
-- 2. Attendance corrections: the INSERT policy the correction flow needs
--
--    correct_attendance() and veto_rsvp() are SECURITY INVOKER and insert the
--    audit row themselves. The policy pins the three identifiers to the row
--    they describe, so a caller cannot log a correction against somebody
--    else's attendance record.
-- ---------------------------------------------------------------------------
drop policy if exists attendance_corrections_insert_staff on public.attendance_corrections;

create policy attendance_corrections_insert_staff on public.attendance_corrections
  for insert
  with check (
    corrected_by = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = attendance_corrections.event_id
        and (
          public.has_club_permission(e.club_id, 'manage_attendance')
          or public.is_club_admin(e.club_id)
        )
    )
    and exists (
      select 1 from public.attendance a
      where a.id = attendance_corrections.attendance_id
        and a.event_id = attendance_corrections.event_id
        and a.user_id = attendance_corrections.user_id
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Audit writer that is not an RPC endpoint
-- ---------------------------------------------------------------------------
create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role, postgres;

create or replace function private.record_audit(
  p_action text,
  p_object_type text,
  p_object_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  insert into public.audit_logs (school_id, actor_id, action, object_type, object_id, details)
  values (public.current_school_id(), auth.uid(), p_action, p_object_type, p_object_id, p_details);
end;
$$;

comment on function private.record_audit(text, text, uuid, jsonb) is
  'Audit-log writer for SECURITY INVOKER RPCs. Lives in the non-exposed private schema so it is not reachable via /rest/v1/rpc.';

revoke all on function private.record_audit(text, text, uuid, jsonb) from public, anon;
grant execute on function private.record_audit(text, text, uuid, jsonb)
  to authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- 4. add_transaction(): audit through the private writer
-- ---------------------------------------------------------------------------
create or replace function public.add_transaction(
  target_club uuid,
  tx_type public.transaction_type,
  amount numeric,
  category text,
  description text default '',
  occurred_on date default current_date,
  receipt_path text default null
)
returns public.transactions
language plpgsql
security invoker
set search_path = public
as $$
declare
  result public.transactions;
begin
  if not (
    public.has_club_permission(target_club, 'manage_finances')
    or public.is_club_admin(target_club)
  ) then
    raise exception 'You do not have permission to manage funds'
      using errcode = '42501';
  end if;

  if amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '23514';
  end if;

  insert into public.transactions (
    club_id, created_by, type, amount, category, description, occurred_on, receipt_path
  )
  values (
    target_club, auth.uid(), tx_type, amount, category, description,
    coalesce(occurred_on, current_date), receipt_path
  )
  returning * into result;

  perform private.record_audit(
    'transaction.created', 'transaction', result.id,
    jsonb_build_object('club_id', target_club, 'type', tx_type, 'amount', amount)
  );

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. publish_form(): audit through the private writer
-- ---------------------------------------------------------------------------
create or replace function public.publish_form(target_form uuid)
returns public.forms
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_club uuid;
  question_count integer;
  updated_form public.forms;
begin
  select f.club_id into target_club from public.forms f where f.id = target_form;

  if target_club is null then
    raise exception 'Form not found' using errcode = 'P0002';
  end if;

  if not (
    public.has_club_permission(target_club, 'manage_forms')
    or public.is_club_admin(target_club)
  ) then
    raise exception 'You do not have permission to publish forms'
      using errcode = '42501';
  end if;

  select count(*) into question_count
  from public.form_questions where form_id = target_form;

  if question_count = 0 then
    raise exception 'Add at least one question before publishing'
      using errcode = '23514';
  end if;

  update public.forms
  set status = 'published', updated_at = now()
  where id = target_form
  returning * into updated_form;

  perform private.record_audit('form.published', 'form', target_form, '{}'::jsonb);

  return updated_form;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. correct_attendance(): audit through the private writer
--
--    Behaviour is unchanged: still SECURITY INVOKER, still gated on
--    manage_attendance / club admin, still writes one corrections row.
-- ---------------------------------------------------------------------------
create or replace function public.correct_attendance(
  target_attendance uuid,
  new_status public.attendance_status,
  correction_reason text default null
)
returns public.attendance
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_event uuid;
  target_club uuid;
  record_row public.attendance;
  previous_status public.attendance_status;
begin
  select a.event_id, e.club_id into target_event, target_club
  from public.attendance a
  join public.events e on e.id = a.event_id
  where a.id = target_attendance;

  if target_event is null then
    raise exception 'Attendance record not found' using errcode = 'P0002';
  end if;

  if not (
    public.has_club_permission(target_club, 'manage_attendance')
    or public.is_club_admin(target_club)
  ) then
    raise exception 'You do not have permission to correct attendance'
      using errcode = '42501';
  end if;

  select status into previous_status
  from public.attendance where id = target_attendance;

  update public.attendance
  set status = new_status,
      source = 'manual',
      finalized_by = auth.uid(),
      finalized_at = now(),
      note = correction_reason
  where id = target_attendance
  returning * into record_row;

  insert into public.attendance_corrections (
    attendance_id, event_id, user_id, original_status, new_status, corrected_by, reason
  )
  values (
    target_attendance, target_event, record_row.user_id,
    previous_status, new_status, auth.uid(), correction_reason
  );

  perform private.record_audit(
    'attendance.corrected',
    'attendance',
    target_attendance,
    jsonb_build_object(
      'event_id', target_event,
      'user_id', record_row.user_id,
      'from', previous_status,
      'to', new_status,
      'reason', correction_reason
    )
  );

  return record_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. finalize_attendance(): fix the column and allow manage_attendance alone
-- ---------------------------------------------------------------------------
create or replace function public.finalize_attendance(target_event uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_club uuid;
  summary jsonb;
begin
  select club_id into target_club from public.events where id = target_event;

  if target_club is null then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  if not (
    public.has_club_permission(target_club, 'manage_attendance')
    or public.is_club_admin(target_club)
  ) then
    raise exception 'You do not have permission to finalize attendance'
      using errcode = '42501';
  end if;

  update public.events set attendance_finalized = true where id = target_event;

  -- Lock in whatever the leader left as 'rsvp_pending' by confirming it.
  -- `finalized_at` is the real column on public.attendance.
  update public.attendance
  set status = 'attended',
      finalized_by = auth.uid(),
      finalized_at = now()
  where event_id = target_event
    and status = 'rsvp_pending'
    and finalized_at is null;

  select jsonb_build_object(
    'attended', count(*) filter (where status = 'attended'),
    'did_not_attend', count(*) filter (where status = 'did_not_attend'),
    'not_applicable', count(*) filter (where status = 'not_applicable')
  ) into summary
  from public.attendance
  where event_id = target_event;

  perform private.record_audit(
    'attendance.finalized', 'event', target_event, summary
  );

  return summary;
end;
$$;

comment on function public.finalize_attendance(uuid) is
  'Finalizes attendance for one event. SECURITY DEFINER with an explicit manage_attendance / club-admin gate so a leader without manage_events can still finalize.';

revoke all on function public.finalize_attendance(uuid) from public, anon;
grant execute on function public.finalize_attendance(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. apply_for_role(): explicit self-only submission
--
--    The applicant id is always auth.uid(); the eligibility gate is unchanged.
--    An application that has already been accepted is never reset, so a repeat
--    call cannot reopen a decided position.
-- ---------------------------------------------------------------------------
create or replace function public.apply_for_role(target_role uuid)
returns public.leadership_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  target_club uuid;
  eligibility jsonb;
  context jsonb;
  existing_status public.application_status;
  result public.leadership_applications;
begin
  select lr.club_id into target_club
  from public.leadership_roles lr where lr.id = target_role;

  if target_club is null then
    raise exception 'Position not found' using errcode = 'P0002';
  end if;

  select public.check_eligibility(target_role, auth.uid()) into eligibility;

  -- The gate is server-side: the UI hides ineligible positions, but Postgres
  -- is what actually enforces it (PRD 41, 53.20).
  if not coalesce((eligibility ->> 'eligible')::boolean, false) then
    raise exception 'You do not yet meet the requirements for this position'
      using errcode = '42501';
  end if;

  select la.status into existing_status
  from public.leadership_applications la
  where la.role_id = target_role and la.applicant_id = auth.uid();

  if existing_status = 'accepted' then
    raise exception 'You already hold this position' using errcode = '23514';
  end if;

  -- PRD 33 step 5: attach what Clubset already knows instead of re-asking.
  select jsonb_build_object(
    'eligibility', eligibility -> 'metrics',
    'membership_joined_at', m.joined_at,
    'profile', jsonb_build_object(
      'full_name', p.full_name,
      'grade', p.grade,
      'interests', to_jsonb(p.interests)
    )
  ) into context
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  where m.club_id = target_club and m.user_id = auth.uid();

  insert into public.leadership_applications (
    club_id, role_id, applicant_id, status, applicant_context, submitted_at
  )
  values (target_club, target_role, auth.uid(), 'submitted', context, now())
  on conflict (role_id, applicant_id) do update
    set status = 'submitted',
        submitted_at = now(),
        applicant_context = excluded.applicant_context,
        reviewed_by = null,
        reviewed_at = null,
        review_notes = null,
        updated_at = now()
  returning * into result;

  perform private.record_audit(
    'leadership.application_submitted', 'application', result.id,
    jsonb_build_object('role_id', target_role)
  );

  return result;
end;
$$;

revoke all on function public.apply_for_role(uuid) from public, anon;
grant execute on function public.apply_for_role(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. review_application(): authorize the caller, not the role
--
--    Authorized reviewers:
--      * the current holder of the role being applied for,
--      * the holder of a supervising role (is_review_supervisor) in the SAME
--        club -- the flag describes the role, so the caller must hold it,
--      * a leader with manage_leadership,
--      * a club administrator.
--    Self-review is refused. The role is granted only after the application
--    row was actually updated.
-- ---------------------------------------------------------------------------
create or replace function public.review_application(
  target_application uuid,
  accept boolean,
  review_notes text default null
)
returns public.leadership_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  app public.leadership_applications;
  result public.leadership_applications;
begin
  select * into app
  from public.leadership_applications
  where id = target_application;

  if app.id is null then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;

  if app.applicant_id = auth.uid() then
    raise exception 'You cannot review your own application'
      using errcode = '42501';
  end if;

  if not (
    exists (
      select 1 from public.role_assignments ra
      where ra.role_id = app.role_id and ra.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.role_assignments ra
      join public.leadership_roles lr on lr.id = ra.role_id
      where ra.club_id = app.club_id
        and ra.user_id = auth.uid()
        and lr.is_review_supervisor
    )
    or public.has_club_permission(app.club_id, 'manage_leadership')
    or public.is_club_admin(app.club_id)
  ) then
    raise exception 'You are not the reviewer for this position'
      using errcode = '42501';
  end if;

  update public.leadership_applications
  set status = case when accept then 'accepted' else 'rejected' end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = review_notes,
      updated_at = now()
  where id = target_application
  returning * into result;

  -- Never grant a role for an update that did not happen.
  if result.id is null then
    raise exception 'Application could not be updated'
      using errcode = '42501';
  end if;

  -- Accepting grants the role automatically (PRD 46: one entry, reused).
  if accept then
    insert into public.role_assignments (role_id, club_id, user_id, assigned_by)
    values (app.role_id, app.club_id, app.applicant_id, auth.uid())
    on conflict (role_id, user_id) do nothing;
  end if;

  perform private.record_audit(
    'leadership.application_reviewed', 'application', target_application,
    jsonb_build_object('accepted', accept, 'applicant_id', app.applicant_id)
  );

  return result;
end;
$$;

comment on function public.review_application(uuid, boolean, text) is
  'Reviews one leadership application. SECURITY DEFINER: caller must be the current role holder, a supervising-role holder in the same club, manage_leadership, or club admin; self-review is refused.';

revoke all on function public.review_application(uuid, boolean, text) from public, anon;
grant execute on function public.review_application(uuid, boolean, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Remove the client-facing audit endpoint
--
--     The six SECURITY INVOKER RPCs above now use private.record_audit(), and
--     the remaining callers are SECURITY DEFINER triggers owned by postgres.
-- ---------------------------------------------------------------------------
revoke execute on function public.record_audit(text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_audit(text, text, uuid, jsonb)
  to service_role;

commit;
