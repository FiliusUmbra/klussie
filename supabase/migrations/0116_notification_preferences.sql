-- Epic 19 WP02 — preferences per membership: `platform.notification_preferences`.
--
-- PER-MEMBERSHIP, NOT PER-IDENTITY, NOT PER-WORKSPACE — TAKEN LITERALLY
--
-- PLATFORM_DOMAIN_MODEL.md §20: "A person may want everything from their business and
-- only urgent matters from their home. Preferences on the identity would be too coarse;
-- on the workspace, uniform across members and therefore wrong — the same argument as
-- §7." membership_id is a real foreign key into workspace.memberships — the exact
-- relationship a preference is about, not a (person_ref, workspace_id) pair reconstructed
-- from it. workspace.memberships (0030) carries no uniqueness constraint on (person_ref,
-- workspace_id) precisely because re-joining creates a new membership row (0030's own
-- header) — preferences therefore do not, and structurally cannot, carry over to a fresh
-- membership after someone leaves and rejoins, which is the correct reading of "per
-- membership" rather than an oversight.
--
-- THE ONE MUTABLE, NON-APPEND-ONLY AGGREGATE THIS SESSION HAS BUILT, AND WHY THAT IS
-- CORRECT HERE
--
-- Every other table this session has built is either a Historical append-only log or an
-- immutable-except-named-columns record — because each one represents a decision or a
-- fact worth a permanent trail (a declared rule, a service record, an invoice). A
-- notification preference is neither: it is "what does this person want right now," with
-- no value in preserving a history of past toggles the way knowledge.rules' own
-- supersession preserves policy history for governance. One row per membership,
-- genuinely mutable in place, the same "current pointer" shape workspace.workspaces'
-- own mutable columns already hold (migration 0030) — no guard trigger, no supersession.
--
-- preferences IS OPEN-ENDED JSONB, THE SAME RESTRAINT knowledge.rules.rule ALREADY HOLDS
--
-- What a preference actually looks like — per-category channel toggles, digest cadence,
-- quiet hours — is exactly the kind of shape PLATFORM_DOMAIN_MODEL.md §20's own "How it
-- evolves" (digesting, batching, on-call rotas) says will keep growing. A typed column
-- per concern would need a migration for every future preference; jsonb does not.

create table if not exists platform.notification_preferences (
  id             uuid        not null,

  membership_id  uuid        not null
                 references workspace.memberships (id),

  preferences    jsonb       not null default '{}'::jsonb,

  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now(),

  constraint notification_preferences_pkey primary key (id),
  constraint notification_preferences_one_per_membership unique (membership_id)
);

comment on table platform.notification_preferences is
  'Notification preferences, per membership — not per identity, not per workspace (PLATFORM_DOMAIN_MODEL.md §20). The one genuinely mutable, non-append-only aggregate this session has built; see this migration''s own header for why that is correct here.';
comment on column platform.notification_preferences.preferences is
  'Open-ended — per-category channel toggles, digest cadence, quiet hours. The same restraint knowledge.rules.rule already holds for content that keeps growing (§20''s own "How it evolves").';

create index if not exists notification_preferences_membership_idx
  on platform.notification_preferences (membership_id);

-- =========================================================================
-- MUTABILITY AND ACCESS — a real UPDATE path, deliberately, matching workspace.workspaces'
-- own mutable-current-pointer shape rather than this session's usual immutable-except
-- guard.

grant update on platform.notification_preferences to klussie_engine_platform;
revoke all on platform.notification_preferences from anon, authenticated, service_role;

alter table platform.notification_preferences enable row level security;
-- No policy yet — no api.* delegate exists this epic; see 0115's own header for the
-- identical reasoning.
