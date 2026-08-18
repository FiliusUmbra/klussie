-- Epic 16 WP02 — Workspace Knowledge: the aggregate `knowledge.rules`, the "declared,
-- binding policy" the roadmap's own one-liner names first.
--
-- PLATFORM_DOMAIN_MODEL.md §18.2: "How a workspace wants things done... Workspace
-- Knowledge is not a signal to be weighed. It is a constraint to be honoured." §3's own
-- classification: Workspace Knowledge is an **Aggregate** ("Declared and confirmed
-- rules") — the system of record, not a projection.
--
-- ONE TABLE, NOT EIGHT — CATEGORY IS AN OPEN TEXT COLUMN, NOT A TYPE HIERARCHY
--
-- §18.2's own table lists eight representative categories (provider preferences, brand
-- preferences, maintenance policy, financial rules, approval rules, access/timing, safety
-- procedures, communication) and says so explicitly: "Representative rather than
-- exhaustive." A rule per category would be eight near-identical tables predicting a list
-- the frozen document itself declines to close. `rule jsonb` carries the actual content —
-- the same restraint `work.service_records.content` already holds for job content that
-- varies by trade (Epic 11) — with `category` as a plain, open text discriminator a
-- client groups and filters by, not a closed enum this migration would have to guess the
-- membership of.
--
-- FOUR SCOPE LEVELS, MATCHING §18.2'S OWN LIST EXACTLY
--
-- "A rule may apply to the whole workspace, to one property, to a location subtree, or to
-- an asset class." `scope_type` names all four; `scope_id` is required for three of them
-- and forbidden for the fourth (workspace-wide has no narrower target). Resolving
-- precedence among them — "the more specific wins; where equally specific rules conflict,
-- the platform must surface the conflict rather than resolve it silently" — is
-- `knowledge.rules_in_force()`'s own job (WP 16.06), not this table's; this table only
-- stores what was declared, structurally validated to belong to exactly one real scope.
--
-- TWO ROUTES ONLY, NOT THREE — "OBSERVED BUT UNCONFIRMED" IS DELIBERATELY NOT STORED HERE
--
-- §18.2 names three origins: declared (authoritative immediately), inferred-and-confirmed
-- (authoritative only on acceptance), and observed-but-unconfirmed ("may inform a
-- recommendation... may never be enforced as policy"). The third is not policy by its own
-- definition — noticing a pattern is Intelligence's own job (Epic 17, not yet built), and
-- storing pattern candidates that can never become binding here would blur exactly the
-- line §18.2 draws between "what is acceptable here" and "what the platform merely
-- suspects." `origin` therefore has two values: `declared` (confirmed_at set at creation,
-- immediately binding) and `proposed` (confirmed_at null until a future confirm operation
-- sets it — the write path for THAT operation is a named, deliberate gap: nothing produces
-- proposals yet, so nothing calls it. Added when Epic 17 has a real pattern to propose,
-- the same restraint every "no live wiring yet" epic since 09 has held).
--
-- SUPERSESSION, NOT IN-PLACE EDITING — THE SAME REASON EVERY OTHER AGGREGATE IN THIS
-- CODEBASE PREFERS A NEW ROW TO A MUTATION
--
-- SYSTEM_ARCHITECTURE.md §9.1's own produced-event list names `KnowledgeRuleSuperseded`
-- alongside `KnowledgeRuleDeclared`/`KnowledgeRuleRetired` — updating a €300 budget
-- threshold to €500 is a new rule row, with the old one marked superseded and pointing at
-- its replacement, never an edited `rule` column. `status` is three-way (`active` /
-- `retired` / `superseded`) precisely because "ended with no replacement" and "replaced by
-- a newer rule" are different facts a reader needs to be able to tell apart.

create table if not exists knowledge.rules (
  id              uuid        not null,

  workspace_id    uuid        not null
                  references workspace.workspaces (id),

  category        text        not null,

  scope_type      text        not null
                  check (scope_type in ('workspace', 'property', 'location', 'asset_class')),
  -- uuid for property/location; asset_class scoping is a named, deliberate gap in
  -- knowledge.rules_in_force() (WP 16.06's own header) — an asset "class" has no stable
  -- id today (property.assets.type is a free-text column, not a versioned taxonomy), so
  -- this column stores it as-is for forward compatibility without a resolver built yet.
  scope_id        uuid        null,

  rule            jsonb       not null,

  origin          text        not null
                  check (origin in ('declared', 'proposed')),
  confirmed_at    timestamptz null,

  status          text        not null default 'active'
                  check (status in ('active', 'retired', 'superseded')),
  superseded_by   uuid        null
                  references knowledge.rules (id),
  retired_at      timestamptz null,

  created_at      timestamptz not null default now(),

  constraint rules_pkey primary key (id),
  constraint rules_scope_id_matches_type
    check ((scope_type = 'workspace') = (scope_id is null)),
  constraint rules_declared_confirmed_at_set
    check (origin <> 'declared' or confirmed_at is not null),
  constraint rules_status_consistency
    check (
      (status = 'active' and retired_at is null and superseded_by is null)
      or (status = 'retired' and retired_at is not null and superseded_by is null)
      or (status = 'superseded' and superseded_by is not null)
    )
);

comment on table knowledge.rules is
  'Workspace Knowledge (PLATFORM_DOMAIN_MODEL.md §18.2) — declared, binding policy. Aggregate, not a projection (§3): the system of record for what a workspace has stated is acceptable. Superseded/retired rows are permanent; nothing is ever deleted or edited in place.';
comment on column knowledge.rules.category is
  'Open text, not a closed enum — §18.2''s own eight-category table is explicitly "representative rather than exhaustive."';
comment on column knowledge.rules.scope_id is
  'Required iff scope_type <> ''workspace''. For asset_class, stores property.assets.type verbatim — see this migration''s own header for why resolution against it is a named gap, not built here.';
comment on column knowledge.rules.origin is
  '''declared'': the customer stated it, authoritative immediately. ''proposed'': awaiting confirmation, never binding until confirmed_at is set. ''Observed but unconfirmed'' (§18.2''s third route) is deliberately not a value here — it can never become policy by its own definition, and nothing produces it yet.';
comment on column knowledge.rules.superseded_by is
  'Points at the replacement rule when status = ''superseded'' — a €300 threshold becoming €500 is a new row, never an edited one, the same restraint every aggregate in this codebase holds.';

create index if not exists rules_workspace_category_idx
  on knowledge.rules (workspace_id, category, status);
create index if not exists rules_scope_idx
  on knowledge.rules (scope_type, scope_id) where scope_id is not null;

-- =========================================================================
-- IMMUTABILITY — every column frozen except confirmed_at (null -> set, one-way),
-- status/superseded_by/retired_at (active -> retired|superseded, one-way, never back)

create or replace function knowledge.rules_guard_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'knowledge.rules rows are never deleted'
      using
        hint = 'A rule that no longer applies is retired or superseded, never removed.',
        errcode = 'restrict_violation';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.workspace_id is distinct from old.workspace_id
       or new.category is distinct from old.category
       or new.scope_type is distinct from old.scope_type
       or new.scope_id is distinct from old.scope_id
       or new.rule is distinct from old.rule
       or new.origin is distinct from old.origin
       or new.created_at is distinct from old.created_at
    then
      raise exception
        'knowledge.rules is immutable except confirmed_at, status, superseded_by and retired_at'
        using errcode = 'restrict_violation';
    end if;

    if old.confirmed_at is not null and new.confirmed_at is distinct from old.confirmed_at then
      raise exception
        'knowledge.rules: confirmed_at may move from null to set only, never change once set'
        using errcode = 'restrict_violation';
    end if;

    if old.status <> 'active' and new.status is distinct from old.status then
      raise exception
        'knowledge.rules: status may leave ''active'' only once, never change again'
        using errcode = 'restrict_violation';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

comment on function knowledge.rules_guard_mutation() is
  'Immutability guard for knowledge.rules, the same one-exception-column shape as work.service_records_guard_mutation() (Epic 11) — here with three columns each one-way, not one.';

drop trigger if exists rules_guard_mutation on knowledge.rules;
create trigger rules_guard_mutation
  before update or delete on knowledge.rules
  for each row execute function knowledge.rules_guard_mutation();

-- =========================================================================
-- MUTABILITY AND ACCESS

grant update on knowledge.rules to klussie_engine_knowledge;
revoke all on knowledge.rules from anon, authenticated, service_role;

alter table knowledge.rules enable row level security;
-- No policy yet — WP 16.05's own job.
