-- ============================================================================
-- Remove unused receipt-management scaffolding
--
-- Receipt upload/view/download was never implemented: no `receipts` bucket is
-- declared in config.toml, no storage API creates it, and no frontend upload
-- or download code exists. The only remnants are:
--   * public.transactions.receipt_path (no row ever carried a value)
--   * the receipt_path parameter on public.add_transaction()
--   * three receipt-specific storage policies (receipts_read/insert/delete)
--   * a receipt indicator in the Funds recent-activity list
--   * a receipt-themed icon on the Expense Ledger tool in Finance
--
-- None of these store receipt data, so removing them does not destroy
-- transaction records, balances, dues, permissions, or audit logging. Financial
-- accounting works exactly as before.
--
-- This is forward-only. Historical applied migrations are intentionally NOT
-- edited; they reproduce the live schema and authorization state as applied.
--
-- DESTRUCTIVE CHANGE: drops public.transactions.receipt_path and the
-- receipt_path parameter of public.add_transaction(). Rollback would require
-- re-adding the column and re-creating add_transaction() with the parameter;
-- the pre-removal definitions live in 20260101000005_finances.sql and
-- 20261026000200_fix_membership_attendance_audit.sql.
-- ============================================================================

-- 1. Drop receipt-specific storage policies. receipts_read references
--    transactions.receipt_path, so these must go before the column is dropped.
--    No storage bucket or stored objects are deleted here.
drop policy if exists receipts_read on storage.objects;
drop policy if exists receipts_insert on storage.objects;
drop policy if exists receipts_delete on storage.objects;

-- 2. Remove the unused receipt_path column.
--    Before applying to hosted/production, confirm:
--      select count(*) from public.transactions where receipt_path is not null
--    returns 0, because dropping the column discards that data.
alter table public.transactions
  drop column if exists receipt_path;

-- 3. Recreate add_transaction() without the receipt_path parameter. PostgreSQL
--    cannot drop a single parameter via create or replace, so the function is
--    dropped and re-created. All existing behavior is preserved:
--    manage_finances / club-admin permission checks, positive-amount
--    validation, transaction creation, audit logging, SECURITY INVOKER, and
--    set search_path = public.
drop function if exists public.add_transaction(
  uuid,
  public.transaction_type,
  numeric,
  text,
  text,
  date,
  text
);

create function public.add_transaction(
  target_club uuid,
  tx_type public.transaction_type,
  amount numeric,
  category text,
  description text default '',
  occurred_on date default current_date
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
    club_id, created_by, type, amount, category, description, occurred_on
  )
  values (
    target_club, auth.uid(), tx_type, amount, category, description,
    coalesce(occurred_on, current_date)
  )
  returning * into result;

  perform private.record_audit(
    'transaction.created', 'transaction', result.id,
    jsonb_build_object('club_id', target_club, 'type', tx_type, 'amount', amount)
  );

  return result;
end;
$$;

-- 4. Re-grant execute to anon + authenticated to preserve the existing
--    authorization boundary (the function itself enforces auth at runtime).
grant execute on function public.add_transaction(
  uuid, public.transaction_type, numeric, text, text, date
) to anon, authenticated;
