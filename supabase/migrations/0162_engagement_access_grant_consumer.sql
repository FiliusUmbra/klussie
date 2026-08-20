-- Slice 2, WP 2.4 — the scoped access grant consumer: the platform's first real background
-- event consumer, and its reference implementation for every one to follow.
--
-- SYSTEM_ARCHITECTURE.md §6.2 (Workspace engine): "Events consumed. EngagementAccepted (to
-- create a scoped, expiring grant)." DATABASE_ARCHITECTURE.md §19: "Accepting a quote
-- creates an engagement, which creates a scoped, time-bounded membership (§10) for the
-- performing workspace over exactly the locations and assets the work concerns." Migration
-- 0090's own header names why this could not be built there: "the first draft of this
-- migration built work.grant_engagement_access(), a function living in `work` that INSERTs
-- directly into workspace.memberships... klussie_engine_work holds no privilege whatsoever
-- on workspace.memberships — only klussie_engine_workspace does... This is not a restriction
-- to work around with a grant... a future Workspace-owned consumer... is where the grant
-- itself belongs." This migration is that consumer.
--
-- WHY NOW, NOT EARLIER — AND WHY IT NEEDED 0161 FIRST
--
-- Resequenced after WP 2.6 (the client cutover) per the Programme's own Platform Activation
-- Priority — real users can already complete the full request-to-review journey without this
-- grant existing (legacy never had one either). But it could not simply be bolted on: 0161
-- found and fixed the fact that `workspace.memberships.scope` had existed since migration
-- 0030 with NO enforcement anywhere — shipping a scoped grant onto that foundation would
-- have created a membership indistinguishable in effect from an unscoped one. This migration
-- is only safe to ship because 0161 shipped first, verified live, adversarially.
--
-- THE MECHANISM — pg_cron POLLING platform.events, THE EXISTING CURSOR/QUARANTINE MODEL,
-- NOT A NEW FRAMEWORK
--
-- Per explicit direction: treat platform.events + platform.consumer_cursors +
-- platform.consumer_quarantine + pg_cron as the natural completion of infrastructure that
-- already exists, not an open architectural fork. No business logic in triggers, no separate
-- consumer framework. This migration is deliberately the FIRST thing in this codebase to
-- read platform.consumer_cursors/consumer_quarantine for real (0024 built them in Epic 01
-- and said outright: "Nothing runs against these tables yet. No consumer is wired to
-- anything real.") — everything below is that wiring, meant to generalise: a consumer reads
-- forward per hash partition, dispatches on event_type, quarantines what it cannot process,
-- and never blocks on one bad event. A future Timeline/Notifications/Search/Analytics
-- consumer copies this shape, not this schema.
--
-- THE CURSOR IS POSITIONAL, NOT TYPE-FILTERED — DELIBERATELY
--
-- workspace.consume_engagement_access_grants() reads the NEXT batch of events after its
-- cursor in each partition, of ANY event_type, and skips (advancing past, not stalling on)
-- anything that isn't 'marketplace.engagement.created'. A cursor scoped to one event type
-- would mean a second concern this same consumer picks up later (§ below: engagement
-- completion/cancellation revocation) needs its own separate cursor and cannot share a
-- read position with this one. SUPABASE_ARCHITECTURE.md §13's own language — "consumers read
-- forward with a cursor... records its position per partition" — describes a position in the
-- stream, not a filtered subscription; this migration takes that literally.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO — REAL, NAMED GAPS, NOT OVERSIGHTS
--
-- No revocation on engagement completion or cancellation. §7/§8 of PLATFORM_DOMAIN_MODEL.md
-- call contractor access "time-boxed... must lose that access automatically," and the
-- honest business rule is the engagement's own lifecycle — access should end when the job
-- ends or is cancelled, not merely when a clock runs out. That consumer (reacting to
-- marketplace.engagement.completed/marketplace.engagement.cancelled, both already emitted —
-- 0090 — and both readable by this same per-partition cursor the moment a future migration
-- adds the branch) is not built here. Per explicit product direction, this migration instead
-- gives every grant a 90-day expires_at, computed from the triggering event's own
-- occurred_at — NOT a business rule, a safety net: it exists only so an abandoned or
-- disputed engagement does not leave a professional with near-permanent access to a
-- customer's property twin while nothing else is watching. `granting_engagement_id` (below)
-- is what lets that future consumer find and end the exact right membership without
-- touching the grant model built here at all — it would set state = 'ended' on the existing
-- row (§7's own four-state model), never delete it, and never need to re-derive scope.
--
-- No client-facing read of any of this. Nothing here is granted to `authenticated` or given
-- an api.* delegate — matching platform.emit_event()'s own callers, this is reachable only
-- by the one background role that needs it (the fifth `klussie_consumer_*` role this session
-- grants platform.emit_event() to, after search and analytics — 0126/0123's own "Nth
-- occurrence" convention, continued here).
--
-- No membership_history row. Checked against every existing insert into workspace.memberships
-- in this codebase (0033, 0034, 0135, 0144) — not one of them writes to membership_history;
-- 0030's own header says plainly that nothing has ever populated it, and 0144's header names
-- this explicitly as a considered choice, not an absence. This migration matches that
-- unbroken precedent rather than becoming the first exception. The durable record of this
-- grant is the workspace.membership.joined event it emits — the outbox pattern's own
-- justification for existing at all.
--
-- A GENUINELY NEW ROLE — THE FIRST SINCE 0019, AND WHY THAT IS NOT A STOP-CONDITION
--
-- Every role in this platform was created once, in 0019_grants.sql, including two consumer
-- roles (klussie_consumer_search, klussie_consumer_analytics) that sat unused for many
-- epics "waiting for a real caller." No such pre-provisioned role exists for this consumer —
-- ROLES.md §2.2 names exactly four, all reading into `derived`/`analytics_*`/`platform`
-- itself, none writing into `workspace`. SUPABASE_ARCHITECTURE.md §9 (frozen) states the
-- governing principle directly, not as an enumerated list: "Background consumers are not
-- one role... each get their own service role with their own grants." Creating a fifth
-- consumer role is the mechanical application of an already-frozen rule to a new caller, the
-- same way Epic 20/21 each activated one of the two pre-provisioned-but-idle roles — it does
-- not change what any frozen document says, and ROLES.md itself (the operational companion,
-- never the authority) is updated here the same way it was after 0019 first created the
-- other four.
--
-- THE GRANT LOGIC IS SECURITY DEFINER; THE CONSUMER LOOP IS NOT — THE SAME BOUNDARY
-- work.accept_quote() (klussie_engine_work) CROSSES BY CALLING platform.emit_event()
--
-- klussie_consumer_workspace holds real, direct table grants on platform.consumer_cursors/
-- consumer_quarantine/events (matching 0024's own actual grant shape for the other four
-- roles — SELECT/INSERT/UPDATE, not merely USAGE, whatever ROLES.md §2.2's older summary
-- text says) because reading and recording its own position is squarely its own job. It
-- holds NO privilege whatsoever on workspace.memberships — the one write this consumer
-- performs outside its own bookkeeping crosses into the Workspace engine's own aggregate,
-- and per §9 that must fail on a privilege error for any role except klussie_engine_workspace
-- unless it goes through a narrow SECURITY DEFINER delegate, exactly as platform.emit_event()
-- already is for every engine that is not klussie_engine_platform. workspace.
-- grant_engagement_access() is that delegate: owned by postgres, revoked from every
-- application role, granted EXECUTE to klussie_consumer_workspace alone.
--
-- TWO MORE REAL BUGS THIS MIGRATION'S OWN DIAGNOSTIC FOUND, LIVE, NEITHER ANTICIPATED
--
-- First: the consumer loop originally queried platform.events_w0..w7 — each hash
-- partition's own physical table — directly, believing that the narrowest, most literal
-- reading of "one cursor per partition." It failed live with "permission denied for table
-- events_w0" despite klussie_consumer_workspace holding a real, correct grant (and RLS
-- policy membership) on platform.events itself: a GRANT or RLS policy on a partitioned
-- parent does not inherit to a query naming a child partition table directly. Fixed by
-- querying the parent with satisfies_hash_partition() instead — see §4's own comment.
--
-- Second, and larger: platform.consumer_cursors and platform.consumer_quarantine (0024,
-- Epic 01) enable RLS and add no policy to either, on the stated reasoning "these are
-- background-work tables and no client role reaches them." That reasoning is correct for
-- anon/authenticated/service_role and wrong for the four consumer roles 0024 itself grants
-- SELECT/INSERT/UPDATE to in the very same migration — the identical class of bug 0102
-- already found and fixed for platform.events, except older and wider: every one of those
-- four roles has held a real, correct table grant on these two tables that has never once
-- actually worked, because nothing has run as one of them until this migration did. Fixed
-- here, for all five consumer roles and klussie_operator's own equally-dead SELECT grant —
-- see §1's own policies below.
--
-- WHY THE JOB RUNS `set role` INSIDE ITS OWN BODY, NOT VIA cron.schedule_in_database's
-- `username` PARAMETER — VERIFIED AGAINST THIS PROJECT DIRECTLY, NOT ASSUMED
--
-- Tried first: `cron.schedule_in_database(..., username => 'klussie_consumer_workspace')`.
-- Failed: "must be superuser to create a job for another role" — Supabase's own `postgres`
-- role is not a real PostgreSQL superuser on this project, confirmed directly rather than
-- read secondhand. Then tried `set role klussie_consumer_workspace;` inside a plain
-- `cron.schedule()` job body (which always runs as whoever called `cron.schedule`, i.e.
-- `postgres`) — also failed, with a different, more specific error: "permission denied to
-- set role" — because `postgres`'s membership in a role it creates on this project carries
-- ADMIN OPTION (so it can grant/revoke membership in it) but NOT the SET option PostgreSQL 16
-- separated out, and pg_cron's background worker enforces this identically to an interactive
-- session. The fix, confirmed working end-to-end against a real scheduled job before this
-- migration was written: `grant klussie_consumer_workspace to postgres with set true;` — a
-- role can extend its own membership option on a role it already administers. This is why
-- the grant below looks unusual (postgres granting itself SET on a role it just created in
-- the same migration) — it is not a workaround for a missing privilege, it is the one
-- documented mechanism this specific hosting platform requires to run a background job under
-- least privilege at all, verified live rather than assumed from general pg_cron docs.

-- =========================================================================
-- 1 · THE FIFTH CONSUMER ROLE

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'klussie_consumer_workspace') then
    create role klussie_consumer_workspace nologin;
  end if;
end;
$$;

comment on role klussie_consumer_workspace is
  'Background consumer: creates scoped workspace.memberships grants from accepted marketplace engagements (WP 2.4). The reference implementation background consumers since Epic 01''s cursor/quarantine scaffolding follow.';

-- Lets this project's own `postgres` connection role run this consumer''s pg_cron job under
-- least privilege via `set role` — see this migration''s own header for why this exact grant
-- shape, verified rather than assumed, is required on this hosting platform.
grant klussie_consumer_workspace to postgres with set true;

-- Bookkeeping: matches 0024's own actual grant shape to the other four consumer roles.
grant usage on schema platform to klussie_consumer_workspace;
grant select, insert, update on platform.consumer_cursors to klussie_consumer_workspace;
grant select, insert, update on platform.consumer_quarantine to klussie_consumer_workspace;

-- Reading the stream itself needs both the table grant AND the RLS policy naming this role —
-- 0102's own header documents exactly this two-part requirement being missed once already
-- (klussie_consumer_delivery's dead SELECT grant, Epic 01 to Epic 15). Not repeating that:
-- both go in together, here, in the same migration.
grant select on platform.events to klussie_consumer_workspace;

drop policy if exists events_engine_read on platform.events;
create policy events_engine_read on platform.events
  for select
  to klussie_consumer_delivery, klussie_engine_property, klussie_consumer_workspace
  using (true);

comment on policy events_engine_read on platform.events is
  'Full-stream read for the trusted internal roles named in platform.events'' own original comment ("background consumers on §7''s elevated path"). Extended a second time (0102 first added klussie_engine_property alongside klussie_consumer_delivery; this migration adds klussie_consumer_workspace, WP 2.4) — still not a per-caller isolation predicate: anon/authenticated/service_role remain fully revoked, unchanged, and per-caller correctness is enforced inside each reader''s own logic, exactly as 0102 already established.';

-- The one function call this consumer makes outside its own bookkeeping — see this
-- migration's own header for why USAGE here and not a table grant on workspace.memberships.
grant usage on schema workspace to klussie_consumer_workspace;

revoke all on platform.consumer_cursors from anon, authenticated, service_role;
revoke all on platform.consumer_quarantine from anon, authenticated, service_role;

-- A REAL, PRE-EXISTING, PLATFORM-WIDE GAP — FOUND RUNNING THIS MIGRATION'S OWN DIAGNOSTIC,
-- NOT ANTICIPATED, AND NOT SCOPED TO ONLY THIS MIGRATION'S OWN ROLE
--
-- 0024 enables RLS on both tables and adds NO policy to either, stating outright: "these
-- are background-work tables and no client role reaches them. The absent policy is the
-- deny." That reasoning is correct for anon/authenticated/service_role and wrong for the
-- roles it names in the very same migration as needing UPDATE — a real, live INSERT as
-- klussie_consumer_workspace failed here with "new row violates row-level security policy
-- for table consumer_cursors" despite a genuine, correct GRANT. The identical class of bug
-- 0102 already found and fixed for platform.events itself ("a table privilege GRANT...
-- REGARDLESS... RLS enabled and no policy denies every role that does not bypass it") —
-- except this instance is older (Epic 01) and wider: every one of 0024's own four original
-- consumer roles has held a real SELECT/INSERT/UPDATE grant on these two tables that has
-- never once worked, because nothing has ever actually run as one of them until this
-- migration did. klussie_operator's own SELECT grant (0024) is equally dead. Fixed here,
-- for all five consumer roles and the operator, in the same shape 0102 already established
-- ("not a per-caller isolation predicate... full access for these trusted internal roles")
-- — cursor/quarantine bookkeeping was never meant to be isolated per consumer_name at the
-- row level; 0024's own table-level GRANT already gave every consumer role identical access
-- to every other consumer's rows, RLS policy or not.

drop policy if exists consumer_cursors_consumer_access on platform.consumer_cursors;
create policy consumer_cursors_consumer_access on platform.consumer_cursors
  for all
  to klussie_consumer_projection, klussie_consumer_delivery, klussie_consumer_search,
     klussie_consumer_analytics, klussie_consumer_workspace
  using (true)
  with check (true);

drop policy if exists consumer_cursors_operator_read on platform.consumer_cursors;
create policy consumer_cursors_operator_read on platform.consumer_cursors
  for select
  to klussie_operator
  using (true);

drop policy if exists consumer_quarantine_consumer_access on platform.consumer_quarantine;
create policy consumer_quarantine_consumer_access on platform.consumer_quarantine
  for all
  to klussie_consumer_projection, klussie_consumer_delivery, klussie_consumer_search,
     klussie_consumer_analytics, klussie_consumer_workspace
  using (true)
  with check (true);

drop policy if exists consumer_quarantine_operator_read on platform.consumer_quarantine;
create policy consumer_quarantine_operator_read on platform.consumer_quarantine
  for select
  to klussie_operator
  using (true);

comment on policy consumer_cursors_consumer_access on platform.consumer_cursors is
  'The policy 0024''s own table GRANT always needed and never had — found live, by this migration''s own diagnostic, not anticipated. Matches every one of 0024''s four original consumer roles plus this migration''s own fifth. Not per-caller: 0024''s table-level GRANT already gave every consumer role identical reach into every other consumer''s cursor row.';
comment on policy consumer_quarantine_consumer_access on platform.consumer_quarantine is
  'Same fix, same reason, as consumer_cursors_consumer_access on the sibling table.';

-- =========================================================================
-- 2 · workspace.memberships GAINS A GRANT-PROVENANCE COLUMN
--
-- Nullable: every membership created by every other path (signup, backfill, operator
-- bootstrap) has no engagement behind it. Referenced, not owned — an ended engagement's
-- grant stays exactly as permanent as the membership row itself (§10), matching person_ref's
-- own "durable record, no cascading destruction" posture one column over, though this one IS
-- safe to foreign-key: work.engagements is itself permanent ("no delete grant exists for
-- this table, ever" — 0087's own comment), so referential integrity here costs nothing an
-- erasure elsewhere would ever need to route around.

alter table workspace.memberships
  add column if not exists granting_engagement_id uuid references work.engagements (id);

comment on column workspace.memberships.granting_engagement_id is
  'Set only for a scoped grant created by workspace.grant_engagement_access() (WP 2.4) from a real marketplace.engagement.created event. Null for every other membership. This is the handle a future engagement-completion/cancellation consumer uses to find and end (state = ''ended'', never deleted) exactly the right row, without re-deriving scope — see this migration''s own header.';

-- Idempotency for at-least-once delivery: the same engagement must never produce two
-- memberships, however many times its event is (re)processed. Partial, because every other
-- membership in the table has a null value here and indexing that would index most of the
-- table for a uniqueness rule that only ever applies to one narrow class of row.
create unique index if not exists memberships_granting_engagement_unique
  on workspace.memberships (granting_engagement_id)
  where granting_engagement_id is not null;

-- =========================================================================
-- 3 · workspace.grant_engagement_access() — THE SECURITY DEFINER DELEGATE
--
-- Resolves everything from the engagement id alone, exactly the shape work.accept_quote()'s
-- own emitted event supplies for free: subject_type = 'engagement', subject_id = the
-- engagement id, no payload parsing required for the one identifier that matters most.
--
-- SKIPS, DELIBERATELY, WHEN THE REQUEST HAS NO PHYSICAL SUBJECT AT ALL
--
-- work.requests.property_id/asset_id/location_id are all independently nullable (0085) — a
-- request created before any of Slice 2's own work, or one never tied to a real twin, has
-- none of the three set. Granting a scope-less membership here would mean scope IS NULL,
-- which 0161 just finished making mean "unscoped, full access" — the exact over-grant this
-- whole work package exists to prevent, not a harmless empty case. No grant is created; the
-- event is still considered successfully processed (not quarantined — this is an expected,
-- named outcome, not a failure).
--
-- MINTS ITS OWN membership_id/event_id — NOT PASSED IN — A REAL BUG FOUND LIVE
--
-- The first draft took these as parameters, minted by the (non-SECURITY-DEFINER) caller
-- loop below via platform.uuid_v7_at(now()). It failed live: uuid_v7_at() is "executable
-- by no application role, only the migration runner" (0026/0144's own posture, enforced by
-- a bare `revoke all ... from public` with no role ever explicitly re-granted), and
-- workspace.consume_engagement_access_grants() runs AS klussie_consumer_workspace, not as
-- postgres — it has no more standing to call uuid_v7_at() than any other application role
-- does. Minting both ids in here instead costs nothing: this function is SECURITY DEFINER,
-- so the nested call to uuid_v7_at() runs as this function's own owner (postgres) exactly
-- the way workspace.resolve_owner_person_ref() already relies on below, and
-- uuid_v7_at()'s own exposure stays exactly as narrow as 0144 left it.

-- DROP first: this function's own parameter LIST changed once already while building this
-- migration (removing p_membership_id/p_event_id — see this function's own comment above),
-- and unlike an OUT-parameter-only change, CREATE OR REPLACE across a genuinely different
-- argument list does not error — it silently creates a second, orphaned overload alongside
-- the old one, found only by querying pg_proc directly. Harmless on a fresh database.
drop function if exists workspace.grant_engagement_access(uuid, uuid, uuid, uuid, uuid, timestamptz);

create or replace function workspace.grant_engagement_access(
  p_engagement_id   uuid,
  p_correlation_id  uuid,
  p_causation_id    uuid,
  p_occurred_at     timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id        uuid;
  v_performing_ws      uuid;
  v_requesting_ws       uuid;
  v_property_id          uuid;
  v_owner_person_ref      uuid;
  v_expires_at             timestamptz;
  v_membership_id            uuid;
  v_event_id                   uuid;
begin
  -- At-least-once delivery: a retried or replayed event for an engagement already granted
  -- is a successful no-op, not a second membership. The unique index above is the hard
  -- backstop if this check and a concurrent invocation ever race.
  if exists (
    select 1 from workspace.memberships where granting_engagement_id = p_engagement_id
  ) then
    return;
  end if;

  select request_id, performing_workspace_id, requesting_workspace_id
    into v_request_id, v_performing_ws, v_requesting_ws
  from work.engagements
  where id = p_engagement_id;

  if v_request_id is null then
    raise exception
      'workspace.grant_engagement_access: engagement % does not exist', p_engagement_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  select coalesce(
    r.property_id,
    (select a.property_id from property.assets a where a.id = r.asset_id),
    (select l.property_id from property.locations l where l.id = r.location_id)
  )
    into v_property_id
  from work.requests r
  where r.id = v_request_id;

  if v_property_id is null then
    raise notice
      'workspace.grant_engagement_access: engagement % (request %) has no property/asset/location subject — no scope to grant, skipping',
      p_engagement_id, v_request_id;
    return;
  end if;

  v_owner_person_ref := workspace.resolve_owner_person_ref(v_performing_ws);

  if v_owner_person_ref is null then
    raise exception
      'workspace.grant_engagement_access: performing workspace % has no resolvable owner', v_performing_ws
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- Safety-net expiry, not the business rule — see this migration's own header. Anchored to
  -- the triggering event's own occurred_at, not now(), so replay produces the identical
  -- expires_at regardless of when the consumer actually gets around to processing it.
  v_expires_at := p_occurred_at + interval '90 days';

  v_membership_id := platform.uuid_v7_at(now());
  v_event_id := platform.uuid_v7_at(now());

  insert into workspace.memberships (
    id, workspace_id, person_ref, role, scope, state, expires_at,
    granting_engagement_id, created_at, updated_at
  ) values (
    v_membership_id, v_requesting_ws, v_owner_person_ref, 'contractor',
    jsonb_build_object('propertyId', v_property_id), 'active', v_expires_at,
    p_engagement_id, now(), now()
  );

  perform platform.emit_event(
    p_event_id       => v_event_id,
    p_event_type     => 'workspace.membership.joined',
    p_workspace_id   => v_requesting_ws,
    p_actor_type     => 'system',
    p_actor_ref      => 'engagement_access_grant_consumer',
    p_subject_type   => 'membership',
    p_subject_id     => v_membership_id,
    p_correlation_id => p_correlation_id,
    p_causation_id   => p_causation_id,
    p_payload        => jsonb_build_object(
      'role', 'contractor',
      'personRef', v_owner_person_ref,
      'scope', jsonb_build_object('propertyId', v_property_id),
      'grantingEngagementId', p_engagement_id,
      'expiresAt', to_jsonb(v_expires_at)
    )
  );
end;
$$;

comment on function workspace.grant_engagement_access(uuid, uuid, uuid, timestamptz) is
  'The SECURITY DEFINER delegate that actually creates a scoped workspace.memberships row from an accepted engagement (WP 2.4) — the function work.accept_quote()''s own header (0090) said belongs in Workspace, not work. Idempotent per engagement (granting_engagement_id). Skips, without error, when the request has no property/asset/location subject. Emits workspace.membership.joined. 90-day expires_at is a safety net, not the business rule — see this migration''s own header.';

revoke all on function workspace.grant_engagement_access(uuid, uuid, uuid, timestamptz) from public, anon, authenticated, service_role;
grant execute on function workspace.grant_engagement_access(uuid, uuid, uuid, timestamptz) to klussie_consumer_workspace;

-- =========================================================================
-- 4 · workspace.consume_engagement_access_grants() — THE CURSOR LOOP ITSELF
--
-- SECURITY INVOKER (the default — no explicit clause), unlike the delegate above: it runs
-- as whichever role calls it, using that role's own direct grants on
-- consumer_cursors/consumer_quarantine/events (§1). The one privileged write it needs
-- (workspace.memberships, via the delegate above) is reached the same way
-- klussie_engine_work reaches platform.events — through a narrow SECURITY DEFINER function,
-- never through a direct grant on someone else's aggregate.
--
-- Reads platform.events itself — the partitioned PARENT, never platform.events_w0..w7
-- directly. Tried the direct-partition-table form first; it failed live with `permission
-- denied for table events_w0` despite klussie_consumer_workspace holding a real, correct
-- SELECT grant (and RLS policy membership) on platform.events itself — a GRANT and an RLS
-- policy on a partitioned parent do not inherit to a query that names a child partition
-- table directly, only to one against the parent. satisfies_hash_partition() is what keeps
-- this a genuine per-partition cursor without that gap: the planner prunes to exactly the
-- one physical partition each call names, matching ADR-0020's own eight-way modulus.

-- Output columns are prefixed `out_` — a real, live-found reason, not decoration: RETURNS
-- TABLE columns become implicitly-scoped PL/pgSQL variables visible to every embedded SQL
-- statement in the function body, and platform.consumer_cursors already has a column
-- literally named partition_index. An unprefixed `partition_index := v_partition;`
-- assignment lower in this function is unambiguous, but the very next statement's own
-- `on conflict (consumer_name, partition_index)` is not — Postgres cannot tell whether that
-- bare identifier means the table's column or this function's own output variable, and
-- refuses to guess. Found running this migration's own diagnostic, not anticipated.
-- DROP first, not CREATE OR REPLACE alone: this function's own OUT-parameter names changed
-- once already while building this migration (see the out_ prefix comment above), and
-- PostgreSQL refuses CREATE OR REPLACE across a changed row type ("cannot change return
-- type of existing function... Row type defined by OUT parameters is different"). Harmless
-- on a fresh database (nothing to drop); real and needed on any database this migration's
-- own earlier draft already ran against — this one included.
drop function if exists workspace.consume_engagement_access_grants(integer);

create or replace function workspace.consume_engagement_access_grants(p_batch_size integer default 200)
returns table (
  out_partition_index smallint,
  out_events_read        integer,
  out_events_processed      integer,
  out_events_skipped          integer,
  out_events_quarantined         integer
)
language plpgsql
set search_path = ''
as $$
declare
  v_consumer_name     constant text := 'workspace_engagement_access';
  v_partition          smallint;
  v_last_occurred_at    timestamptz;
  v_last_event_id        uuid;
  v_row                    record;
  v_events_read             integer;
  v_events_processed         integer;
  v_events_skipped            integer;
  v_events_quarantined         integer;
begin
  for v_partition in 0..7 loop
    v_events_read := 0;
    v_events_processed := 0;
    v_events_skipped := 0;
    v_events_quarantined := 0;

    select cc.last_occurred_at, cc.last_event_id
      into v_last_occurred_at, v_last_event_id
    from platform.consumer_cursors cc
    where cc.consumer_name = v_consumer_name and cc.partition_index = v_partition;

    -- No row yet, or a row with a null position (0024's own distinction): both mean "read
    -- from the very beginning of this partition."
    v_last_occurred_at := coalesce(v_last_occurred_at, '-infinity'::timestamptz);
    v_last_event_id := coalesce(v_last_event_id, '00000000-0000-0000-0000-000000000000'::uuid);

    -- Queries the PARENT table, never platform.events_wN directly — a GRANT (and an RLS
    -- policy) on a partitioned parent does not inherit to its children for a query that
    -- names a child table itself; only a query against the parent does. Found by this
    -- migration's own diagnostic (klussie_consumer_workspace held a real, correct grant on
    -- platform.events and still got `permission denied for table events_w0` querying the
    -- partition directly) rather than assumed. satisfies_hash_partition() is what still
    -- gives this loop a genuine per-partition cursor without abandoning the parent: the
    -- planner prunes to exactly the one physical partition this predicate names, matching
    -- ADR-0020's own modulus, with none of the privilege gap direct partition access has.
    for v_row in
      select event_id, event_type, workspace_id, subject_type, subject_id, correlation_id, occurred_at
      from platform.events
      where satisfies_hash_partition('platform.events'::regclass, 8, v_partition, workspace_id)
        and (occurred_at, event_id) > (v_last_occurred_at, v_last_event_id)
      order by occurred_at, event_id
      limit p_batch_size
    loop
      begin
        if v_row.event_type = 'marketplace.engagement.created' then
          if v_row.subject_type <> 'engagement' then
            raise exception
              'unexpected subject_type % for marketplace.engagement.created (event %)',
              v_row.subject_type, v_row.event_id;
          end if;

          -- No id minted here — workspace.grant_engagement_access() mints its own
          -- membership_id/event_id internally now (see that function's own comment): this
          -- loop runs as klussie_consumer_workspace, which platform.uuid_v7_at() correctly
          -- refuses.
          perform workspace.grant_engagement_access(
            p_engagement_id  => v_row.subject_id,
            p_correlation_id => v_row.correlation_id,
            p_causation_id   => v_row.event_id,
            p_occurred_at    => v_row.occurred_at
          );

          v_events_processed := v_events_processed + 1;
        else
          -- Positional cursor, not a filtered subscription — see this migration's own
          -- header. Every other event type is a deliberate, silent skip, not a failure.
          v_events_skipped := v_events_skipped + 1;
        end if;

      exception when others then
        v_events_quarantined := v_events_quarantined + 1;
        insert into platform.consumer_quarantine (
          consumer_name, event_id, occurred_at, workspace_id, failure_reason,
          attempts, first_failed_at, last_failed_at
        ) values (
          v_consumer_name, v_row.event_id, v_row.occurred_at, v_row.workspace_id, sqlerrm,
          1, now(), now()
        )
        on conflict (consumer_name, event_id) do update
          set attempts = platform.consumer_quarantine.attempts + 1,
              last_failed_at = now(),
              failure_reason = excluded.failure_reason;
      end;

      v_events_read := v_events_read + 1;
      v_last_occurred_at := v_row.occurred_at;
      v_last_event_id := v_row.event_id;
    end loop;

    -- Only move the cursor if something was actually read — an empty partition this tick
    -- leaves the position exactly where it was, which is a no-op, not a change.
    if v_events_read > 0 then
      insert into platform.consumer_cursors (
        consumer_name, partition_index, last_occurred_at, last_event_id, updated_at
      ) values (
        v_consumer_name, v_partition, v_last_occurred_at, v_last_event_id, now()
      )
      on conflict (consumer_name, partition_index) do update
        set last_occurred_at = excluded.last_occurred_at,
            last_event_id = excluded.last_event_id,
            updated_at = now();
    end if;

    out_partition_index := v_partition;
    out_events_read := v_events_read;
    out_events_processed := v_events_processed;
    out_events_skipped := v_events_skipped;
    out_events_quarantined := v_events_quarantined;
    return next;
  end loop;
end;
$$;

comment on function workspace.consume_engagement_access_grants(integer) is
  'The reference background-consumer loop (WP 2.4): per-hash-partition cursor over platform.events, dispatching only on marketplace.engagement.created and skipping (advancing past, not stalling on) everything else, quarantining what it cannot process rather than halting the partition. SECURITY INVOKER — runs as klussie_consumer_workspace via the pg_cron job below, using that role''s own direct grants for its own bookkeeping and workspace.grant_engagement_access() (SECURITY DEFINER) for the one write into another engine''s schema. Returns one row per partition for observability.';

revoke all on function workspace.consume_engagement_access_grants(integer) from public, anon, authenticated, service_role;
grant execute on function workspace.consume_engagement_access_grants(integer) to klussie_consumer_workspace;

-- =========================================================================
-- 5 · SCHEDULING — EVERY MINUTE, RUNNING AS klussie_consumer_workspace VIA `set role`
--
-- See this migration's own header for why `set role` inside the job body, verified directly
-- against this project, rather than cron.schedule_in_database's username parameter.
--
-- cron.schedule() upserts by job name (pg_cron >= 1.4) — safe to run this migration again.

select cron.schedule(
  'workspace-engagement-access-grants',
  '* * * * *',
  $job$set role klussie_consumer_workspace; select workspace.consume_engagement_access_grants(); reset role;$job$
);

comment on function workspace.grant_engagement_access(uuid, uuid, uuid, timestamptz) is
  'The SECURITY DEFINER delegate that actually creates a scoped workspace.memberships row from an accepted engagement (WP 2.4) — the function work.accept_quote()''s own header (0090) said belongs in Workspace, not work. Idempotent per engagement (granting_engagement_id). Skips, without error, when the request has no property/asset/location subject. Emits workspace.membership.joined. 90-day expires_at is a safety net, not the business rule — see this migration''s own header. Scheduled every minute via pg_cron as klussie_consumer_workspace (see cron.job ''workspace-engagement-access-grants'').';
