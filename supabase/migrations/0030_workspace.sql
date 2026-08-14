-- Epic 03 WP01 — the workspace and membership tables, empty.
--
-- PLATFORM_DOMAIN_MODEL.md §2's founding constraint: "A person has exactly one identity.
-- A person may act within many workspaces." This is the pivot of the whole roadmap
-- (IMPLEMENTATION_ROADMAP.md §10, Epic 03) and this migration is step 1 of the six-step
-- migration pattern (roadmap §3): structure only, nothing reads or writes it, the
-- application is entirely unaffected.
--
-- Three tables, not two, because DATABASE_ARCHITECTURE.md §10 gives membership two halves
-- that are structurally different: "Append-only history + mutable current." §4's
-- Mutability Classes table lists "membership history" under Append-only by name, and
-- "workspace (archival)" under Soft-retire. Three classes, three tables:
--
--   workspace.workspaces         Soft-retire  — archived, never deleted (§9)
--   workspace.memberships        Mutable      — role, scope and state change in place (§10)
--   workspace.membership_history Append-only  — every change, permanently (§10, §4)
--
-- WHAT THIS TABLE SET DELIBERATELY DOES NOT DO
--
-- No backfill (WP 03.03, WP 03.04). No RLS policy beyond "enabled, no grant" — the
-- membership helper that answers "who may read this" is WP 03.02, and writing a policy
-- before the helper exists would be a policy nobody can satisfy. No population of
-- membership_history — nothing writes to `memberships` yet, so there is nothing to
-- record, and the mechanism that keeps the two in step is a decision for whichever
-- package first writes here (WP 03.03 or WP 03.08), not this one.
--
-- No owner_id column on workspace.workspaces. DATABASE_ARCHITECTURE.md §9: "Owned by its
-- owner-role members" — plural, and expressed entirely through a membership row with
-- role = 'owner'. A second, column-based notion of ownership would be two answers to the
-- same question, which is exactly what PLATFORM_DOMAIN_MODEL.md Rule 11 (one permission
-- path) rules out.

-- =========================================================================
-- WORKSPACE

create table if not exists workspace.workspaces (
  -- Application-generated UUIDv7, no default — the same reasoning as
  -- identity.identities.person_ref (migration 0025): an engine must know an aggregate's
  -- identity before it writes, so it can emit an event referencing it in the same
  -- transaction (SUPABASE_ARCHITECTURE.md §3). A database default would produce a v4 in
  -- the database, contradicting both halves of that rule.
  id            uuid        not null,

  -- PLATFORM_DOMAIN_MODEL.md §5, §9: "Type is mutable and carries no behaviour" —
  -- Principle 13. Real column, no attached logic; changing it changes a label and,
  -- optionally, offers a preset. Never branch on it (roadmap §4 rule 6).
  type          text        not null check (type in ('personal','professional','business')),

  -- "A name and a visual identity, chosen by its members" (§5). Nullable because nothing
  -- populates it until the backfill packages name each workspace after its owner.
  name          text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Soft-retire (§4): "archived, never deleted." Null means active. No partition-worthy
  -- volume yet and no query needing a partial index — matching identity.identities'
  -- own restraint (migration 0025: "there is no query yet"), a partial index over live
  -- rows arrives with the epic that has one.
  archived_at   timestamptz,

  constraint workspaces_pkey primary key (id)
);

comment on table workspace.workspaces is
  'The workspace aggregate — the tenancy, permission, billing, AI-context, marketplace and jurisdiction boundary (PLATFORM_DOMAIN_MODEL.md §5). Archived, never deleted. Inert until Epic 03''s backfill and read-switch packages.';
comment on column workspace.workspaces.id is
  'UUIDv7, application-generated (SUPABASE_ARCHITECTURE.md §3). Permanent; never reused.';
comment on column workspace.workspaces.type is
  'Personal, Professional or Business (§5, §7). Mutable, and carries no behaviour of its own (Principle 13) — nothing may branch on it (roadmap §4 rule 6).';
comment on column workspace.workspaces.archived_at is
  'When this workspace was archived. Null means active. A workspace is archived, never deleted (§9) — history that other workspaces legitimately reference must survive it.';

-- =========================================================================
-- MEMBERSHIP — the mutable current state

create table if not exists workspace.memberships (
  id            uuid        not null,

  workspace_id  uuid        not null
                references workspace.workspaces (id),

  -- No foreign key to identity.identities, on purpose. SUPABASE_ARCHITECTURE.md §5's
  -- referential-integrity table names this exact case: "Durable records → identity | The
  -- person reference must survive erasure of the identity row… A foreign key would make
  -- erasure impossible or cascade destruction into history." A membership is exactly such
  -- a durable record — DATABASE_ARCHITECTURE.md §10 requires it permanent even after the
  -- person who held it is erased.
  person_ref    uuid        not null,

  -- PLATFORM_DOMAIN_MODEL.md §7's permission grammar is identical across workspace types;
  -- only the role names differ per type, and future custom roles for enterprises (§7 "how
  -- it evolves") mean the vocabulary is not closed. No check constraint enumerating role
  -- names, for the same reason identity.identities.locale gets one and this does not: the
  -- list there is closed (ISO locales); this one is not.
  role          text        not null,

  -- The optional scope §7 describes — "typically a subtree of locations or a set of
  -- properties." No location tree exists until Epic 06 (SUPABASE_ARCHITECTURE.md §11.2),
  -- and no consumer workspace uses scope at all. jsonb rather than a typed column:
  -- committing to a shape before the Location engine defines one would be guessing, and
  -- ADR-0026 already describes this column as "the scope recorded on the membership" —
  -- inert until Epic 06 gives it a real shape to hold.
  scope         jsonb,

  -- The four states PLATFORM_DOMAIN_MODEL.md §7 names, verbatim.
  state         text        not null default 'active'
                check (state in ('invited','active','suspended','ended')),

  -- "Simply unset for permanent ones" (§8). Evaluated at read time by whatever consults
  -- it, never by a cleanup job (SUPABASE_ARCHITECTURE.md §8) — that rule belongs to the
  -- membership helper (WP 03.02), not to this table.
  expires_at    timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint memberships_pkey primary key (id)

  -- No uniqueness constraint on (person_ref, workspace_id). A person may hold a second
  -- membership in a workspace they previously left — DATABASE_ARCHITECTURE.md §10 requires
  -- the ended one retained as history, not replaced. Deciding how re-joining works is a
  -- business rule for whichever engine implements invitations, not a structural constraint
  -- here (SUPABASE_ARCHITECTURE.md §4's distinguishing test: this refuses nothing, so it is
  -- not this migration's to add).
);

comment on table workspace.memberships is
  'The link between an identity and a workspace — the only place access is decided (PLATFORM_DOMAIN_MODEL.md §7). Mutable: role, scope and state change in place. Rows are never deleted, only transitioned to state = ''ended'' (DATABASE_ARCHITECTURE.md §10) — the append-only record of each transition is workspace.membership_history.';
comment on column workspace.memberships.person_ref is
  'The identity holding this membership. No foreign key to identity.identities — see SUPABASE_ARCHITECTURE.md §5''s referential-integrity table. Survives the referenced identity''s erasure.';
comment on column workspace.memberships.scope is
  'A subtree of locations or a set of properties this membership is narrowed to (§7). Inert until Epic 06''s Location engine defines a real shape; nothing resolves it yet (ADR-0026).';
comment on column workspace.memberships.state is
  'invited, active, suspended or ended (§7), verbatim. An ended membership is retained, never deleted.';

-- Both directions are hot (SUPABASE_ARCHITECTURE.md §10: "By identity, and by workspace —
-- both directions are hot"), and this is the table WP 03.02's membership helper queries on
-- every statement. Plain, not partial: the state filter belongs in the helper's query, and
-- at this aggregate's stated scale (10–5,000 rows per workspace, §10) a plain index is
-- correct without guessing at a predicate no query has been written against yet.
create index if not exists memberships_person_ref_idx
  on workspace.memberships (person_ref);
create index if not exists memberships_workspace_id_idx
  on workspace.memberships (workspace_id);

-- =========================================================================
-- MEMBERSHIP HISTORY — append-only, forever

create table if not exists workspace.membership_history (
  id            uuid        not null,

  membership_id uuid        not null
                references workspace.memberships (id),

  -- Carried directly rather than derived by joining through membership_id.
  -- DATABASE_ARCHITECTURE.md §5's tenancy rule: "Every record carries the workspace it
  -- belongs to… not an attribute that a query may forget to filter on" — a history row is
  -- no exception, and §10 names "by workspace" as one of the two hot read directions.
  workspace_id  uuid        not null
                references workspace.workspaces (id),

  -- No foreign key, for the identical reason as workspace.memberships.person_ref above.
  person_ref    uuid        not null,

  role          text        not null,
  scope         jsonb,
  state         text        not null check (state in ('invited','active','suspended','ended')),
  expires_at    timestamptz,

  -- When this state became true, not when the row was inserted — the two coincide today
  -- because nothing populates this table yet, but the column is named for what it means.
  changed_at    timestamptz not null default now(),

  constraint membership_history_pkey primary key (id)
);

comment on table workspace.membership_history is
  'Every change to a membership, permanently (DATABASE_ARCHITECTURE.md §10, §4). Append-only — "who had access to what, when" is an audit question asked years later. Nothing writes here yet; the mechanism that keeps this in step with workspace.memberships is decided by whichever package first writes to that table.';

create index if not exists membership_history_membership_id_idx
  on workspace.membership_history (membership_id, changed_at);
create index if not exists membership_history_person_ref_idx
  on workspace.membership_history (person_ref, changed_at);

-- Append-only, enforced the same way as platform.audit_records (migration 0022): withheld
-- privileges below, plus a guard trigger here — they fail differently, and a table
-- recording "who had access to what, when" is exactly the one where a quiet correction
-- would be worst.
create or replace function workspace.membership_history_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'workspace.membership_history is append-only: % rejected', tg_op
    using
      hint = 'The history is permanent. A correction is a new row describing the correction.',
      errcode = 'restrict_violation';
end;
$$;

comment on function workspace.membership_history_reject_mutation() is
  'Immutability guard for workspace.membership_history. An integrity constraint, not a business rule (SUPABASE_ARCHITECTURE.md §4): it refuses an impossibility rather than making a decision.';

drop trigger if exists membership_history_append_only on workspace.membership_history;
create trigger membership_history_append_only
  before update or delete on workspace.membership_history
  for each row execute function workspace.membership_history_reject_mutation();

-- =========================================================================
-- MUTABILITY AND ACCESS
--
-- 0019's default privileges already grant klussie_engine_workspace SELECT and INSERT on
-- every table created here — that is the fail-safe append-only default (ROLES.md §3 rule
-- 2). Two of these three tables need more than the default; the third does not.

-- workspace.workspaces and workspace.memberships are Mutable (§4): attributes change in
-- place. UPDATE is granted explicitly, naming the class, exactly as identity.identities
-- did in migration 0025.
grant update on workspace.workspaces to klussie_engine_workspace;
grant update on workspace.memberships to klussie_engine_workspace;

-- DELETE is withheld from every table here, and that is the point rather than an
-- oversight — the same reasoning as identity.identities (migration 0025): a workspace is
-- archived, not deleted; a membership is ended, not removed; history is never edited.
-- No role is given the ability to remove a row from any of the three.

-- workspace.membership_history is Append-only: the default SELECT+INSERT is already
-- correct and complete. Nothing to grant beyond it.

-- RLS on every table without exception (SUPABASE_ARCHITECTURE.md §24 item 5). No policies
-- yet: the membership helper that would let a policy answer "who may read this row" is
-- WP 03.02, one migration away. Until then the absent policy is the deny — the same
-- posture identity.identities held between WP 02.01 and WP 02.06.
alter table workspace.workspaces enable row level security;
alter table workspace.memberships enable row level security;
alter table workspace.membership_history enable row level security;

-- Explicit, for the same reason as everywhere in this platform: an absence of grants is
-- indistinguishable from an oversight.
revoke all on workspace.workspaces from anon, authenticated, service_role;
revoke all on workspace.memberships from anon, authenticated, service_role;
revoke all on workspace.membership_history from anon, authenticated, service_role;
