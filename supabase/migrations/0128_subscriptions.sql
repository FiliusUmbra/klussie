-- Epic 22 WP01 (part 2) — commerce.subscriptions: one row per workspace, mutable in place.
--
-- MUTABLE, NOT APPEND-ONLY — THE SECOND GENUINELY MUTABLE AGGREGATE THIS SESSION HAS BUILT
--
-- DATABASE_ARCHITECTURE.md §10's own placement table: "Subscription | commerce | Mutable |
-- One per workspace | Permanent | By workspace, by state, by renewal | Membership." Real
-- UPDATE, no guard trigger — the same shape Epic 19's platform.notification_preferences
-- held as "the first genuinely mutable aggregate this session has built." A subscription's
-- CURRENT state (plan, status, renewal) is what matters; the financial record of what was
-- actually charged is `commerce.invoices`/`commerce.payments` (Epic 14), separately
-- immutable, which is the record that actually needs to survive unedited.
--
-- ONE ROW PER WORKSPACE, ENFORCED STRUCTURALLY
--
-- `unique (workspace_id)` — not merely a convention. §10's own words: "one per workspace."
--
-- payer IS jsonb, NOT A TYPED workspace_id COLUMN — THE SAME POLYMORPHIC-IDENTITY SHAPE
-- Epic 18's PROVIDER IDENTITY ALREADY USES
--
-- PLATFORM_DOMAIN_MODEL.md §24: "a subscription's paying party need not be the workspace
-- itself" — an employer paying for an employee's workspace is the named example. Like
-- Epic 18's `{providerType, providerRef}`, `payer` is `{payerType, payerRef}` rather than a
-- typed foreign key, because the payer may be a workspace or (future) a person, and forcing
-- one column shape now would need a migration the moment the second shape appears. Defaults
-- to `{"payerType": "workspace", "payerRef": <this workspace>}` — the ordinary case, a
-- workspace paying for itself.
--
-- trial_ends_at IS REQUIRED IF AND ONLY IF status = 'trialing' — STRUCTURAL, MATCHING EVERY
-- PAIRED-NULLABILITY CHECK THIS SESSION HAS USED SINCE Epic 18

create table if not exists commerce.subscriptions (
  id             uuid        not null,
  workspace_id   uuid        not null
                 references workspace.workspaces (id),
  plan_key       text        not null
                 references platform.plans (plan_key),
  payer          jsonb       not null,
  status         text        not null,
  trial_ends_at  timestamptz,
  started_at     timestamptz not null default now(),
  renewed_at     timestamptz,
  lapsed_at      timestamptz,
  cancelled_at   timestamptz,

  constraint subscriptions_pkey primary key (id),
  constraint subscriptions_one_per_workspace unique (workspace_id),
  constraint subscriptions_status_valid check (status in ('trialing', 'active', 'lapsed', 'cancelled')),
  constraint subscriptions_trial_pair check ((status = 'trialing') = (trial_ends_at is not null))
);

comment on table commerce.subscriptions is
  'One row per workspace (structurally enforced), mutable in place. The second genuinely mutable aggregate this session has built, after platform.notification_preferences (Epic 19) — current commercial state, not a financial record (that is commerce.invoices/payments, Epic 14, separately immutable).';
comment on column commerce.subscriptions.payer is
  '{"payerType": "workspace", "payerRef": uuid} — the paying party, which need not be the subscribed workspace itself (PLATFORM_DOMAIN_MODEL.md §24).';

create index if not exists subscriptions_status_idx on commerce.subscriptions (status);

grant select, insert, update on commerce.subscriptions to klussie_engine_commerce;
revoke all on commerce.subscriptions from anon, authenticated, service_role;

alter table commerce.subscriptions enable row level security;
