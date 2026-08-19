-- Epic 13 WP02 — Conversation Participants: an explicit, managed roster, not workspace
-- membership.
--
-- THIS TABLE IS THE SECOND-LARGEST CORRECTION DESIGN_REVIEW.md MAKES
--
-- §20: "Isolation. Participants see the thread and exactly the context their grant
-- allows — not each other's workspaces." §8.5 names ParticipantAdded/ParticipantRemoved
-- as real produced events and "managing participation across workspace boundaries" as
-- its own explicit responsibility. Reusing work.engagements' own "both parties
-- denormalised, visible via direct workspace membership" isolation shape here would
-- over-grant: it would let any member of either workspace read a thread only the
-- specific people on it should see, not merely the two firms doing business together.
-- Participation is therefore its own roster, keyed by person (identity.identities.
-- person_ref, no foreign key — the same durable, erasure-surviving reference every
-- other person-keyed table in this schema already uses), not derived from
-- workspace.memberships at read time.
--
-- ONE ROW PER (conversation, person) — REJOINING UPDATES THE SAME ROW
--
-- Unlike workspace.memberships (which permits a second row for a genuine re-join, since
-- membership history matters permanently), a conversation re-join has no comparable
-- stakes yet and no real caller to design against — a unique constraint keeps this
-- simple; work.add_participant() (WP 13.06) un-sets left_at on conflict rather than
-- inserting a second row.
--
-- last_read_at IS HERE, NOT ON work.messages — THE THIRD CORRECTION
--
-- Legacy messages.read_at is a single column because exactly two participants ever
-- exist. Participation is no longer fixed at two (§15: "additional channels reaching
-- the same thread"), so "read" must be a fact about a (conversation, person) pair, not
-- about a message row shared by however many readers there turn out to be.

create table if not exists work.conversation_participants (
  id               uuid        not null,

  conversation_id  uuid        not null
                   references work.conversations (id),
  person_ref       uuid        not null,
  workspace_id     uuid        not null
                   references workspace.workspaces (id),

  joined_at        timestamptz not null default now(),
  left_at          timestamptz null,
  last_read_at     timestamptz null,

  constraint conversation_participants_pkey primary key (id),
  constraint conversation_participants_unique unique (conversation_id, person_ref)
);

comment on table work.conversation_participants is
  'The explicit, managed roster (§8.5) a conversation''s visibility actually depends on — not workspace membership. person_ref carries no foreign key, matching identity.identities'' own durable-reference pattern (SUPABASE_ARCHITECTURE.md §5): a participant''s row survives their identity''s erasure, the same way a workflow transition''s actor_ref does.';
comment on column work.conversation_participants.workspace_id is
  'Which workspace this person represents in this thread — denormalised for isolation-policy convenience, the same reasoning work.engagements denormalises both its own parties directly.';
comment on column work.conversation_participants.left_at is
  'Set once a participant is removed (or leaves). A left participant loses visibility going forward — see WP 13.04''s own isolation policy, which checks left_at is null.';

create index if not exists conversation_participants_conversation_idx
  on work.conversation_participants (conversation_id);
create index if not exists conversation_participants_person_idx
  on work.conversation_participants (person_ref) where left_at is null;

-- =========================================================================
-- MUTABILITY AND ACCESS — ordinary Transactional data (§4): left_at and last_read_at
-- mutate in place, via the contract function (WP 13.06). No delete — a participant's own
-- historical presence in a thread is never erased, only ended.

grant update on work.conversation_participants to klussie_engine_work;
revoke all on work.conversation_participants from anon, authenticated, service_role;

alter table work.conversation_participants enable row level security;

-- No policy yet — WP 13.04's own job.
