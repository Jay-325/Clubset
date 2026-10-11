-- ============================================================================
-- Joinin :: 04 Group chat, banners, announcements
--
-- PRD 12: every active club gets a group chat; accepting a member adds them
-- automatically; leaders can control whether new members see history.
-- ============================================================================

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  -- Lets a leader delete a single message without rewriting history.
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_not_blank check (length(btrim(content)) > 0)
);

create index messages_club_time_idx on public.messages (club_id, created_at desc);
create index messages_sender_idx on public.messages (sender_id);

alter table public.messages enable row level security;

-- Only active members read the chat (PRD 9). Administrators are NOT granted
-- blanket access to student conversations (PRD 37).
create policy messages_select_member on public.messages
  for select
  using (public.is_club_member(club_id));

create policy messages_insert_member on public.messages
  for insert
  with check (sender_id = auth.uid() and public.is_club_member(club_id));

create policy messages_delete_moderator on public.messages
  for delete
  using (
    deleted_at is not null
    or sender_id = auth.uid()
    or public.has_club_permission(club_id, 'moderate_chat')
  );

-- ---------------------------------------------------------------------------
-- Leader chat banners (PRD 12): temporary banners for fundraisers, dates, goals
-- ---------------------------------------------------------------------------

create table public.chat_banners (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  content text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  check (expires_at is null or expires_at > created_at)
);

create index chat_banners_active_idx on public.chat_banners (club_id, expires_at);

alter table public.chat_banners enable row level security;

create policy chat_banners_select_member on public.chat_banners
  for select
  using (public.can_read_club(club_id));

create policy chat_banners_write_leader on public.chat_banners
  for all
  using (public.has_club_permission(club_id, 'send_announcements'))
  with check (public.has_club_permission(club_id, 'send_announcements'));

-- ---------------------------------------------------------------------------
-- Message a leader through their role (PRD 12)
--
-- Members contact a ROLE, never a personal email. Threads are per
-- (role, student) so a student's question reaches the current holder.
-- ---------------------------------------------------------------------------

create table public.role_messages (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.leadership_roles (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index role_messages_thread_idx on public.role_messages (role_id, sender_id, created_at);

alter table public.role_messages enable row level security;

-- Both sides of the thread can read it.
create policy role_messages_select_party on public.role_messages
  for select
  using (
    sender_id = auth.uid()
    or exists (
      select 1 from public.role_assignments ra
      where ra.role_id = role_messages.role_id and ra.user_id = auth.uid()
    )
    or public.has_club_permission(club_id, 'manage_leadership')
  );

create policy role_messages_insert_member on public.role_messages
  for insert
  with check (sender_id = auth.uid() and public.is_club_member(club_id));

-- Recipients mark threads read.
create policy role_messages_update_recipient on public.role_messages
  for update
  using (
    exists (
      select 1 from public.role_assignments ra
      where ra.role_id = role_messages.role_id and ra.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.role_assignments ra
      where ra.role_id = role_messages.role_id and ra.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Automatic chat onboarding (PRD 12, 46, 53.9)
--
-- Joining the group chat is automatic, so the UI never asks a student to
-- join a chat. Implemented as the membership 'pending -> active' trigger so
-- no client call can forget it.
-- ---------------------------------------------------------------------------

create or replace function public.handle_membership_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    -- Audit the acceptance (PRD 42).
    perform public.record_audit(
      'membership.accepted',
      'club',
      new.club_id,
      jsonb_build_object('user_id', new.user_id)
    );
  end if;

  -- No chat row needs inserting: the chat is scoped by membership, so being an
  -- active member is what grants access. The 'automatic' part is that the
  -- student never has to take a second action to join the group chat (PRD 9).
  return new;
end;
$$;

create trigger memberships_on_accepted
  after update on public.memberships
  for each row execute function public.handle_membership_accepted();

-- ---------------------------------------------------------------------------
-- Chat history visibility (PRD 12)
--
-- When a club disables history for new members, those members must not be
-- able to read messages sent before they joined. Enforced in RLS so it
-- cannot be bypassed by the client.
-- ---------------------------------------------------------------------------

-- The first policy allowed any member to read all history. It is replaced with
-- the joined_at-aware version below. DROP POLICY is a standalone statement, not
-- an ALTER TABLE action.
drop policy messages_select_member on public.messages;

create policy messages_select_member on public.messages
  for select
  using (
    public.is_club_member(club_id)
    and (
      -- Full history
      exists (
        select 1 from public.clubs c
        where c.id = messages.club_id
          and c.new_members_get_chat_history
      )
      -- Or only messages sent after this member joined
      or exists (
        select 1 from public.memberships m
        where m.club_id = messages.club_id
          and m.user_id = auth.uid()
          and m.joined_at is not null
          and messages.created_at >= m.joined_at
      )
    )
  );