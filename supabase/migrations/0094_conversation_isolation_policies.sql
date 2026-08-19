-- Epic 13 WP04 — the RLS isolation policies for all three Conversation tables.
--
-- ISOLATION IS PARTICIPATION, NOT WORKSPACE MEMBERSHIP — DESIGN_REVIEW.md §4 ITEM 2
--
-- Every isolation policy since Epic 03 has reused api.current_workspace_memberships().
-- This is the first isolation policy in this schema that deliberately does NOT — §20's
-- own rule is "participants see the thread... not each other's workspaces," and a
-- workspace-membership predicate would grant every member of either party's workspace
-- visibility into a thread only the specific people on it should see. The resolver
-- reused instead is public.current_identity() (migration 0028) — already SECURITY
-- DEFINER, already granted to authenticated, already the established way this schema
-- answers "which real person is making this request" — reused rather than building a
-- second, parallel resolver for the identical question.
--
-- ONLY ACTIVE PARTICIPATION GRANTS VISIBILITY — left_at is null, EXPLICITLY
--
-- A removed participant's access ends the moment they are removed, the same posture
-- an ended workspace.memberships row already holds (workspace.current_memberships()
-- excludes anything but state = 'active'). Their prior messages remain permanent
-- (§20) — this policy governs who may read the thread going forward, not whether the
-- messages themselves persist, which the guard triggers in 0091/0093 already ensure
-- unconditionally.

drop policy if exists "participants can view conversations" on work.conversations;
create policy "participants can view conversations"
  on work.conversations for select
  to authenticated
  using (
    id in (
      select cp.conversation_id from work.conversation_participants cp
      where cp.person_ref in (select person_ref from public.current_identity())
        and cp.left_at is null
    )
  );

drop policy if exists "participants can view conversation_participants" on work.conversation_participants;
create policy "participants can view conversation_participants"
  on work.conversation_participants for select
  to authenticated
  using (
    conversation_id in (
      select cp.conversation_id from work.conversation_participants cp
      where cp.person_ref in (select person_ref from public.current_identity())
        and cp.left_at is null
    )
  );

comment on policy "participants can view conversation_participants" on work.conversation_participants is
  'A participant sees the full roster of their own conversation — who else is on the thread — the same "see the thread" grant §20 describes, applied to the roster itself rather than only the messages.';

drop policy if exists "participants can view messages" on work.messages;
create policy "participants can view messages"
  on work.messages for select
  to authenticated
  using (
    conversation_id in (
      select cp.conversation_id from work.conversation_participants cp
      where cp.person_ref in (select person_ref from public.current_identity())
        and cp.left_at is null
    )
  );
