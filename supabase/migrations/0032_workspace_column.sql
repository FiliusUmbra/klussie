-- Epic 03 WP05 — the workspace column, on every existing table it belongs on. Nullable,
-- unpopulated, unread.
--
-- DATABASE_ARCHITECTURE.md §5, the tenancy rule this migration exists to satisfy:
--
--   "Every record carries the workspace it belongs to, and that workspace is part of its
--    identity — not an attribute that a query may forget to filter on."
--
-- and the reason carried rather than derived: "A record whose tenancy must be derived by
-- joining through two other records is a record whose tenancy can be got wrong under
-- refactoring, and whose access check is expensive in exactly the hot paths that matter."
--
-- Step 1 of the six-step migration pattern (roadmap §3) for every table touched here.
-- Nothing reads or writes the new column. No RLS policy references it — that is WP 03.10,
-- gated by ADR-0025. No row is populated — that is WP 03.06, gated on WP 03.03/03.04's
-- backfills existing, which are themselves gated on ADR-0022's acceptance (Proposed, not
-- yet accepted). This package has none of those dependencies: FK constraints accept an
-- all-null column without requiring a single row to resolve, so it runs standalone.
--
-- WHICH TABLES, AND WHY EACH ONE
--
-- DATABASE_ARCHITECTURE.md §5 gives three tenancy levels and one rule: "Anything not
-- explicitly listed [as identity-scoped or platform-scoped] is here [workspace-scoped]."
-- Applied to every existing `public` table:
--
--   NOT touched, and why:
--     public.profiles, public.profile_contacts   — identity-scoped (§5); Epic 02's
--       identity.identities is their eventual replacement, not a table that also needs
--       tenancy.
--     public.categories, public.category_translations,
--     public.services, public.service_translations — platform-scoped catalogue (§5).
--     public.feature_flags — platform-scoped configuration, converging into Epic 04's
--       Capability engine (roadmap §10, Epic 04: "Convergence with the existing
--       feature_flags table rather than coexistence") rather than becoming workspace data.
--     public.audit_log, public.domain_events — legacy infrastructure superseded by
--       platform.audit_records and platform.events (Epic 01). Migrating them in place would
--       entrench what Epic 01 already built the replacement for.
--
--   Touched, with the rule each row's eventual value will follow (WP 03.06's job, not
--   this package's — recorded here so the two packages agree when 03.06 is written):
--
--     Professional Workspace (the workspace WP 03.04 backfills per pro_profiles row):
--       pro_profiles, pro_stats, pro_services, portfolio_items, testimonials.
--
--     Requesting workspace — DATABASE_ARCHITECTURE.md §19: "the request … owned by the
--     requesting workspace":
--       service_requests, service_request_photos (child of a request).
--
--     Offering workspace — §19: "the quote … owned by the offering workspace":
--       quotes.
--
--     Requesting workspace, by the Crossing Registry's own placement (DATABASE_ARCHITECTURE.md
--     §6: "Conversation | The engagement or subject it is bound to" — today that subject is
--     the service_request, homed with the requesting workspace):
--       conversations, and messages as its child, carried directly per §5 rather than
--       resolved by a two-table join.
--
--     Requesting (reviewing) workspace — reviews and reports are both authored by the
--     customer, about a pro, referencing a request; the same shape as the request they
--     reference. Not stated verbatim in a frozen document — the closest DATABASE_ARCHITECTURE.md
--     gets is §19's "reputation … computed from service records and reviews," which says
--     where the *projection* lives, not where the raw row is homed. Recorded as a stated
--     interpretation, not a citation, precisely so a reviewer can tell the difference:
--       reviews, reports.
--
--     Owner's Personal Workspace — migration 0016's own reasoning: "owner_id, not
--     customer_id: a professional is also a person with a home, and nothing about that
--     ownership requires them to be a customer":
--       household_items.
--
--   DEFERRED, not decided here: public.ai_usage_log. Rate-limiting infrastructure keyed
--   to a person, self-scoped access only (0004's policies: reporter reads and writes their
--   own rows and nothing else). Genuinely ambiguous whether it is identity-scoped (a
--   person's own usage, following them across workspaces) or workspace-scoped (usage
--   incurred acting within a specific context) — nothing today depends on resolving it, and
--   forcing an answer to close out this package would be a guess dressed as a decision.
--   Flagged as a finding in this work package's record rather than decided in passing.
--
-- WHY A FOREIGN KEY NOW, ON AN ALL-NULL COLUMN
--
-- A foreign key on a nullable column constrains only non-null values — it costs nothing
-- against the empty column this package creates, and it means WP 03.06's backfill is
-- checked by the database as it writes rather than trusted to be correct by inspection.
-- No `on delete` clause, matching workspace.memberships' own reference to workspace.workspaces
-- (migration 0030): SUPABASE_ARCHITECTURE.md §5, "no cascading deletes anywhere."
--
-- WHY AN INDEX NOW, ON AN ALL-NULL COLUMN
--
-- SUPABASE_ARCHITECTURE.md §20: "every workspace-scoped table carries its workspace
-- directly so the predicate is an indexed equality against a resolved set." An index over
-- an entirely-null column is a few kilobytes; adding it now means WP 03.10's RLS policies
-- land on a table that is already ready for them, rather than depending on a later package
-- remembering the index its own performance requirement needs.

-- =========================================================================
-- PROFESSIONAL WORKSPACE

alter table public.pro_profiles    add column if not exists workspace_id uuid references workspace.workspaces (id);
alter table public.pro_stats       add column if not exists workspace_id uuid references workspace.workspaces (id);
alter table public.pro_services    add column if not exists workspace_id uuid references workspace.workspaces (id);
alter table public.portfolio_items add column if not exists workspace_id uuid references workspace.workspaces (id);
alter table public.testimonials    add column if not exists workspace_id uuid references workspace.workspaces (id);

create index if not exists pro_profiles_workspace_id_idx    on public.pro_profiles (workspace_id);
create index if not exists pro_stats_workspace_id_idx       on public.pro_stats (workspace_id);
create index if not exists pro_services_workspace_id_idx    on public.pro_services (workspace_id);
create index if not exists portfolio_items_workspace_id_idx on public.portfolio_items (workspace_id);
create index if not exists testimonials_workspace_id_idx    on public.testimonials (workspace_id);

comment on column public.pro_profiles.workspace_id is
  'The Professional Workspace this profile belongs to, backfilled by WP 03.04. Nullable and unpopulated until then (roadmap §3 step 1).';
comment on column public.pro_stats.workspace_id is
  'Same Professional Workspace as the pro_profiles row it is keyed to. Nullable and unpopulated until WP 03.06.';
comment on column public.pro_services.workspace_id is
  'The Professional Workspace offering this service. Nullable and unpopulated until WP 03.06.';
comment on column public.portfolio_items.workspace_id is
  'The Professional Workspace this portfolio item belongs to. Nullable and unpopulated until WP 03.06.';
comment on column public.testimonials.workspace_id is
  'The Professional Workspace this testimonial was given to. Nullable and unpopulated until WP 03.06.';

-- =========================================================================
-- REQUESTING WORKSPACE

alter table public.service_requests       add column if not exists workspace_id uuid references workspace.workspaces (id);
alter table public.service_request_photos add column if not exists workspace_id uuid references workspace.workspaces (id);
alter table public.conversations          add column if not exists workspace_id uuid references workspace.workspaces (id);
alter table public.messages               add column if not exists workspace_id uuid references workspace.workspaces (id);
alter table public.reviews                add column if not exists workspace_id uuid references workspace.workspaces (id);
alter table public.reports                add column if not exists workspace_id uuid references workspace.workspaces (id);

create index if not exists service_requests_workspace_id_idx       on public.service_requests (workspace_id);
create index if not exists service_request_photos_workspace_id_idx on public.service_request_photos (workspace_id);
create index if not exists conversations_workspace_id_idx          on public.conversations (workspace_id);
create index if not exists messages_workspace_id_idx               on public.messages (workspace_id);
create index if not exists reviews_workspace_id_idx                on public.reviews (workspace_id);
create index if not exists reports_workspace_id_idx                on public.reports (workspace_id);

comment on column public.service_requests.workspace_id is
  'The requesting workspace (DATABASE_ARCHITECTURE.md §19). Nullable and unpopulated until WP 03.06.';
comment on column public.service_request_photos.workspace_id is
  'Same requesting workspace as the service_request it belongs to. Nullable and unpopulated until WP 03.06.';
comment on column public.conversations.workspace_id is
  'The requesting workspace — the crossing''s home partition (DATABASE_ARCHITECTURE.md §6: "Conversation | The engagement or subject it is bound to"). Nullable and unpopulated until WP 03.06.';
comment on column public.messages.workspace_id is
  'Same requesting workspace as the conversation it belongs to, carried directly rather than resolved by a join (§5). Nullable and unpopulated until WP 03.06.';
comment on column public.reviews.workspace_id is
  'The reviewing (requesting) workspace — a stated interpretation, not a frozen-document citation; see this migration''s header. Nullable and unpopulated until WP 03.06.';
comment on column public.reports.workspace_id is
  'The reporting workspace — the same interpretation as reviews. Nullable and unpopulated until WP 03.06.';

-- =========================================================================
-- OFFERING WORKSPACE

alter table public.quotes add column if not exists workspace_id uuid references workspace.workspaces (id);

create index if not exists quotes_workspace_id_idx on public.quotes (workspace_id);

comment on column public.quotes.workspace_id is
  'The offering workspace (DATABASE_ARCHITECTURE.md §19). Nullable and unpopulated until WP 03.06.';

-- =========================================================================
-- OWNER'S PERSONAL WORKSPACE

alter table public.household_items add column if not exists workspace_id uuid references workspace.workspaces (id);

create index if not exists household_items_workspace_id_idx on public.household_items (workspace_id);

comment on column public.household_items.workspace_id is
  'The owner''s Personal Workspace (migration 0016: "a professional is also a person with a home"). Nullable and unpopulated until WP 03.06.';
