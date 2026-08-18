-- Epic 13 WP05 — backfill: every real legacy conversation and message.
--
-- Step 2 of the migration pattern (roadmap §3). public.conversations/messages remain
-- fully authoritative; nothing here writes back to them.
--
-- EVERY LEGACY CONVERSATION ALREADY HAS A REAL ENGAGEMENT TO BIND TO
--
-- handle_quote_accepted() (migrations 0001/0012) creates a conversation ONLY at
-- acceptance ("on conflict (request_id) do nothing", fired inside the accepted-branch),
-- so every legacy conversation's request was, by construction, already booked — which
-- is exactly the condition work.engagements' own backfill (migration 0089) used to
-- decide which requests get an engagement. No legacy conversation should ever fail to
-- find one; the join below is exact, not a left join with a null fallback.
--
-- PARTICIPANTS ARE RESOLVED THE SAME WAY EVERY PRIOR BACKFILL RESOLVED A WORKSPACE FROM
-- A PROFILE ID
--
-- identity.identities i on i.auth_user_id = <profile id> — the exact chain migration
-- 0035 established and every backfill since has reused rather than re-derived.
--
-- translations CARRIES OVER DIRECTLY — IT IS ALREADY THE SAME jsonb SHAPE
--
-- public.messages.translations (migration 0009) and work.messages.translations (0093)
-- are the identical shape by design — see 0093's own header for why this epic reuses
-- the existing mechanism rather than inventing a new one.

-- =========================================================================
-- 1 · CONVERSATIONS

insert into work.conversations (id, engagement_id, legacy_conversation_id, created_at)
select
  platform.uuid_v7_at(c.created_at), e.id, c.id, c.created_at
from public.conversations c
join public.service_requests sr on sr.id = c.request_id
join work.requests wr on wr.service_request_id = sr.id
join work.engagements e on e.request_id = wr.id
where not exists (
  select 1 from work.conversations wc where wc.legacy_conversation_id = c.id
);

-- =========================================================================
-- 2 · PARTICIPANTS — one row for the customer, one for the pro, per conversation

insert into work.conversation_participants (id, conversation_id, person_ref, workspace_id, joined_at)
select
  platform.uuid_v7_at(c.created_at), wc.id, i.person_ref, e.requesting_workspace_id, c.created_at
from public.conversations c
join work.conversations wc on wc.legacy_conversation_id = c.id
join work.engagements e on e.id = wc.engagement_id
join identity.identities i on i.auth_user_id = c.customer_id
where not exists (
  select 1 from work.conversation_participants wcp
  where wcp.conversation_id = wc.id and wcp.person_ref = i.person_ref
);

insert into work.conversation_participants (id, conversation_id, person_ref, workspace_id, joined_at)
select
  platform.uuid_v7_at(c.created_at), wc.id, i.person_ref, e.performing_workspace_id, c.created_at
from public.conversations c
join work.conversations wc on wc.legacy_conversation_id = c.id
join work.engagements e on e.id = wc.engagement_id
join identity.identities i on i.auth_user_id = c.pro_id
where not exists (
  select 1 from work.conversation_participants wcp
  where wcp.conversation_id = wc.id and wcp.person_ref = i.person_ref
);

-- =========================================================================
-- 3 · MESSAGES — sender_workspace_id resolved by comparing the sender against the
-- legacy conversation's own customer_id/pro_id, since that is the only place "which
-- side sent this" is recorded today.

insert into work.messages (
  id, conversation_id, sender_person_ref, sender_workspace_id, body, translations,
  legacy_message_id, created_at
)
select
  platform.uuid_v7_at(m.created_at), wc.id, i.person_ref,
  case when m.sender_id = c.customer_id then e.requesting_workspace_id else e.performing_workspace_id end,
  m.body, coalesce(m.translations, '{}'::jsonb), m.id, m.created_at
from public.messages m
join public.conversations c on c.id = m.conversation_id
join work.conversations wc on wc.legacy_conversation_id = c.id
join work.engagements e on e.id = wc.engagement_id
join identity.identities i on i.auth_user_id = m.sender_id
where not exists (
  select 1 from work.messages wm where wm.legacy_message_id = m.id
);
