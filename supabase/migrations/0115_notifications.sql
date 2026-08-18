-- Epic 19 WP01 — notification records and delivery receipts: `platform.notifications`
-- and `platform.notification_deliveries`.
--
-- SCOPED PLACEMENT — NO ENGINE ROLE EXISTS FOR NOTIFICATION, AND THE FROZEN SCHEMA TABLE
-- IS SILENT ON WHERE ITS AGGREGATE LIVES, SO THIS MIGRATION FOLLOWS AUDIT'S OWN PRECEDENT
--
-- SUPABASE_ARCHITECTURE.md §7's own schema table names exactly ten schemas and their
-- owning engines. `platform` reads "Events, audit, jurisdiction rules, taxonomies,
-- catalogues, configuration | Event Backbone, Audit, Administration" — Notification is
-- not named there, and no `klussie_engine_notification` role exists anywhere in
-- `ROLES.md`. This is a real, silent gap in the frozen documents, not something to
-- guess past. Resolved by precedent rather than invented: PLATFORM_DOMAIN_MODEL.md groups
-- Notification, Search, Analytics and Audit together as "Platform Services" (Part VI, §20-
-- 22), and SYSTEM_ARCHITECTURE.md places all four in the identical "§10" tier. Of those
-- four, Audit is the nearest structural analogue — a cross-cutting, platform-wide concern
-- with a genuine aggregate (not a pure projection the way Search's indexes are) — and
-- Audit already lives in `platform`, owned by `klussie_engine_platform`. This migration
-- follows that precedent: no new schema, no new engine role, the same restraint
-- "tier-level rather than one schema per engine" (§7's own stated reason) already argues
-- for. Recorded here as a deliberate architectural decision, not an assumption.
--
-- NOTIFICATIONS ARE WORKSPACE-SCOPED; DELIVERY IS PER PERSON, PER CHANNEL — TWO TABLES,
-- NOT ONE
--
-- DATABASE_ARCHITECTURE.md §32: "Notification records are workspace-scoped... Delivery
-- receipts are an aggregate [separately] — whether something was delivered, seen and
-- acted upon is a fact, not a derivation." One notification (a workspace-wide fact — "the
-- boiler obligation is due") fans out to many delivery receipts (one per current member,
-- potentially one per channel each) — collapsing the two into one table would either
-- duplicate the notification's own content per recipient or make a single-recipient
-- concept (delivered/seen/acted) awkwardly nullable on a workspace-scoped row.
--
-- headline IS THE ONLY CONTENT THIS ENGINE OWNS — "WHY" STAYS WITH THE EMITTING ENGINE
--
-- §10.1: "Does not own. Why something matters — that is the emitting engine's event."
-- source_event_id traces back to the real domain event (an obligation, a quote, a
-- message) without duplicating its payload here; headline is the minimum human-readable
-- summary Notification itself is responsible for composing.
--
-- platform.notifications IS FULLY IMMUTABLE; notification_deliveries HAS THE FAMILIAR
-- ONE-EXCEPTION-COLUMN(S) GUARD
--
-- A raised notification's own facts never change (matching knowledge.world_nodes' own
-- insert-only precedent, Epic 16) — withheld grants, no trigger needed. A delivery
-- receipt's three timestamps (delivered_at/seen_at/acted_at) each move null -> set, once,
-- the same shape work.service_records_guard_mutation() (Epic 11) already established for
-- multiple independent one-way columns on one row.
--
-- NO RLS POLICY ON EITHER TABLE YET — "USERS SEE ... NOTIFICATIONS ... ALL OF WHICH ARE
-- SHAPED, SCOPED VIEWS", NEVER THE RAW TABLE
--
-- SUPABASE_ARCHITECTURE.md's own words (§12, echoed for audit): the client is meant to
-- see a composed inbox, never this table directly — the same reasoning platform.events
-- and platform.audit_records already hold. RLS is enabled with no policy, denying every
-- role that does not bypass it, until a real read surface (WP 19.03's my_inbox()) exists;
-- no `api.*` delegate exists yet either (no client caller this epic), so no client-facing
-- policy is needed to make that surface work today.

create table if not exists platform.notifications (
  id                uuid        not null,

  workspace_id      uuid        not null
                    references workspace.workspaces (id),

  category          text        not null,
  headline          text        not null,

  subject_type      text        null,
  subject_id        uuid        null,

  source_event_id   uuid        null,

  raised_at         timestamptz not null default now(),

  constraint notifications_pkey primary key (id),
  constraint notifications_subject_pair
    check ((subject_type is null) = (subject_id is null))
);

comment on table platform.notifications is
  'Workspace-scoped notification records (DATABASE_ARCHITECTURE.md §32). Immutable — headline is the minimum human-readable summary Notification itself composes; "why" stays with source_event_id, the emitting engine''s own event.';
comment on column platform.notifications.category is
  'Open text, the same restraint knowledge.rules.category and knowledge.workspace_edges.edge_type already hold — the vocabulary of what warrants attention is not closed here.';
comment on column platform.notifications.source_event_id is
  'The originating platform.events row, if any — traceability without duplicating its payload. No foreign key: platform.events has none of its own to reference (0021''s own header), and a notification must survive a hash-partition detail changing underneath it.';

create index if not exists notifications_workspace_idx
  on platform.notifications (workspace_id, raised_at desc);

revoke update, delete on platform.notifications from klussie_engine_platform;
revoke all on platform.notifications from anon, authenticated, service_role;

alter table platform.notifications enable row level security;
-- No policy yet — see this migration's own header.

-- =========================================================================
-- DELIVERY RECEIPTS — one per (notification, person, channel)

create table if not exists platform.notification_deliveries (
  id               uuid        not null,

  notification_id  uuid        not null
                   references platform.notifications (id),

  -- No foreign key, matching work.messages.sender_person_ref (Epic 13) and
  -- knowledge.workspace_edges.asserted_by_ref (Epic 16) — a durable reference that must
  -- survive erasure of the identity row (SUPABASE_ARCHITECTURE.md §5).
  person_ref       uuid        not null,
  channel          text        not null,

  delivered_at     timestamptz null,
  seen_at          timestamptz null,
  acted_at         timestamptz null,

  created_at       timestamptz not null default now(),

  constraint notification_deliveries_pkey primary key (id),
  constraint notification_deliveries_unique_recipient_channel
    unique (notification_id, person_ref, channel)
);

comment on table platform.notification_deliveries is
  'Whether one notification was delivered, seen and acted upon, per recipient per channel — a fact, not a derivation (§32). One row per (notification, person, channel); immutable except its three timestamps, each null -> set, once.';
comment on column platform.notification_deliveries.channel is
  'Open text (''email'', ''push'', ''in_app'', ...) — §10.1''s own "replaceable adapters" framing, not a closed list this migration would have to enumerate.';

create index if not exists notification_deliveries_person_idx
  on platform.notification_deliveries (person_ref, created_at desc);
create index if not exists notification_deliveries_notification_idx
  on platform.notification_deliveries (notification_id);

-- =========================================================================
-- IMMUTABILITY — every column frozen except delivered_at/seen_at/acted_at, each
-- one-way

create or replace function platform.notification_deliveries_guard_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'platform.notification_deliveries rows are never deleted'
      using
        hint = 'A delivery receipt is permanent, even if the underlying notification is later superseded by events.',
        errcode = 'restrict_violation';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.notification_id is distinct from old.notification_id
       or new.person_ref is distinct from old.person_ref
       or new.channel is distinct from old.channel
       or new.created_at is distinct from old.created_at
    then
      raise exception
        'platform.notification_deliveries is immutable except delivered_at, seen_at and acted_at'
        using errcode = 'restrict_violation';
    end if;

    if old.delivered_at is not null and new.delivered_at is distinct from old.delivered_at then
      raise exception
        'platform.notification_deliveries: delivered_at may move from null to set only, never back'
        using errcode = 'restrict_violation';
    end if;
    if old.seen_at is not null and new.seen_at is distinct from old.seen_at then
      raise exception
        'platform.notification_deliveries: seen_at may move from null to set only, never back'
        using errcode = 'restrict_violation';
    end if;
    if old.acted_at is not null and new.acted_at is distinct from old.acted_at then
      raise exception
        'platform.notification_deliveries: acted_at may move from null to set only, never back'
        using errcode = 'restrict_violation';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

comment on function platform.notification_deliveries_guard_mutation() is
  'Immutability guard for platform.notification_deliveries — three independent one-way columns on one row, the same shape work.service_records_guard_mutation() (Epic 11) established.';

drop trigger if exists notification_deliveries_guard_mutation on platform.notification_deliveries;
create trigger notification_deliveries_guard_mutation
  before update or delete on platform.notification_deliveries
  for each row execute function platform.notification_deliveries_guard_mutation();

grant update on platform.notification_deliveries to klussie_engine_platform;
revoke all on platform.notification_deliveries from anon, authenticated, service_role;

alter table platform.notification_deliveries enable row level security;
-- No policy yet — see this migration's own header.
