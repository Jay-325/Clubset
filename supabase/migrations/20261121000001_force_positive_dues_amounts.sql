-- ============================================================================
-- Clubset :: 2026-11-21 -- force positive dues amounts
-- --
-- The dues table check constraint permits amount = 0, but every
-- application layer rejects it:
--   * src/routes/clubs/$clubId/funds.tsx: SetUpDues rejects amount <= 0
--   * mark_dues_paid() rejects amount <= 0
--
-- A zero-amount dues record could be inserted directly via SQL (bypassing the
-- frontend), but mark_dues_paid() would then refuse to process it, leaving a
-- stuck record that can never be paid. Tighten the constraint to amount > 0
-- so the database enforces the same invariant as the frontend and RPC.
-- ============================================================================

begin;

alter table public.dues
  drop constraint dues_amount_check,
  add constraint dues_amount_check check (amount > 0);

commit;
