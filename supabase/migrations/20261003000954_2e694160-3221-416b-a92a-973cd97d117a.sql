-- ============================================================================
-- Joinin :: 08 follow-up -- eligibility checks are scoped to the caller
--
-- check_eligibility(role, student_id) and eligible_roles_for(student_id) are
-- SECURITY DEFINER and took an arbitrary student_id, so any signed-in user
-- could read another student's attendance rate, volunteer hours and membership
-- age. application_review_packet already checked the reviewer; these two did
-- not. All three were also reachable without signing in.
--
--   * check_eligibility now requires the caller to be the student themselves,
--     a club leader, or an administrator.
--   * eligible_roles_for inherits that check (it evaluates every role through
--     check_eligibility), so it cannot be used to enumerate other students.
--   * All three are revoked from anon / not-signed-in callers.
-- ============================================================================

create or replace function public.check_eligibility(target_role uuid, student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_club uuid;
  enrolled_at timestamptz;
  attendance_totals jsonb;
  volunteer_hours numeric := 0;
  result jsonb;
  unmet jsonb := '[]'::jsonb;
begin
  select lr.club_id into target_club
  from public.leadership_roles lr where lr.id = target_role;

  if target_club is null then
    raise exception 'Role not found' using errcode = 'P0002';
  end if;

  -- Standing is personal: the student, their club leadership, or a school
  -- administrator only (PRD 41 -- the database decides, not the UI).
  if student_id <> auth.uid()
    and not (
      public.has_club_permission(target_club, 'manage_leadership')
      or public.is_club_admin(target_club)
      or public.is_administrator()
    )
  then
    raise exception 'You are not allowed to view this eligibility'
      using errcode = '42501';
  end if;

  select m.joined_at into enrolled_at
  from public.memberships m
  where m.club_id = target_club
    and m.user_id = student_id
    and m.status = 'active';

  if enrolled_at is null then
    return jsonb_build_object(
      'eligible', false,
      'metrics', jsonb_build_object(),
      'unmet', jsonb_build_array(jsonb_build_object(
        'kind', 'active_membership', 'label', 'Must be an active club member'
      ))
    );
  end if;

  select public.attendance_stats(target_club, student_id) into attendance_totals;

  select coalesce(sum((r.data ->> 'Hours')::numeric), 0) into volunteer_hours
  from public.data_table_rows r
  join public.data_tables dt on dt.id = r.table_id
  where dt.club_id = target_club
    and dt.template_key = 'volunteer_hours'
    and r.member_id = student_id;

  unmet := unmet || (
    select coalesce(jsonb_agg(jsonb_build_object(
      'kind', er.kind,
      'label', initcap(replace(er.kind::text, '_', ' ')),
      'required', er.threshold,
      'actual', case er.kind
        when 'min_days_in_club' then floor(extract(epoch from (now() - enrolled_at)) / 86400)
        when 'min_attendance_rate' then (attendance_totals ->> 'attendance_rate')::numeric
        when 'min_events_attended' then (attendance_totals ->> 'attended')::numeric
        when 'min_volunteer_hours' then volunteer_hours
      end
    ) order by er.kind), '[]'::jsonb)
    from public.eligibility_requirements er
    where er.role_id = target_role
      and case er.kind
        when 'min_days_in_club'
          then floor(extract(epoch from (now() - enrolled_at)) / 86400) < er.threshold
        when 'min_attendance_rate'
          then coalesce(((attendance_totals ->> 'attendance_rate')::numeric), 0) < er.threshold
        when 'min_events_attended'
          then coalesce(((attendance_totals ->> 'attended')::numeric), 0) < er.threshold
        when 'min_volunteer_hours'
          then volunteer_hours < er.threshold
      end
  );

  return jsonb_build_object(
    'eligible', jsonb_array_length(unmet) = 0,
    'metrics', attendance_totals
      || jsonb_build_object(
        'volunteer_hours', volunteer_hours,
        'days_in_club', floor(extract(epoch from (now() - enrolled_at)) / 86400)
      ),
    'unmet', unmet
  );
end;
$$;

revoke all on function public.check_eligibility(uuid, uuid) from public, anon;
revoke all on function public.eligible_roles_for(uuid) from public, anon;
revoke all on function public.application_review_packet(uuid) from public, anon;

grant execute on function public.check_eligibility(uuid, uuid) to authenticated;
grant execute on function public.eligible_roles_for(uuid) to authenticated;
grant execute on function public.application_review_packet(uuid) to authenticated;