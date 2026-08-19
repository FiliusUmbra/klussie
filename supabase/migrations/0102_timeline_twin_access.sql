-- Epic 15 WP01 — the cross-engine reads Timeline and the Digital Twin summary need, and one
-- pre-existing gap found and fixed while building them.
--
-- SYSTEM_ARCHITECTURE.md §7.1: Property "Owns... The Timeline projection. The digital twin
-- composition," and "Events consumed. Everything property-scoped, for the timeline — asset,
-- maintenance, service record, document and conversation events." DATABASE_ARCHITECTURE.md
-- §25: the timeline is "derived from events, never maintained separately." §28: the twin "is
-- not materialised... assembled, never stored." Both rule out a separately dual-written cache
-- — the only architecturally honest implementation reads platform.events live, on every call,
-- the same restraint applied consistently rather than convenient for one and not the other.
--
-- A PRE-EXISTING BUG, FOUND WHILE OPENING THE SAME DOOR THIS EPIC NEEDS OPENED
--
-- 0021_events.sql grants `select on platform.events to klussie_consumer_delivery` and enables
-- RLS on the table with NO policy, stating in its own comment: "This one has NO policies, and
-- that is the point... a table with RLS enabled and no policy denies every role that does not
-- bypass it." That sentence is correct and is exactly what makes the grant above dead code:
-- PostgreSQL's RLS denies SELECT to any non-owner, non-BYPASSRLS role when a table has RLS
-- enabled and no applicable policy exists for that role and command, REGARDLESS of a table
-- privilege GRANT naming it. klussie_consumer_delivery has held SELECT since Epic 01 and has
-- never been able to read a single row with it. Nothing in this session caught it because
-- live verification has been Pending since Epic 03 (`MASTER_CONTEXT.md` §12) — this is
-- exactly the class of defect that only surfaces against a real Postgres instance, which is
-- why that gap is tracked as Critical rather than cosmetic.
--
-- Fixed here, in the same migration that needs the identical shape of access, rather than
-- deferred: one policy naming both roles. Not a scope-widening choice — a correction to what
-- 0021 already intended and said in its own words ("background consumers on §7's elevated
-- path"). `using (true)`: full-stream read for these two roles only. anon, authenticated and
-- service_role are untouched, still fully revoked below 0021's own line 272 — §12's "not
-- client-readable" promise is unchanged. This is not a second isolation predicate on
-- platform.events (ADR-0026/ADR-0028's own rule against them) — nothing here was ever meant
-- to filter per-caller at the RLS layer for an internal engine or consumer role; RLS on this
-- table exists solely to keep client roles out. Per-caller correctness for Timeline is
-- enforced inside property.timeline_segment() itself (WP 15.02) — occurred_at checked against
-- the caller's own resolved stewardship windows — the same "self-enforcing by construction"
-- shape api.resolve_property() (0041) already established for property.properties, reused
-- rather than reinvented.
--
-- klussie_engine_property never held USAGE on schema platform before this migration (0019's
-- own grant list names only klussie_engine_platform, klussie_consumer_delivery and
-- klussie_operator) — granted here, narrowly, for the one table this epic reads.
--
-- SIX work-SCHEMA TABLES, EACH FOR A NAMED REASON — NOT A BLANKET GRANT
--
-- Resolving "which events belong to property X" means resolving which conversations, and
-- transitively which messages, are about that property — work.conversations binds to one of
-- five subjects (Epic 13), three of which (asset_id, maintenance_obligation_id, property_id)
-- resolve directly or through property.assets/property.locations, and a fourth
-- (engagement_id) resolves through work.engagements.request_id -> work.requests, which
-- already carries property_id/asset_id/location_id directly (Epic 12). Six tables, six
-- specific joins WP 15.02 performs, none granted speculatively:
--   work.conversations, work.messages   — the conversation/message subject branches themselves
--   work.engagements, work.requests     — resolving an engagement-bound conversation's property
--   work.maintenance_obligations        — resolving an obligation-bound conversation's property,
--                                          and WP 15.03's open-obligation twin summary
--   work.service_records                — the service_record subject branch, and WP 15.03's
--                                          service-record-count twin summary
--
-- DOCUMENT RESOLUTION IS DELIBERATELY NOT WIRED IN THIS EPIC
--
-- §7.1's own list names document events among what the timeline consumes. Left out here for
-- two independent reasons, not one: first, property.documents/document_attachments has never
-- had a write contract — grep across every migration confirms no DocumentAttached-shaped
-- event has ever been emitted (Epic 08 built structure, backfill and reads only), so the
-- branch would be correct but permanently vacuous until that gap closes, exactly the kind of
-- untestable code this session avoids shipping. Second, 0056_document_attachments.sql states,
-- deliberately and in its own words, "No isolation policy anywhere in this schema may ever
-- join through it to decide who can see a document." Timeline's use would not be that — it
-- scopes an already-authorized stewardship-window read, not a new cross-workspace visibility
-- grant — but an unverifiable, currently-empty branch sitting next to an explicit warning
-- about the exact table it would join is reason enough to leave it for whenever Epic 08 ships
-- a real write contract to test against, added additively then, without redesign. Recorded as
-- a deliberate exclusion, not an oversight.
--
-- ASSET AND LOCATION LIFECYCLE EVENTS DO NOT EXIST YET EITHER — TIMELINE IS THINNER THAN ITS
-- EVENTUAL SHAPE, NOT EMPTY
--
-- Asset engine (Epic 07) has the same gap as Document — no AssetCreated-shaped event has ever
-- been emitted, only structure, a legacy dual-write trigger, and reads. But subject_type
-- 'asset'/'location' is not exclusively asset/location lifecycle events: work.maintenance_
-- schedules/obligations (Epic 10) already emit ScheduleChanged/ObligationCreated/
-- ObligationClosed keyed to the asset or location they concern (0074), and those are real,
-- populated rows today. So the asset/location branches below are not speculative in the way
-- the document branch currently is — they carry real events now, and will carry more once
-- Asset's own write contract exists, without any change to this migration or WP 15.02.

grant usage on schema platform to klussie_engine_property;

create policy events_engine_read on platform.events
  for select
  to klussie_consumer_delivery, klussie_engine_property
  using (true);

comment on policy events_engine_read on platform.events is
  'Full-stream read for the two trusted internal roles named in platform.events'' own original comment ("background consumers on §7''s elevated path") — klussie_consumer_delivery has held a SELECT grant since 0021 that this policy is what actually makes work, and klussie_engine_property needs the identical shape for Timeline (0102-0104). Not a per-caller isolation predicate: anon/authenticated/service_role remain fully revoked, unchanged, and per-caller scoping is enforced inside property.timeline_segment() itself.';

grant select on platform.events to klussie_engine_property;

grant usage on schema work to klussie_engine_property;
grant select on
  work.conversations,
  work.messages,
  work.engagements,
  work.requests,
  work.maintenance_obligations,
  work.service_records
to klussie_engine_property;
