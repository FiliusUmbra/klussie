-- Epic 13 WP03 — Messages: immutable originals, derived translations, optional
-- structured-moment references.
--
-- §20: "Messages are immutable. The original text and its original language are
-- permanent. Translations are derived — a rendering of the original, cached,
-- rebuildable, and never a substitute for it." The same one-exception-column guard
-- work.conversations (0091) and work.service_records (Epic 11) already use — every
-- column frozen except translations, which is populated lazily after the fact.
--
-- TRANSLATIONS STAY A jsonb COLUMN, MATCHING LEGACY EXACTLY — SEE DESIGN_REVIEW.md §3
--
-- SYSTEM_ARCHITECTURE.md §8.5 lists Intelligence as a dependency for translation.
-- Intelligence (Epic 17) does not exist as a formal engine yet — this epic is sequenced
-- well before it. The current product already calls a real, working translation
-- mechanism directly (the AI Gateway's translate()) and caches results in
-- messages.translations, a jsonb column keyed by locale, populated lazily on first view
-- (migration 0009). This table reuses that exact mechanism rather than inventing an
-- Intelligence-shaped contract ahead of Epic 17 — the same restraint Epic 12 held
-- reusing public.categories/services rather than waiting for a taxonomy engine.
--
-- reference_type/reference_id — A STRUCTURED MOMENT, THE SAME POLYMORPHIC-SUBJECT SHAPE
-- platform.emit_event() ALREADY USES
--
-- §15: "structured moments inside a conversation (a quote, a schedule change, an
-- approval) that are both readable and machine-usable." A system message announcing
-- "Quote accepted" can point at the real work.quotes row that produced it — reusing
-- platform.emit_event()'s own p_subject_type/p_subject_id convention (migration 0023,
-- already reused by work.workflow_instances, Epic 09) rather than inventing a third
-- polymorphic-reference shape in this schema. Both columns nullable: most messages are
-- plain conversation, not a structured moment.
--
-- sender_workspace_id IS DENORMALISED, MATCHING work.conversation_participants' OWN
-- REASONING
--
-- Carried directly rather than resolved by joining through conversation_participants,
-- the same convenience work.workflow_transitions (0067) already takes for
-- definition_id.

create table if not exists work.messages (
  id                    uuid        not null,

  conversation_id       uuid        not null
                        references work.conversations (id),
  sender_person_ref     uuid        not null,
  sender_workspace_id   uuid        not null
                        references workspace.workspaces (id),

  body                  text        not null,
  original_locale       text        null,
  translations          jsonb       not null default '{}'::jsonb,

  reference_type        text        null,
  reference_id          uuid        null,

  -- Bookkeeping only — see 0091's own comment on the identical column there.
  legacy_message_id     uuid        null,

  created_at            timestamptz not null default now(),

  constraint messages_pkey primary key (id),
  constraint messages_reference_consistency
    check ((reference_type is null) = (reference_id is null))
);

comment on table work.messages is
  'Immutable originals, derived translations (§20). sender_person_ref carries no foreign key, matching work.conversation_participants'' own durable-reference pattern.';
comment on column work.messages.original_locale is
  '"Language is a first-class property, not a feature" (§15) — the message''s own real original language, not assumed. Nullable because legacy backfill (WP 13.05) has no recorded original language for existing rows.';
comment on column work.messages.reference_type is
  'A structured moment this message represents (§15) — ''quote'', ''engagement'', ''workflow_transition'', or similar, paired with reference_id. No foreign key: a polymorphic reference across engines this schema does not enumerate, the identical shape platform.emit_event()''s own subject pair already uses.';

create index if not exists messages_conversation_idx
  on work.messages (conversation_id, created_at);
create index if not exists messages_legacy_idx
  on work.messages (legacy_message_id) where legacy_message_id is not null;

-- =========================================================================
-- IMMUTABILITY — every column frozen except translations

create or replace function work.messages_guard_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'work.messages rows are never deleted'
      using
        hint = 'A message is permanent evidence (§20) — regretted messages persist by design.',
        errcode = 'restrict_violation';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.conversation_id is distinct from old.conversation_id
       or new.sender_person_ref is distinct from old.sender_person_ref
       or new.sender_workspace_id is distinct from old.sender_workspace_id
       or new.body is distinct from old.body
       or new.original_locale is distinct from old.original_locale
       or new.reference_type is distinct from old.reference_type
       or new.reference_id is distinct from old.reference_id
       or new.created_at is distinct from old.created_at
    then
      raise exception
        'work.messages is immutable except translations'
        using
          hint = 'The original text and language are permanent (§20) — a translation is the only derived rendering this row may ever gain.',
          errcode = 'restrict_violation';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

comment on function work.messages_guard_mutation() is
  'Identical in shape to work.conversations_guard_mutation() (migration 0091) and work.service_records_guard_mutation() (migration 0081) — every column frozen except one, here with no directional restriction (translations may be added or replaced, both real corrections a mistranslation might need), since a wrong cached rendering being fixed is not the same class of event as evidence being altered.';

drop trigger if exists messages_guard_mutation on work.messages;
create trigger messages_guard_mutation
  before update or delete on work.messages
  for each row execute function work.messages_guard_mutation();

-- =========================================================================
-- MUTABILITY AND ACCESS

grant update on work.messages to klussie_engine_work;
revoke all on work.messages from anon, authenticated, service_role;

alter table work.messages enable row level security;

-- No policy yet — WP 13.04's own job.
