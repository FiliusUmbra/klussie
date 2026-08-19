-- Epic 16 WP03 — the workspace graph's asserted edges: `knowledge.workspace_edges`.
--
-- DATABASE_ARCHITECTURE.md §27's own two-tier table: "Workspace graph — asserted edges |
-- Relationships a human stated that no aggregate implies... | **Aggregate**." The derived
-- half of the same tier ("Relationships implied by aggregates... | *Projection*") is
-- deliberately not built here — see this migration's own closing note.
--
-- NO NODE TABLE — WORKSPACE-SIDE NODES ARE ALREADY REAL AGGREGATES ELSEWHERE
--
-- PLATFORM_DOMAIN_MODEL.md §19.2's own node table lists "Workspaces · Properties ·
-- Locations · Assets · Documents · Service Records · Maintenance · Providers ·
-- Technicians · Memberships · Workspace Knowledge" as what the workspace side of the graph
-- connects — every one of those already has a real id in a real table this platform owns.
-- An edge is a plain (type, id) pair referencing them directly; duplicating their
-- existence in a second "node registry" here would be exactly the second copy Principle 9
-- and DATABASE_ARCHITECTURE.md §28 (the Digital Twin's own reasoning) both rule out. This
-- is the opposite situation from the world graph (WP 16.04), whose nodes — manufacturers,
-- models, parts — have no platform aggregate of their own and genuinely need one.
--
-- EDGE_TYPE IS OPEN TEXT, NOT A CLOSED ENUM — THE SAME RESTRAINT knowledge.rules.category
-- HOLDS
--
-- §19.2's own list — "installed by · supplied by · manufactured by · serviced by ·
-- governed by · certified for · compatible with · replaced · adjacent to · depends on ·
-- failed similarly to · preferred for · excluded from" — is thirteen relationship kinds
-- named as illustration of "the edges are the substance," not a closed vocabulary this
-- migration would have to enumerate and maintain.
--
-- ASSERTED ONLY — from_type/to_type ARE UNCONSTRAINED TEXT, DELIBERATELY, NOT A FOREIGN
-- KEY PER NODE KIND
--
-- A real foreign key per node kind (the way property.document_attachments uses four real
-- columns, Epic 08) would need one column per node kind in §19.2's own list — a dozen or
-- more, most nullable, for a graph whose entire point is that any two kinds may connect.
-- Referential integrity here is the caller's own responsibility (the same posture
-- platform.events.subject_type/subject_id already holds, ADR-0019), not the database's,
-- because the alternative does not scale with the vocabulary this table exists to stay
-- open to.
--
-- RETRACTION, NOT DELETION — "PERMANENT, VERSIONED" PER §27'S OWN RETENTION RULE
--
-- "Asserted edges and world graph: permanent, versioned." A human who asserted a fact and
-- later finds it wrong retracts it (retracted_at set, one-way) rather than erasing the
-- record that it was ever asserted — the same reasoning work.conversations.closed_at and
-- every other one-exception-column guard in this codebase already holds.
--
-- DERIVED WORKSPACE-GRAPH EDGES ARE NOT BUILT IN THIS EPIC
--
-- §27's own classification: derived edges are a *Projection*, "may be rebuilt at will."
-- Deriving them means walking every engine's own foreign keys (asset -> location ->
-- property, service_record -> asset, document_attachments -> asset/location/property,
-- and more) into a materialised or on-demand traversal — real, substantial work with no
-- real caller yet (nothing in this platform queries the graph today). Named here as a
-- deliberate scope boundary, the same restraint Epic 15 held for document resolution: the
-- structure this epic builds (asserted edges, real and queryable today) is not weakened by
-- deferring the projection half until something needs to read it.

create table if not exists knowledge.workspace_edges (
  id               uuid        not null,

  workspace_id     uuid        not null
                   references workspace.workspaces (id),

  from_type        text        not null,
  from_id          uuid        not null,
  edge_type        text        not null,
  to_type          text        not null,
  to_id            uuid        not null,

  -- No FK — matches work.messages.sender_person_ref's own durable-reference pattern
  -- (Epic 13): a person who asserted a fact and is later erased must not cascade the
  -- assertion away with them.
  asserted_by_ref  uuid        null,
  asserted_at      timestamptz not null default now(),
  retracted_at     timestamptz null,

  constraint workspace_edges_pkey primary key (id),
  constraint workspace_edges_not_self_referencing
    check (from_type <> to_type or from_id <> to_id)
);

comment on table knowledge.workspace_edges is
  'The workspace graph''s asserted edges (DATABASE_ARCHITECTURE.md §27) — relationships a human stated that no other aggregate implies. Aggregate, permanent, versioned by retraction rather than deletion. from_type/to_type reference real aggregates elsewhere in this platform by (type, id), unconstrained by foreign key — see this migration''s own header for why.';
comment on column knowledge.workspace_edges.edge_type is
  'Open text — §19.2''s own thirteen-item list ("installed by", "compatible with", ...) is illustrative, not closed.';
comment on column knowledge.workspace_edges.retracted_at is
  'Set once, never cleared — a retracted assertion stays on the record as a fact about what the platform once believed, the same reasoning work.conversations.closed_at already holds.';

create index if not exists workspace_edges_workspace_idx
  on knowledge.workspace_edges (workspace_id);
create index if not exists workspace_edges_from_idx
  on knowledge.workspace_edges (workspace_id, from_type, from_id) where retracted_at is null;
create index if not exists workspace_edges_to_idx
  on knowledge.workspace_edges (workspace_id, to_type, to_id) where retracted_at is null;

-- =========================================================================
-- IMMUTABILITY — every column frozen except retracted_at (null -> set, one-way)

create or replace function knowledge.workspace_edges_guard_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'knowledge.workspace_edges rows are never deleted'
      using
        hint = 'A wrong assertion is retracted, never removed — the record of having believed it stays.',
        errcode = 'restrict_violation';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.workspace_id is distinct from old.workspace_id
       or new.from_type is distinct from old.from_type
       or new.from_id is distinct from old.from_id
       or new.edge_type is distinct from old.edge_type
       or new.to_type is distinct from old.to_type
       or new.to_id is distinct from old.to_id
       or new.asserted_by_ref is distinct from old.asserted_by_ref
       or new.asserted_at is distinct from old.asserted_at
    then
      raise exception
        'knowledge.workspace_edges is immutable except retracted_at'
        using errcode = 'restrict_violation';
    end if;

    if old.retracted_at is not null and new.retracted_at is distinct from old.retracted_at then
      raise exception
        'knowledge.workspace_edges: retracted_at may move from null to set only, never back'
        using errcode = 'restrict_violation';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

comment on function knowledge.workspace_edges_guard_mutation() is
  'Immutability guard for knowledge.workspace_edges — the same one-exception-column shape as work.conversations_guard_mutation() (Epic 13).';

drop trigger if exists workspace_edges_guard_mutation on knowledge.workspace_edges;
create trigger workspace_edges_guard_mutation
  before update or delete on knowledge.workspace_edges
  for each row execute function knowledge.workspace_edges_guard_mutation();

-- =========================================================================
-- MUTABILITY AND ACCESS

grant update on knowledge.workspace_edges to klussie_engine_knowledge;
revoke all on knowledge.workspace_edges from anon, authenticated, service_role;

alter table knowledge.workspace_edges enable row level security;
-- No policy yet — WP 16.05's own job.
