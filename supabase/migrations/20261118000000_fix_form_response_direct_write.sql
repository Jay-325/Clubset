-- ============================================================================
-- Clubset :: 2026-11-18 -- close F-08 direct form-response write bypass
--
-- submit_form_response() enforces "form is published" and "caller is an active
-- club member", but a direct INSERT into public.form_responses only required
-- user_id = auth.uid(), so a student could record a response for an unpublished
-- form or for a club they are not in, bypassing the RPC entirely.
--
-- Replace the overly permissive insert policy with one that also requires the
-- target form to be published and the caller to be an active member of the
-- form's club. The RPC path is unaffected; direct table writes are now covered
-- by the same authorization.
--
-- ROLLBACK
--   Recreate form_responses_insert_self from the previous migration.
-- ============================================================================

begin;

drop policy if exists form_responses_insert_self on public.form_responses;

create policy form_responses_insert_member_published on public.form_responses
  for insert
  with check (
    user_id = (select auth.uid())
    and (auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and exists (
      select 1
      from public.forms f
      where f.id = form_responses.form_id
        and f.status = 'published'::public.form_status
        and public.is_club_member(f.club_id)
    )
  );

comment on policy form_responses_insert_member_published on public.form_responses
  is 'Form responses may only be inserted by an active club member for a published form. Closes F-08 direct-write bypass of submit_form_response().';

commit;
