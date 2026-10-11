-- ============================================================================
-- Joinin :: project-wide execution grant hardening
--
-- Postgres grants EXECUTE to PUBLIC on every function created without an
-- explicit revoke, so nearly every SECURITY DEFINER helper in this schema was
-- callable without signing in. The per-migration fixes so far only covered the
-- functions each migration introduced; this pass closes the rest and keeps
-- future ones honest by rebuilding the grants from the live catalogue.
--
-- Who keeps EXECUTE:
--   * authenticated -- every action the app calls directly (see the rpc() calls
--     in src/lib/queries.ts), every trigger function (a trigger runs as the
--     user who fired it, so that user needs EXECUTE on it), and every helper
--     referenced from inside a row-level-security policy (policies evaluate as
--     the querying role).
--   * service_role -- server-side maintenance paths.
--   * supabase_auth_admin / authenticator -- already granted explicitly on the
--     auth trigger and left untouched here.
--
-- Who is deliberately left without it:
--   * anon / PUBLIC -- no action in this app is meant to be reachable before
--     signing in.
--   * three internal helpers that only ever run from inside a SECURITY DEFINER
--     trigger or as part of the sign-in flow: notify_club_leaders, notify_user
--     and handle_new_auth_user.
-- ============================================================================

do $$
declare
  fn record;
  -- Not callable directly by a member: the sign-in system fires the first one
  -- itself, and the other two are only ever invoked from inside a SECURITY
  -- DEFINER trigger, which runs as the function owner.
  member_denied text[] := array['notify_club_leaders', 'notify_user', 'handle_new_auth_user'];
begin
  for fn in
    select p.oid::regprocedure as signature, p.proname
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prokind = 'f'
    order by p.proname
  loop
    execute format('revoke all on function %s from public, anon', fn.signature);

    if not (fn.proname = any (member_denied)) then
      execute format('grant execute on function %s to authenticated, service_role', fn.signature);
    end if;
  end loop;
end;
$$;