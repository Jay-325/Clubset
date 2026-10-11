-- ============================================================================
-- Joinin :: 05 Club funds, dues, receipts
--
-- PRD 24: basic club financial organization, NOT professional accounting.
-- Joinin calculates the balance so nobody has to build a spreadsheet (PRD 24).
-- ============================================================================

create type public.transaction_type as enum ('income', 'expense');
create type public.dues_status as enum ('paid', 'not_paid', 'unknown');

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,

  type public.transaction_type not null,
  -- Positive magnitude only; the balance view applies the sign. Prevents
  -- "expense of -$20" style rows that make hand math ambiguous.
  amount numeric(12, 2) not null check (amount > 0),

  category text not null default 'General',
  description text not null default '',
  occurred_on date not null default current_date,
  receipt_path text,
  -- PRD 24: split amounts
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transactions_club_date_idx on public.transactions (club_id, occurred_on desc);
create index transactions_category_idx on public.transactions (club_id, category);

create trigger transactions_touch_updated_at
  before update on public.transactions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Balance (PRD 24: "Joinin calculates the balance")
-- ---------------------------------------------------------------------------

create or replace view public.club_finances
with (security_invoker = true) as
select
  c.id as club_id,
  coalesce(sum(t.amount) filter (where t.type = 'income'), 0)::numeric(12, 2) as total_income,
  coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)::numeric(12, 2) as total_expenses,
  coalesce(sum(case when t.type = 'income' then t.amount else -t.amount end), 0)::numeric(12, 2) as balance
from public.clubs c
left join public.transactions t on t.club_id = c.id
group by c.id;

-- ---------------------------------------------------------------------------
-- Budgets (PRD 24)
-- ---------------------------------------------------------------------------

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  category text not null,
  limit_amount numeric(12, 2) not null check (limit_amount > 0),
  period_start date not null default date_trunc('year', current_date)::date,
  period_end date not null default (date_trunc('year', current_date) + interval '1 year')::date,
  created_at timestamptz not null default now(),
  unique (club_id, category, period_start)
);

alter table public.budgets enable row level security;

-- ---------------------------------------------------------------------------
-- Dues (PRD 24)
-- ---------------------------------------------------------------------------

create table public.dues (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  status public.dues_status not null default 'unknown',
  due_date date,
  -- Ties a paid dues record to the income transaction that recorded it.
  transaction_id uuid references public.transactions (id) on delete set null,
  marked_paid_by uuid references public.profiles (id) on delete set null,
  paid_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (club_id, user_id)
);

create index dues_club_status_idx on public.dues (club_id, status);

create trigger dues_touch_updated_at
  before update on public.dues
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Add a transaction (PRD 24 quick-add flow)
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

  perform public.record_audit(
    'transaction.created', 'transaction', result.id,
    jsonb_build_object('club_id', target_club, 'type', tx_type, 'amount', amount)
  );

  return result;
end;
$$;

-- PRD 46: "Expense -> automatically updates balance." The balance is a view,
-- so it is always current with no synchronization step.

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.transactions enable row level security;

-- Members see permitted general funds (PRD 23/24); only authorized leaders
-- create or change transactions.
create policy transactions_select on public.transactions
  for select
  using (public.can_read_club(club_id));

create policy transactions_insert_leader on public.transactions
  for insert
  with check (
    created_by = auth.uid()
    and public.has_club_permission(club_id, 'manage_finances')
  );

create policy transactions_update_leader on public.transactions
  for update
  using (
    public.has_club_permission(club_id, 'manage_finances')
    or public.is_club_admin(club_id)
  )
  with check (
    public.has_club_permission(club_id, 'manage_finances')
    or public.is_club_admin(club_id)
  );

create policy transactions_delete_leader on public.transactions
  for delete
  using (
    public.has_club_permission(club_id, 'manage_finances')
    or public.is_club_admin(club_id)
  );

create policy budgets_select on public.budgets
  for select
  using (public.can_read_club(club_id));

create policy budgets_write on public.budgets
  for all
  using (public.has_club_permission(club_id, 'manage_finances') or public.is_club_admin(club_id))
  with check (public.has_club_permission(club_id, 'manage_finances') or public.is_club_admin(club_id));

-- Members see only their OWN dues; leaders see the whole roster.
create policy dues_select on public.dues
  for select
  using (
    user_id = auth.uid()
    or public.has_club_permission(club_id, 'manage_finances')
    or public.is_club_admin(club_id)
  );

create policy dues_write on public.dues
  for all
  using (public.has_club_permission(club_id, 'manage_finances') or public.is_club_admin(club_id))
  with check (public.has_club_permission(club_id, 'manage_finances') or public.is_club_admin(club_id));

-- Marking dues paid records income in the same transaction, so the balance can
-- never disagree with the dues roster.
create or replace function public.mark_dues_paid(target_dues uuid)
returns public.dues
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_club uuid;
  amount numeric;
  income_tx public.transactions;
  updated_dues public.dues;
begin
  select d.club_id, d.amount into target_club, amount
  from public.dues d where d.id = target_dues;

  if target_club is null then
    raise exception 'Dues record not found' using errcode = 'P0002';
  end if;

  if not (
    public.has_club_permission(target_club, 'manage_finances')
    or public.is_club_admin(target_club)
  ) then
    raise exception 'You do not have permission to manage dues'
      using errcode = '42501';
  end if;

  if amount <= 0 then
    raise exception 'This dues record has no amount set' using errcode = '23514';
  end if;

  insert into public.transactions (club_id, created_by, type, amount, category, description)
  values (target_club, auth.uid(), 'income', amount, 'Dues', 'Club dues payment')
  returning * into income_tx;

  update public.dues
  set status = 'paid',
      paid_at = now(),
      marked_paid_by = auth.uid(),
      transaction_id = income_tx.id,
      updated_at = now()
  where id = target_dues
  returning * into updated_dues;

  return updated_dues;
end;
$$;