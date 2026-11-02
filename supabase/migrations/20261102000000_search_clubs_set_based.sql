-- ============================================================================
-- Clubset :: 2026-11-02 -- search_clubs: set-based membership checks
--
-- Replace per-row SECURITY DEFINER calls to is_club_member() and correlated
-- member-count subqueries with set-based LEFT JOINs to pre-aggregated CTEs.
--
-- Before: for N candidate clubs, the RPC executed N calls to is_club_member()
--   (each an individual index scan on memberships) plus N correlated
--   count(*) subqueries — 3N function/subquery evaluations per search.
--
-- After: memberships are aggregated once per club_id (member_counts CTE) and
--   once per user (my_memberships CTE), then LEFT JOINed to the visible clubs.
--   This reduces per-row function calls from O(N) to O(1) set-based operations.
--
-- Additive only: create or replace, no table/column/policy/row change.
-- Preserves SECURITY DEFINER, search_path, volatility, return type, grants,
-- and output semantics exactly.
-- ============================================================================

begin;

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
  member_counts as (
    select club_id, count(*) as active_count
    from public.memberships
    where status = 'active'
    group by club_id
  ),
  my_memberships as (
    select club_id
    from public.memberships
    where user_id = (select auth.uid())
      and status = 'active'
  ),
  scored as (
    select
      c.id, c.name, c.description, c.type, c.commitment, c.fields, c.room,
      c.meeting_day, c.meeting_time, c.welcome_message,
      coalesce(mc.active_count, 0) as member_count,
      (mm.club_id is not null) as is_member,
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
    left join member_counts mc on mc.club_id = c.id
    left join my_memberships mm on mm.club_id = c.id
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
      and mm.club_id is null
  )
  select
    s.id, s.name, s.description, s.type, s.commitment, s.fields, s.room,
    s.meeting_day, s.meeting_time, s.welcome_message, s.member_count,
    s.is_member, s.match_reasons
  from scored s
  order by array_length(s.match_reasons, 1) desc nulls last, s.name;
$$;

commit;
