-- Epic 12 WP02 — the Quote aggregate: an offer, owned by the offering workspace.
--
-- DATABASE_ARCHITECTURE.md §19: "the quote (an offer, owned by the offering
-- workspace)." Mirrors public.quotes' own shape closely — price, message, status,
-- sent/responded timestamps — because nothing about a quote's real structure has
-- changed, only whose workspace owns it (a pro profile before Epic 03; a Professional
-- Workspace now). See 0085's own header for this epic's scope boundary, held here too.

create table if not exists work.quotes (
  id                    uuid        not null,

  request_id            uuid        not null
                        references work.requests (id),
  offering_workspace_id uuid        not null
                        references workspace.workspaces (id),

  price                 numeric(10, 2) not null,
  message               text        null,

  status                text        not null default 'sent'
                        check (status in ('sent', 'accepted', 'declined')),

  sent_at               timestamptz not null default now(),
  responded_at          timestamptz null,

  -- Bookkeeping only — see 0085's own comment on the identical column there. Named
  -- legacy_quote_id rather than quote_id: the source and target tables share the name
  -- "quotes" (just different schemas), which service_requests -> work.requests did not.
  legacy_quote_id       uuid        null,

  constraint quotes_pkey primary key (id),
  constraint quotes_one_per_request_per_offeror unique (request_id, offering_workspace_id),
  constraint quotes_responded_consistency
    check (status = 'sent' or responded_at is not null)
);

comment on table work.quotes is
  'An offer, owned by the offering workspace (§19). Mirrors public.quotes'' own shape — that table remains authoritative during this epic; this one has no reader yet.';
comment on column work.quotes.legacy_quote_id is
  'Bookkeeping only — the legacy public.quotes row this was backfilled from, if any. Never returned by the contract (WP 12.06).';

create index if not exists quotes_request_idx
  on work.quotes (request_id);
create index if not exists quotes_offering_workspace_idx
  on work.quotes (offering_workspace_id);
create index if not exists quotes_legacy_idx
  on work.quotes (legacy_quote_id) where legacy_quote_id is not null;

-- =========================================================================
-- MUTABILITY AND ACCESS

grant update on work.quotes to klussie_engine_work;
revoke all on work.quotes from anon, authenticated, service_role;

alter table work.quotes enable row level security;

-- No policy yet — WP 12.04's own job.
