-- ============================================================================
-- Joinin :: 05 follow-up -- dues RLS was never enabled
--
-- The dues_select / dues_write policies were created in 20260101000005 but the
-- matching `enable row level security` was missing, so the table was fully
-- open to every signed-in user. The repo file now carries this statement too.
-- ============================================================================

alter table public.dues enable row level security;