-- ============================================================================
-- Joinin :: 07 follow-up -- apply_table_template runs as the caller
--
-- It was SECURITY DEFINER, which let it write data_table_columns / data_tables
-- with elevated rights. Both tables already carry write policies gated on
-- has_club_permission('manage_data_tables') or is_club_admin(), so running as
-- the caller enforces exactly the same rule without the elevated rights, and
-- the function is no longer callable as a privileged shortcut.
-- ============================================================================

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
  set template_key = template_key, updated_at = now()
  where id = target_table;

  return created_columns;
end;
$$;

revoke all on function public.apply_table_template(uuid, text) from public, anon;
grant execute on function public.apply_table_template(uuid, text) to authenticated;