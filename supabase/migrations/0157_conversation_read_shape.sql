-- Platform Activation Slice 2, WP 2.6 (Conversations, client cutover) — closes three real
-- gaps the client rewrite of src/lib/messages.js found, checked directly against
-- MessagesList.jsx/ConversationSheet.jsx before shipping (the same "found before shipping,
-- not user-flagged" discipline this session has held throughout WP 2.6):
--
--   1. MessagesList.jsx renders `c.serviceId ? serviceInfo(c.serviceId).name : ""` as the
--      subtitle of every row — 0147's own api.my_conversations() carries no service_id at
--      all. A real, visible UX regression (a blank subtitle on every conversation) if
--      shipped as-is.
--   2. Legacy's own unread count comes from messages.read_at, a column that does not exist
--      on work.messages at all (0093's own header: "read" is a per-(conversation, person)
--      fact on work.conversation_participants.last_read_at instead — Epic 13's own
--      correction, not an oversight). Without last_read_at reaching the client, the
--      BottomNav's own unread badge (unreadTotal(), src/lib/conversationSelectors.js) has
--      nothing to compute from.
--   3. MessagesList.jsx also needs the OTHER participant's real display name. Reputation's
--      own bridge (workspace.resolve_owner_auth_user_ids, 0151) is deliberately restricted
--      to type = 'professional' workspaces — correct for a marketplace lead, where a
--      stranger pro must never resolve a customer's personal workspace to their real
--      identity. A conversation is different: both sides are already paired, active
--      participants of the same private thread — a materially narrower, already-true
--      precondition this migration's own new resolver checks directly, rather than
--      loosening 0151's own public-professional-only grant (which stays exactly as
--      restrictive as it is).
--   4. ConversationSheet.jsx's own "is this my bubble" check and
--      conversationSelectors.js's own messagesNeedingTranslation() both compare
--      `m.senderId !== userId`, where userId is the real auth id every call site already
--      threads through (CustomerApp.jsx/ProApp.jsx's own `user.id`). 0147's own
--      conversation_messages() returns sender_person_ref, an internal reference the client
--      has never held or compared against anything — every message would have rendered as
--      "not mine" and every message from the viewer's own hand would have queued for
--      translation. Found by re-reading both consumers directly before shipping, the same
--      discipline as the other three gaps above.
--
-- FIX 1/2: my_conversations() GAINS THREE NULLABLE COLUMNS, THE SAME "EXTEND ONCE" CALL
-- my_requests_full_shape.sql (0153) ALREADY MADE FOR THE MARKETPLACE SIDE
--
-- service_id and request_id are resolved through engagement_id -> work.engagements.
-- request_id -> work.requests.service_id — null for the four other subject bindings
-- (asset/maintenance_obligation/property/workspace), none of which any client code creates
-- yet (only work.open_conversation_for_engagement(), 0148, ever calls open_conversation()
-- today). last_read_at is the calling person's own row from the very same
-- conversation_participants join my_conversations() already performs — free, not a new
-- join, since cp is already scoped to p_person_ref.
--
-- FIX 3: work.resolve_conversation_counterpart_auth_ids() — A NEW, NARROWLY-GATED
-- RESOLVER, NOT A LOOSENED 0151
--
-- Takes a batch of workspace ids and public.current_identity()'s own person_ref (never
-- caller-supplied) and returns an auth_user_id ONLY for a workspace that is a real, active
-- co-participant of some conversation the caller is also a real, active participant of.
-- Composes with the ALREADY-EXISTING, already-generic public.resolve_identity_display()
-- (0028 — "anyone's name and avatar, and NOTHING else, ever") for the actual name/avatar,
-- rather than re-deriving identity-schema access here: this function's only job is the one
-- missing hop, workspace_id -> auth_user_id, gated correctly.
--
-- FIX 4: conversation_messages() GAINS sender_auth_user_id — A DIRECT JOIN, NOT A NEW
-- RESOLVER
--
-- Unlike the counterpart lookup above, no gating decision is needed here: 0147's own
-- membership check on conversation_messages_for_caller() already proves the caller is a
-- real, active participant of this exact conversation before any row is returned, so every
-- sender visible in the result is already someone the caller is allowed to see messages
-- from. Resolving sender_person_ref -> auth_user_id is therefore a plain join to
-- identity.identities, no separate gate required.

-- =========================================================================
-- 1 · work.my_conversations() / work.my_conversations_for_caller() / api.my_conversations()
-- — DROP FIRST: the return type is changing (8 columns -> 11), which CREATE OR REPLACE
-- cannot do; PostgreSQL refuses outright rather than silently misbehaving, but every
-- changed-signature function in this slice has dropped first regardless, established
-- practice over relying on that refusal.

drop function if exists work.my_conversations(uuid);
drop function if exists work.my_conversations_for_caller();
drop function if exists api.my_conversations();

create or replace function work.my_conversations(p_person_ref uuid)
returns table (
  id uuid, engagement_id uuid, asset_id uuid, maintenance_obligation_id uuid, property_id uuid,
  workspace_id uuid, closed_at timestamptz, created_at timestamptz,
  service_id uuid, request_id uuid, counterpart_workspace_id uuid, last_read_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    c.id, c.engagement_id, c.asset_id, c.maintenance_obligation_id, c.property_id,
    c.workspace_id, c.closed_at, c.created_at,
    r.service_id, e.request_id,
    (
      select cp_other.workspace_id
      from work.conversation_participants cp_other
      where cp_other.conversation_id = c.id
        and cp_other.person_ref <> p_person_ref
        and cp_other.left_at is null
      limit 1
    ) as counterpart_workspace_id,
    cp.last_read_at
  from work.conversations c
  join work.conversation_participants cp on cp.conversation_id = c.id
  left join work.engagements e on e.id = c.engagement_id
  left join work.requests r on r.id = e.request_id
  where cp.person_ref = p_person_ref and cp.left_at is null;
$$;

comment on function work.my_conversations(uuid) is
  'Extended (WP 2.6 client cutover) with service_id/request_id (resolved through engagement_id, null for every other subject binding), counterpart_workspace_id (the other active participant''s own workspace, at most one today — every conversation this product opens has exactly two participants) and last_read_at (the calling person''s own row, from the same participants join already performed — not a new one). The four original columns are unchanged.';

create or replace function work.my_conversations_for_caller()
returns table (
  id uuid, engagement_id uuid, asset_id uuid, maintenance_obligation_id uuid, property_id uuid,
  workspace_id uuid, closed_at timestamptz, created_at timestamptz,
  service_id uuid, request_id uuid, counterpart_workspace_id uuid, last_read_at timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_person_ref uuid;
begin
  select person_ref into v_person_ref from public.current_identity();
  if v_person_ref is null then
    return;
  end if;
  return query select * from work.my_conversations(v_person_ref);
end;
$$;

comment on function work.my_conversations_for_caller() is
  'Every conversation the calling person actively participates in, resolved from public.current_identity() — never a caller-supplied person_ref. A session with no real identity gets an empty result, not an error, matching this schema''s own "fail toward nothing shown" idiom for a read. Return shape extended alongside work.my_conversations() itself (WP 2.6 client cutover).';

create or replace function api.my_conversations()
returns table (
  id uuid, engagement_id uuid, asset_id uuid, maintenance_obligation_id uuid, property_id uuid,
  workspace_id uuid, closed_at timestamptz, created_at timestamptz,
  service_id uuid, request_id uuid, counterpart_workspace_id uuid, last_read_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.my_conversations_for_caller();
$$;

comment on function api.my_conversations() is
  'The Conversation engine''s client-facing delegate for the caller''s own conversations (WP 2.6). Delegates entirely to work.my_conversations_for_caller(), which holds all the logic. Return shape extended (WP 2.6 client cutover) with service_id/request_id/counterpart_workspace_id/last_read_at.';

-- =========================================================================
-- 2 · work.resolve_conversation_counterpart_auth_ids() / api.* delegate — new

create or replace function work.resolve_conversation_counterpart_auth_ids(p_workspace_ids uuid[])
returns table (workspace_id uuid, auth_user_id uuid)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_person_ref uuid;
begin
  select person_ref into v_person_ref from public.current_identity();
  if v_person_ref is null then
    return;
  end if;

  return query
  select distinct cp_other.workspace_id, i.auth_user_id
  from work.conversation_participants cp_mine
  join work.conversation_participants cp_other
    on cp_other.conversation_id = cp_mine.conversation_id
    and cp_other.workspace_id = any(p_workspace_ids)
    and cp_other.left_at is null
  join identity.identities i on i.person_ref = cp_other.person_ref
  where cp_mine.person_ref = v_person_ref
    and cp_mine.left_at is null
    and i.auth_user_id is not null
    and i.erased_at is null;
end;
$$;

comment on function work.resolve_conversation_counterpart_auth_ids(uuid[]) is
  'For a batch of workspace ids, the real auth_user_id behind each — ONLY for a workspace that is a real, active co-participant of some conversation the calling person (public.current_identity(), never caller-supplied) is also a real, active participant of. Deliberately narrower than workspace.resolve_owner_auth_user_ids() (0151, type = ''professional'' only): this gate is "already paired on a private thread together," which correctly covers a customer''s personal workspace too, something 0151 must never resolve. Composes with the already-existing public.resolve_identity_display() (0028) for the actual name/avatar — this function''s only job is the workspace_id -> auth_user_id hop, gated correctly.';

create or replace function api.resolve_conversation_counterpart_auth_ids(p_workspace_ids uuid[])
returns table (workspace_id uuid, auth_user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.resolve_conversation_counterpart_auth_ids(p_workspace_ids);
$$;

comment on function api.resolve_conversation_counterpart_auth_ids(uuid[]) is
  'Delegate for work.resolve_conversation_counterpart_auth_ids() (WP 2.6 client cutover). The client''s bridge from a conversation''s counterpart_workspace_id (api.my_conversations()) to a real, displayable identity — pair with public.resolve_identity_display() for name/avatar.';

-- =========================================================================
-- 3 · work.conversation_messages() / work.conversation_messages_for_caller() /
-- api.conversation_messages() — gain sender_auth_user_id. DROP FIRST: the return type is
-- changing (9 columns -> 10).

drop function if exists work.conversation_messages(uuid);
drop function if exists work.conversation_messages_for_caller(uuid);
drop function if exists api.conversation_messages(uuid);

create or replace function work.conversation_messages(p_conversation_id uuid)
returns table (
  id uuid, sender_person_ref uuid, sender_workspace_id uuid, sender_auth_user_id uuid,
  body text, original_locale text, translations jsonb, reference_type text, reference_id uuid,
  created_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select m.id, m.sender_person_ref, m.sender_workspace_id, i.auth_user_id,
    m.body, m.original_locale, m.translations, m.reference_type, m.reference_id, m.created_at
  from work.messages m
  left join identity.identities i on i.person_ref = m.sender_person_ref and i.erased_at is null
  where m.conversation_id = p_conversation_id
  order by m.created_at, m.id;
$$;

comment on function work.conversation_messages(uuid) is
  'Extended (WP 2.6 client cutover) with sender_auth_user_id — every consumer of this read (ConversationSheet.jsx''s own "is this my bubble" check, conversationSelectors.js''s own messagesNeedingTranslation()) compares against the real auth id every call site already threads through, not the internal person_ref this function returned alone before. A plain join, not a new gate: see this migration''s own header for why the existing membership check already covers it. An erased sender resolves to a null sender_auth_user_id, matching this schema''s own "reference survives, display does not" idiom.';

create or replace function work.conversation_messages_for_caller(p_conversation_id uuid)
returns table (
  id uuid, sender_person_ref uuid, sender_workspace_id uuid, sender_auth_user_id uuid,
  body text, original_locale text, translations jsonb, reference_type text, reference_id uuid,
  created_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select m.id, m.sender_person_ref, m.sender_workspace_id, i.auth_user_id,
    m.body, m.original_locale, m.translations, m.reference_type, m.reference_id, m.created_at
  from work.messages m
  left join identity.identities i on i.person_ref = m.sender_person_ref and i.erased_at is null
  where m.conversation_id = p_conversation_id
    and m.conversation_id in (
      select cp.conversation_id from work.conversation_participants cp
      where cp.person_ref in (select person_ref from public.current_identity())
        and cp.left_at is null
    )
  order by m.created_at, m.id;
$$;

comment on function work.conversation_messages_for_caller(uuid) is
  'Every message in a conversation, for a caller who is a real, active participant of it — 0094''s own isolation predicate, ported rather than re-derived (unchanged from 0147). Return shape extended (WP 2.6 client cutover) with sender_auth_user_id.';

create or replace function api.conversation_messages(p_conversation_id uuid)
returns table (
  id uuid, sender_person_ref uuid, sender_workspace_id uuid, sender_auth_user_id uuid,
  body text, original_locale text, translations jsonb, reference_type text, reference_id uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.conversation_messages_for_caller(p_conversation_id);
$$;

comment on function api.conversation_messages(uuid) is
  'The Conversation engine''s client-facing delegate for one conversation''s messages (WP 2.6). Delegates entirely to work.conversation_messages_for_caller(), which holds all the logic. Return shape extended (WP 2.6 client cutover) with sender_auth_user_id.';

-- =========================================================================
-- ACCESS

revoke all on function work.my_conversations(uuid) from public, anon, authenticated, service_role;
revoke all on function work.my_conversations_for_caller() from public, anon, authenticated, service_role;
revoke all on function work.resolve_conversation_counterpart_auth_ids(uuid[]) from public, anon, authenticated, service_role;
revoke all on function work.conversation_messages(uuid) from public, anon, authenticated, service_role;
revoke all on function work.conversation_messages_for_caller(uuid) from public, anon, authenticated, service_role;

revoke all on function api.my_conversations() from public, anon, service_role;
revoke all on function api.resolve_conversation_counterpart_auth_ids(uuid[]) from public, anon, service_role;
revoke all on function api.conversation_messages(uuid) from public, anon, service_role;

grant execute on function api.my_conversations() to authenticated;
grant execute on function api.resolve_conversation_counterpart_auth_ids(uuid[]) to authenticated;
grant execute on function api.conversation_messages(uuid) to authenticated;
