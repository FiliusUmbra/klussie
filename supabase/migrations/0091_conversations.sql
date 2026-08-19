-- Epic 13 WP01 — the Conversation aggregate: bound to exactly one of the five real
-- subjects DATABASE_ARCHITECTURE.md §20 / PLATFORM_DOMAIN_MODEL.md §15 name.
--
-- READ BEFORE DESIGN — SEE implementation/epic-13/DESIGN_REVIEW.md IN FULL
--
-- Reviewed against every completed engine (Epics 03-12) before this migration was
-- written, per an explicit request to do so before implementation. The single largest
-- correction: §15 names the subject as "a marketplace engagement," not a request.
-- Legacy public.conversations binds to request_id because no engagement existed as a
-- real row until Epic 12 — it now does, and this table binds to it directly.
-- Location and Service Record are both real, plausible connections neither §15 nor §20
-- names as a subject; neither is added here — see DESIGN_REVIEW.md §4 items 6.
--
-- FIVE SUBJECT COLUMNS, EXACTLY ONE REQUIRED — THE SAME IDIOM SINCE EPIC 08
--
-- property.document_attachments (Epic 08) established four nullable subject columns
-- with `num_nonnulls(...) = 1`. This table needs a fifth, matching §15's own list
-- exactly: engagement, asset, maintenance obligation (interpreted as work.
-- maintenance_obligations — see DESIGN_REVIEW.md §2's own stated reasoning), property,
-- or the workspace itself.
--
-- IMMUTABLE EXCEPT closed_at — THE SAME ONE-EXCEPTION-COLUMN GUARD AS
-- work.service_records/work.workflow_definitions
--
-- Nothing in §20 says a conversation's subject binding ever changes, and §8.5 names
-- ConversationClosed as a real produced event — a one-way transition, the same shape
-- work.service_records.customer_approved (Epic 11) already uses.

create table if not exists work.conversations (
  id                          uuid        not null,

  engagement_id               uuid        null
                              references work.engagements (id),
  asset_id                    uuid        null
                              references property.assets (id),
  maintenance_obligation_id   uuid        null
                              references work.maintenance_obligations (id),
  property_id                 uuid        null
                              references property.properties (id),
  workspace_id                uuid        null
                              references workspace.workspaces (id),

  closed_at                   timestamptz null,

  -- Bookkeeping only — the legacy public.conversations row this was backfilled from, if
  -- any. Never returned by the contract (WP 13.06).
  legacy_conversation_id      uuid        null,

  created_at                  timestamptz not null default now(),

  constraint conversations_pkey primary key (id),
  constraint conversations_exactly_one_subject
    check (num_nonnulls(engagement_id, asset_id, maintenance_obligation_id, property_id, workspace_id) = 1)
);

comment on table work.conversations is
  'Communication bound to a subject (§20) — exactly one of the five §15 names. engagement_id is the corrected binding DESIGN_REVIEW.md §2/§4 identifies; legacy bound to a request instead, because no engagement existed as a real row before Epic 12.';
comment on column work.conversations.maintenance_obligation_id is
  'Interpreted as work.maintenance_obligations (Epic 10), not a Service Record — see DESIGN_REVIEW.md §2''s own stated reasoning for why, since both terms exist distinctly in the same source chapter.';
comment on column work.conversations.closed_at is
  'The one column this table permits changing after creation — set once, never reset. Mirrors work.service_records.customer_approved''s own one-way-only guard (Epic 11).';

create index if not exists conversations_engagement_idx
  on work.conversations (engagement_id) where engagement_id is not null;
create index if not exists conversations_legacy_idx
  on work.conversations (legacy_conversation_id) where legacy_conversation_id is not null;

-- =========================================================================
-- IMMUTABILITY

create or replace function work.conversations_guard_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'work.conversations rows are never deleted'
      using
        hint = 'Messages within a subject are retained with it (§20) — a conversation is never removed.',
        errcode = 'restrict_violation';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.engagement_id is distinct from old.engagement_id
       or new.asset_id is distinct from old.asset_id
       or new.maintenance_obligation_id is distinct from old.maintenance_obligation_id
       or new.property_id is distinct from old.property_id
       or new.workspace_id is distinct from old.workspace_id
       or new.created_at is distinct from old.created_at
    then
      raise exception
        'work.conversations is immutable except closed_at'
        using errcode = 'restrict_violation';
    end if;

    if old.closed_at is not null and new.closed_at is null then
      raise exception
        'work.conversations: closed_at may move from null to set only, never back'
        using errcode = 'restrict_violation';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

comment on function work.conversations_guard_mutation() is
  'Identical in shape to work.service_records_guard_mutation() (migration 0081) — every column frozen except one named exception, one-way only.';

drop trigger if exists conversations_guard_mutation on work.conversations;
create trigger conversations_guard_mutation
  before update or delete on work.conversations
  for each row execute function work.conversations_guard_mutation();

-- =========================================================================
-- MUTABILITY AND ACCESS

grant update on work.conversations to klussie_engine_work;
revoke all on work.conversations from anon, authenticated, service_role;

alter table work.conversations enable row level security;

-- No policy yet — WP 13.04's own job, once participants exist to isolate against.
