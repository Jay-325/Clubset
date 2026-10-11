-- ============================================================================
-- Joinin :: harden exposed helper functions
--
-- The core schema's SECURITY DEFINER helpers are internal plumbing: policies
-- and triggers call them, and activate_administrator() is the only one a
-- client should ever call directly. They were callable by anyone, including
-- signed-out visitors, because functions in `public` default to PUBLIC EXECUTE.
-- ============================================================================

revoke execute on function
  public.handle_new_auth_user(),
  public.activate_administrator(),
  public.current_school_id(),
  public.is_administrator(),
  public.current_profile()
from public, anon;

-- handle_new_auth_user() is a trigger function: it runs as the role that
-- performed the signup, not as a browser client, so that role keeps EXECUTE
-- even though signed-out visitors lose it.
grant execute on function public.handle_new_auth_user()
  to service_role, supabase_auth_admin, postgres, authenticator;

-- These four are legitimately callable by a signed-in user. Each one decides
-- based on auth.uid(), so a caller can only ever learn about themselves.
grant execute on function
  public.activate_administrator(),
  public.current_school_id(),
  public.is_administrator(),
  public.current_profile()
to authenticated, service_role, postgres;