-- Recurring Maintenance Activation slice — a homeowner can set a real recurring cadence
-- ("every 3 months, starting Dec 1") instead of only ever adding one-off tasks. Full
-- read-only architecture audit preceded this migration (relayed to the user in full);
-- this header records only the decisions that audit actually required, not a repeat of
-- it.
--
-- WHAT WAS ALREADY THERE, UNTOUCHED
--
-- work.create_maintenance_schedule()/cancel_maintenance_schedule()/generate_due_
-- obligation() (0074) are already correct, complete logic — insert-and-emit,
-- one-way-cancel-and-emit, and lock-check-create-advance respectively. None of their
-- bodies change here. api.my_maintenance_schedules() (0137) is already safely exposed,
-- membership-checked in the LOGIC function per this session's own established
-- convention — it simply has no client caller yet. None of that changes here either.
--
-- THE ONE GENUINE FORK, AND HOW IT WAS RESOLVED
--
-- 0074's own header says a generated obligation's id must come from "the application,"
-- naming "a future scheduled job" as the eventual caller. The only two real background
-- jobs this codebase has ever built since (0162, 0169 — both ADR-0031 event consumers)
-- instead mint ids via platform.uuid_v7_at() *inside* a SECURITY DEFINER delegate, and
-- neither makes any external HTTP call — every real background job here today is pure
-- SQL, run by pg_cron with `set role`. Put to the user directly, as a genuine
-- architecture decision the frozen material did not resolve by itself: reuse the
-- pg_cron + SQL-side-mint precedent (0162/0169), or build a first-of-its-kind Vercel
-- Cron + external-JS mechanism to satisfy 0074's header literally. Decided: pg_cron +
-- SQL-side mint — treating a schedule becoming due as the same class of privileged,
-- system-initiated internal write those two consumers already make, not a per-request
-- write needing an application-supplied id the way a homeowner's own click does.
--
-- WHY THIS IS NOT SHAPED AS AN ADR-0031 EVENT CONSUMER, EVEN THOUGH IT REUSES ITS
-- PRIVILEGE MECHANICS
--
-- ADR-0031 governs consumers that read platform.events with a per-partition cursor and
-- dispatch on event_type. There is no event for "a maintenance schedule became due" —
-- due-ness is a function of the calendar (next_due_on <= current_date), not something
-- anything emits. ADR-0031's own "Makes harder" section names exactly this case: "A
-- consumer whose read pattern is not naturally expressible as 'the next batch of
-- events... in one hash partition'... does not fit this shape and needs its own
-- [rationale], not a workaround bolted onto this one." This migration takes that
-- literally: no cursor, no platform.consumer_cursors row, no hash-partition pruning —
-- a plain poll over work.maintenance_schedules. What IS reused, deliberately, because
-- it was verified against this exact hosting platform and nothing about that
-- verification is event-shaped: one dedicated low-privilege role; `set role` inside the
-- pg_cron job body (`cron.schedule_in_database`'s username parameter does not work on
-- this project's postgres role, and `set role` needs `grant ... with set true`, both
-- confirmed live by 0162 before this migration existed); no direct grant on any
-- aggregate table, ever, for the low-privilege role — only EXECUTE on one narrow
-- SECURITY DEFINER delegate that does the actual minting and writing as its owner.
--
-- IDEMPOTENCY AND RETRY, MADE EXPLICIT RATHER THAN ASSUMED
--
-- work.generate_due_obligation() is not silently idempotent — it raises
-- 'object_not_in_prerequisite_state' once a schedule's next_due_on has already advanced
-- past today, and a genuine duplicate id would hit the obligation table's own primary
-- key. Neither is a bug; both mean "already handled, not a real failure" to whatever
-- calls it. The generation delegate below therefore treats every schedule
-- independently, inside its own exception block (PL/pgSQL's implicit per-block
-- savepoint — the identical per-item isolation ADR-0031 item 4 describes for its own
-- consumer loop), and never lets one schedule's failure roll back another's success
-- within the same run. A schedule several periods behind is caught up gradually, one
-- period per successful daily run — never a burst loop minting several ids in one call,
-- which 0074's own header already rules out for a different, related reason (id
-- minting belongs to one call per obligation, not a function looping over several).
--
-- OBSERVABILITY: A NEW, NARROWLY-SHAPED LOG, NOT A REUSE OF platform.consumer_quarantine
--
-- consumer_quarantine is keyed (consumer_name, event_id) — genuinely event-shaped, and
-- forcing a schedule_id through that key would be the "workaround bolted onto this one"
-- ADR-0031 warns against, not a fit. work.maintenance_generation_log below is the
-- schedule-shaped equivalent: one row per attempt, success or failure, with the real
-- error text on failure — an operator's own real, queryable record of every run,
-- reached today the same way consumer_quarantine already is in practice (direct
-- database access), not a new client-facing screen this slice does not need.
--
-- TIME ZONE — WHY next_due_on <= current_date NEEDS NO PER-USER TIMEZONE CONCEPT
--
-- next_due_on is a plain, timezone-free date (0071); no per-user or per-workspace
-- timezone column exists anywhere in this schema, and the product is Belgium-only.
-- Belgium's own UTC offset (+1 winter, +2 summer) is always positive, so Belgian local
-- midnight always occurs BEFORE UTC midnight — by the time this database's own
-- UTC-default current_date rolls over, the Belgian calendar day has already started.
-- Any fixed daily UTC run time is therefore safely "at least as new" as the
-- corresponding Belgian calendar date; 03:00 UTC (chosen below) is comfortably clear of
-- that boundary either way, not a value that itself needed solving.

-- =========================================================================
-- 1 · WRITE DELEGATES — create/cancel a schedule, membership- and subject-checked

create or replace function work.create_maintenance_schedule_for_caller(
  p_schedule_id               uuid,
  p_workspace_id              uuid,
  p_asset_id                  uuid,
  p_location_id               uuid,
  p_title                     text,
  p_description               text,
  p_recurrence                interval,
  p_first_due_on              date,
  p_seed_obligation_id        uuid,
  p_schedule_event_id         uuid,
  p_seed_obligation_event_id  uuid,
  p_correlation_id            uuid,
  p_actor_type                platform.actor_type,
  p_actor_ref                 text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = p_workspace_id and m.role <> 'support'
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  if p_asset_id is not null and not exists (
    select 1 from property.assets a
    join property.properties p on p.id = a.property_id
    where a.id = p_asset_id and p.steward_workspace_id = p_workspace_id
  ) then
    raise exception
      'work.create_maintenance_schedule_for_caller: asset % is not stewarded by workspace %', p_asset_id, p_workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  if p_location_id is not null and not exists (
    select 1 from property.locations l
    join property.properties p on p.id = l.property_id
    where l.id = p_location_id and p.steward_workspace_id = p_workspace_id
  ) then
    raise exception
      'work.create_maintenance_schedule_for_caller: location % is not stewarded by workspace %', p_location_id, p_workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  perform work.create_maintenance_schedule(
    p_schedule_id     => p_schedule_id,
    p_workspace_id    => p_workspace_id,
    p_asset_id        => p_asset_id,
    p_location_id     => p_location_id,
    p_title           => p_title,
    p_description     => p_description,
    p_recurrence      => p_recurrence,
    p_first_due_on    => p_first_due_on,
    p_event_id        => p_schedule_event_id,
    p_correlation_id  => p_correlation_id,
    p_actor_type      => p_actor_type,
    p_actor_ref       => p_actor_ref
  );

  -- Immediate feedback, not a second generation system: if the very first occurrence is
  -- already due today (or the caller chose a start date in the past), seed it
  -- synchronously through the exact same work.generate_due_obligation() the nightly job
  -- calls — never duplicated logic. p_seed_obligation_id is always application-minted by
  -- the caller (this IS a genuine end-user request, unlike the nightly job below), even
  -- when it goes unused because the first occurrence is still in the future.
  if p_first_due_on <= current_date then
    perform work.generate_due_obligation(
      p_schedule_id     => p_schedule_id,
      p_obligation_id   => p_seed_obligation_id,
      p_event_id        => p_seed_obligation_event_id,
      p_correlation_id  => p_correlation_id,
      p_actor_type      => p_actor_type,
      p_actor_ref       => p_actor_ref
    );
  end if;
end;
$$;

comment on function work.create_maintenance_schedule_for_caller(uuid, uuid, uuid, uuid, text, text, interval, date, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Creates a recurring maintenance schedule for a caller with a live, non-support membership in the workspace, and refuses a given asset/location not stewarded by it. Seeds the first occurrence immediately, through the unmodified work.generate_due_obligation(), when p_first_due_on is already due — every later occurrence comes only from the nightly generation job below. Not SECURITY DEFINER, granted to nobody, reachable only from api.create_maintenance_schedule().';

create or replace function work.cancel_maintenance_schedule_for_caller(
  p_schedule_id     uuid,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id
  from work.maintenance_schedules
  where id = p_schedule_id;

  if v_workspace_id is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_workspace_id and m.role <> 'support'
  ) then
    raise exception
      'work.cancel_maintenance_schedule_for_caller: caller may not cancel schedule %', p_schedule_id
      using errcode = 'insufficient_privilege';
  end if;

  -- "Stop future reminders" only -- never touches any already-generated obligation.
  -- work.cancel_maintenance_schedule() itself is a one-way transition (0074's own
  -- comment: "a caller retrying blind does not silently succeed twice") -- unchanged.
  perform work.cancel_maintenance_schedule(p_schedule_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
end;
$$;

comment on function work.cancel_maintenance_schedule_for_caller(uuid, uuid, uuid, platform.actor_type, text) is
  'Stops a schedule from generating further obligations, for a caller with a live, non-support membership in its own workspace, resolved from the row before checking -- never trusting a co-supplied id. Never touches any already-generated obligation, on purpose: "stop future reminders" and "cancel this task" are two separate, independent actions in this schema (cancel_maintenance_schedule vs cancel_maintenance_obligation), never one inferred from the other.';

-- =========================================================================
-- 2 · API DELEGATES

create or replace function api.create_maintenance_schedule(
  p_schedule_id               uuid,
  p_workspace_id              uuid,
  p_asset_id                  uuid,
  p_location_id               uuid,
  p_title                     text,
  p_description               text,
  p_recurrence                interval,
  p_first_due_on              date,
  p_seed_obligation_id        uuid,
  p_schedule_event_id         uuid,
  p_seed_obligation_event_id  uuid,
  p_correlation_id            uuid,
  p_actor_type                platform.actor_type,
  p_actor_ref                 text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.create_maintenance_schedule_for_caller(
    p_schedule_id, p_workspace_id, p_asset_id, p_location_id, p_title, p_description,
    p_recurrence, p_first_due_on, p_seed_obligation_id, p_schedule_event_id,
    p_seed_obligation_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

comment on function api.create_maintenance_schedule(uuid, uuid, uuid, uuid, text, text, interval, date, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Delegate for work.create_maintenance_schedule_for_caller() (ADR-0026''s split). Creates a recurring maintenance schedule for a workspace the caller has a live membership in.';

create or replace function api.cancel_maintenance_schedule(
  p_schedule_id     uuid,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.cancel_maintenance_schedule_for_caller(p_schedule_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

comment on function api.cancel_maintenance_schedule(uuid, uuid, uuid, platform.actor_type, text) is
  'Delegate for work.cancel_maintenance_schedule_for_caller() (ADR-0026''s split). Stops future generation for a schedule the caller has a live membership in -- "stop future reminders," never affecting any already-generated obligation.';

-- =========================================================================
-- 3 · OBSERVABILITY — one row per generation attempt, success or failure

create table if not exists work.maintenance_generation_log (
  id              uuid        not null,
  schedule_id     uuid        not null
                  references work.maintenance_schedules (id),
  obligation_id   uuid        null,
  ran_at          timestamptz not null default now(),
  outcome         text        not null
                  check (outcome in ('generated', 'failed')),
  failure_reason  text        null,

  constraint maintenance_generation_log_pkey primary key (id),
  constraint maintenance_generation_log_failure_reason_required
    check ((outcome = 'failed') = (failure_reason is not null))
);

comment on table work.maintenance_generation_log is
  'One row per nightly generation attempt for a schedule, success or failure with the real error text -- the schedule-shaped equivalent of platform.consumer_quarantine (which is keyed by event_id and does not fit this domain). Written only from inside work.run_maintenance_schedule_generation(), never granted to any application role directly; read today the same way consumer_quarantine already is in practice -- direct database access, not a client-facing screen this slice does not need.';

alter table work.maintenance_generation_log enable row level security;
-- No policy: a background-work table no application role reaches directly, the same
-- posture 0024 established for consumer_cursors/consumer_quarantine. The absent policy
-- is the deny; the SECURITY DEFINER delegate below writes to it as its owner.

revoke all on work.maintenance_generation_log from anon, authenticated, service_role;

-- =========================================================================
-- 4 · THE GENERATION DELEGATE — SECURITY DEFINER, mints its own ids as its owner,
-- reached only by the dedicated scheduler role below

create or replace function work.run_maintenance_schedule_generation()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule_id    uuid;
  v_obligation_id  uuid;
  v_event_id       uuid;
  v_correlation_id uuid;
  v_log_id         uuid;
begin
  for v_schedule_id in
    select id from work.maintenance_schedules
    where active and next_due_on <= current_date
    order by next_due_on
  loop
    begin
      v_obligation_id := platform.uuid_v7_at(now());
      v_event_id := platform.uuid_v7_at(now());
      v_correlation_id := platform.uuid_v7_at(now());

      perform work.generate_due_obligation(
        p_schedule_id     => v_schedule_id,
        p_obligation_id   => v_obligation_id,
        p_event_id        => v_event_id,
        p_correlation_id  => v_correlation_id,
        p_actor_type      => 'system',
        p_actor_ref       => 'maintenance_schedule_generator'
      );

      v_log_id := platform.uuid_v7_at(now());
      insert into work.maintenance_generation_log (id, schedule_id, obligation_id, outcome)
      values (v_log_id, v_schedule_id, v_obligation_id, 'generated');
    exception when others then
      -- One bad schedule never halts the batch (ADR-0031 item 4's own per-item
      -- isolation, translated from "per event" to "per schedule"). A "not due"/
      -- duplicate-id error here would mean a genuine bug in the selection predicate
      -- above, not a real operational failure -- still logged, never silently dropped.
      v_log_id := platform.uuid_v7_at(now());
      insert into work.maintenance_generation_log (id, schedule_id, outcome, failure_reason)
      values (v_log_id, v_schedule_id, 'failed', sqlerrm);
    end;
  end loop;
end;
$$;

comment on function work.run_maintenance_schedule_generation() is
  'Generates one obligation for every schedule due today, one call to the unmodified work.generate_due_obligation() per schedule -- never a burst loop for a single schedule several periods behind (0074''s own header: one id, one call, one caller decision). Each schedule processed inside its own exception block; a failure is logged to work.maintenance_generation_log and does not affect any other schedule in the same run. SECURITY DEFINER: mints its own ids via platform.uuid_v7_at() as its owner, the same privileged-internal-write shape workspace.grant_engagement_access() (0162) and the notification producer (0169) already established for this codebase''s only two real background jobs. Reached only by klussie_scheduler_maintenance via `select`, never directly by any application role.';

revoke all on function work.run_maintenance_schedule_generation() from public, anon, authenticated, service_role;

-- =========================================================================
-- 5 · THE SCHEDULER ROLE AND ITS CRON JOB
--
-- Verified live against this project by 0162 before this migration existed (see this
-- migration's own header): `set role` inside the job body, never
-- `cron.schedule_in_database`'s `username` parameter, and a role can only extend `set`
-- onto a role it administers via an explicit `with set true` grant to itself.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'klussie_scheduler_maintenance') then
    create role klussie_scheduler_maintenance nologin;
  end if;
end;
$$;

comment on role klussie_scheduler_maintenance is
  'Background job: generates due maintenance obligations from active recurring schedules (Recurring Maintenance Activation slice). No direct grant on any aggregate table -- reaches work.run_maintenance_schedule_generation() alone, which does the actual privileged read/write/mint as its own owner.';

grant klussie_scheduler_maintenance to postgres with set true;

grant usage on schema work to klussie_scheduler_maintenance;
grant execute on function work.run_maintenance_schedule_generation() to klussie_scheduler_maintenance;

-- cron.schedule() upserts by job name (pg_cron >= 1.4) -- safe to run this migration
-- again. 03:00 UTC: comfortably clear of the Belgian local midnight boundary either way
-- (this migration's own header explains why no per-user timezone concept is needed at
-- all here), and outside this project's own peak traffic hours.
select cron.schedule(
  'maintenance-schedule-generation',
  '0 3 * * *',
  $job$set role klussie_scheduler_maintenance; select work.run_maintenance_schedule_generation(); reset role;$job$
);

-- =========================================================================
-- 6 · ACCESS — the two new api.* delegates, explicit revokes verified rather than
-- assumed (ADR-0026 property 4)

revoke all on function work.create_maintenance_schedule_for_caller(uuid, uuid, uuid, uuid, text, text, interval, date, uuid, uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.cancel_maintenance_schedule_for_caller(uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;

revoke all on function api.create_maintenance_schedule(uuid, uuid, uuid, uuid, text, text, interval, date, uuid, uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, service_role;
grant execute on function api.create_maintenance_schedule(uuid, uuid, uuid, uuid, text, text, interval, date, uuid, uuid, uuid, uuid, platform.actor_type, text)
  to authenticated;

revoke all on function api.cancel_maintenance_schedule(uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, service_role;
grant execute on function api.cancel_maintenance_schedule(uuid, uuid, uuid, platform.actor_type, text)
  to authenticated;
