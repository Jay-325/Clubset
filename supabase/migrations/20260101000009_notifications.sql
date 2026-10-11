-- ============================================================================
-- Club discovery (PRD 20) and recommendations (PRD 21)
-- ============================================================================
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
      c.id,
      c.name,
      c.description,
      c.type,
      c.commitment,
      c.fields,
      c.room,
      c.meeting_day,
      c.meeting_time,
      c.welcome_message,
      (select count(*) from public.memberships m
        where m.club_id = c.id and m.status = 'active') as member_count,
      public.is_club_member(c.id) as is_member,
      coalesce(
        (select array_agg(distinct reason)
         from unnest(
           case
             when p.interests && c.fields then array['Matches your interests: ' || array_to_string(c.fields, ', ')]
             else '{}'::text[]
           end
           || case
                when (
                  (p.commitment_hours is null or p.commitment_hours < 1.0) and c.commitment = 'low'
                  or (p.commitment_hours >= 1.0 and p.commitment_hours < 3.0) and c.commitment = 'medium'
                  or (p.commitment_hours >= 3.0) and c.commitment = 'high'
                ) then array['Matches your commitment level']
                else '{}'::text[]
              end
         ) as reason),
        '{}'::text[]
      ) as match_reasons
    from visible c
    cross join public.profiles p
    where p.id = auth.uid()
      and (
        search_text is null
        or c.name ilike '%' || search_text || '%'
        or c.description ilike '%' || search_text || '%'
      )
      and (filter_type is null or c.type = filter_type)
      and (filter_field is null or filter_field = any (c.fields))
      and (filter_commitment is null or c.commitment = filter_commitment)
      and not public.is_club_member(c.id)
  )
  select
    id,
    name,
    description,
    type,
    commitment,
    fields,
    room,
    meeting_day,
    meeting_time,
    welcome_message,
    member_count,
    is_member,
    match_reasons
  from scored
  order by array_length(match_reasons, 1) desc nulls last, name;
$$;
