-- Slice 5, WP 5.0 — the Trust & Safety engine: a new schema, its first real tables, and
-- a full read/write contract. See SLICE_5_TRUST_SAFETY_ACTIVATION.md §3/§4 for the
-- product reasoning this migration implements.
--
-- THE FIRST NEW ENGINE-OWNING SCHEMA SINCE THE ORIGINAL TEN — CHECKED DIRECTLY, NOT
-- ASSUMED
--
-- Every schema this codebase has ever had was created once, together, in 0018 — checked
-- directly (`grep -n "create schema" supabase/migrations/*.sql` finds only 0018 and the
-- `api` schema, added later in 0031 for a stated, different reason: "not a separate work
-- package, it is part of delivering this one," ADR-0026). No engine since has ever
-- needed a schema of its own that 0018 did not already pre-plan. `safety` is the first —
-- Trust & Safety is a genuinely distinct bounded aggregate (a report becomes a case, a
-- case accumulates decisions), the same class of thing `work`/`property`/`commerce`
-- already are, not a corner of an existing one. Follows the exact bootstrap 0018/0019
-- did once for the original ten: a schema, a `klussie_engine_safety` role, USAGE plus
-- default privileges so every future table here is automatically readable/insertable by
-- its own engine without a later migration having to remember.
--
-- WHY klussie_engine_safety's OWN GRANTS ARE VESTIGIAL FOR THIS MIGRATION'S OWN
-- FUNCTIONS — CONSISTENCY, NOT DEAD WEIGHT
--
-- Checked directly: no migration in this codebase's history ever runs `set role
-- klussie_engine_*` — only the `klussie_consumer_*` roles are ever actually assumed at
-- runtime (via pg_cron's own `set role`, WP 2.4/4.1's own pattern). Every `klussie_engine_*`
-- role instead exists as a stable grant TARGET — the identity a cross-schema grant names
-- when a future engine legitimately needs to reach this one, and the schema's own
-- consistent ownership identity — established ahead of need the same way
-- `klussie_engine_knowledge`/`klussie_engine_commerce` existed in 0019 long before either
-- engine had a single table. The four functions below all run as `postgres` regardless
-- (reached through a SECURITY DEFINER `api.*` delegate, whose own elevation is inherited
-- by every plain function it calls beneath it — see the two `_for_caller` functions' own
-- comments), so `klussie_engine_safety`'s own grants are not load-bearing for this
-- migration's own code paths. They are still granted, matching every prior schema's own
-- bootstrap exactly.
--
-- REPORT AND CASE ARE THE SAME ROW — NO SEPARATE MERGE MODEL, DELIBERATELY
--
-- `ROADMAP_C_PLATFORM_OPERATIONS.md` §3.3's own language ("each report opens into a case
-- view") does not require a many-reports-to-one-case model, and nothing in this
-- codebase's real data suggests duplicate reports are common enough to need one yet.
-- `safety.cases` is the one table; a future many-to-one merge is real, separable future
-- work if it turns out to be needed; the row's own `id` already survives becoming that
-- table's own foreign key if it ever exists.
--
-- reported_workspace_id, NOT reported_person_id — THE REAL FIX OVER LEGACY'S OWN GAP
--
-- `public.reports.pro_id` (legacy, 0004) names a person. An enforcement action acts on a
-- workspace (`workspace.withdraw_capability()`, §2.2 of the scoping doc) — this table
-- names one from the start, the concrete reason legacy could never have grown an
-- enforcement action onto itself without first fixing this.
--
-- safety.record_decision_for_caller() CALLS workspace.withdraw_capability() DIRECTLY —
-- NO NEW WRAPPER IN workspace NEEDED, VERIFIED AGAINST THIS CODEBASE'S OWN SECURITY MODEL
--
-- `workspace.withdraw_capability()` (0079) is plain SQL/PL/pgSQL, no SECURITY DEFINER of
-- its own, granted only to `klussie_engine_workspace` — a direct call from
-- `klussie_engine_safety` would fail on EXECUTE privilege alone. But
-- `safety.record_decision_for_caller()` below is reached through `api.record_decision()`
-- (SECURITY DEFINER, owned by postgres) — the same "outer SECURITY DEFINER elevation is
-- inherited by every plain function nested beneath it" mechanism
-- `platform.mark_notification_seen_for_caller()` (0166) already relies on for its own
-- nested `perform platform.mark_notification_seen(...)` call. By the time
-- `record_decision_for_caller()`'s own body runs, the effective role is already
-- `postgres` — which owns `workspace.withdraw_capability()` (ownership bypasses ACL) and
-- needs no additional grant to call it, matching `workspace.grant_engagement_access()`'s
-- own precedent (0162) of freely reading `property.assets`/`work.requests` with zero new
-- grants added for those specific reads.
--
-- EVERY ID IS CLIENT-MINTED, NOT SERVER-MINTED — ADR-0022, MATCHING becomePro()'s OWN
-- PRECEDENT, NOT WP 2.4/4.1's CONSUMER PATTERN
--
-- A real question this migration had to resolve: since the effective role throughout
-- both `_for_caller` functions below is `postgres` (per the point above), each COULD
-- technically call `platform.uuid_v7_at()` internally to mint its own ids, the same way
-- `workspace.grant_engagement_access()` does. It does not, deliberately: that function is
-- a background CONSUMER with no live "application" in the loop to ask instead. Filing a
-- case and recording a decision are both real-time, human-initiated actions — the
-- browser IS "the application" ADR-0022 means, exactly the shape `becomePro()`
-- (`auth.jsx`) already established: every id `file_case_for_caller()`/
-- `record_decision_for_caller()` needs is a parameter, minted client-side with
-- `uuidv7()`, never generated inside this migration.
--
-- 'under_review' IS NOT A STATUS — A DELIBERATE SIMPLIFICATION, NOT AN OVERSIGHT
--
-- Legacy's own three-state `status` included it; this migration's four states
-- (`open`/`escalated`/`resolved`, see the CHECK constraint) do not. A "claim/assign"
-- step implies case ownership among multiple operators — exactly the "operator roles,
-- plural" question `ROADMAP_C` §6 states is still genuinely open (this scoping doc's own
-- §2.4). Until that exists, every operator sees the same queue and any of them may act;
-- a case moves only when a real decision is recorded against it, never by being merely
-- opened. `resolved` is reachable from `escalated` too (a follow-up decision on an
-- already-escalated case) — refused only from `resolved` itself, which this migration
-- treats as terminal for v1.

-- =========================================================================
-- 1 · THE ENGINE — schema, role, ownership

create schema if not exists safety;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'klussie_engine_safety') then
    create role klussie_engine_safety nologin;
  end if;
end;
$$;

comment on role klussie_engine_safety is 'Trust & Safety engine. Owns schema safety.';

grant usage on schema safety to klussie_engine_safety;
alter default privileges for role postgres in schema safety grant select, insert on tables to klussie_engine_safety;
alter default privileges for role postgres in schema safety grant usage, select on sequences to klussie_engine_safety;

-- =========================================================================
-- 2 · TABLES

create table if not exists safety.cases (
  id                      uuid        not null,

  reporter_person_ref     uuid        not null,
  reported_workspace_id   uuid        not null
                          references workspace.workspaces (id),

  category                text        not null,
  details                 text        null,

  -- The request/engagement/service-record this case concerns, when there is one — the
  -- same polymorphic reference shape platform.notifications already uses. Nullable: a
  -- report is not always about one specific job.
  subject_type            text        null,
  subject_id              uuid        null,

  status                  text        not null default 'open'
                          check (status in ('open', 'escalated', 'resolved')),

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint cases_pkey primary key (id),
  constraint cases_subject_pair check ((subject_type is null) = (subject_id is null))
);

comment on table safety.cases is
  'A filed report, which IS the case from the moment it exists (WP 5.0) — no separate report/case split, no many-reports-to-one-case merge model in v1. reported_workspace_id (not a person) is the real fix over legacy public.reports.pro_id: an enforcement action acts on a workspace.';
comment on column safety.cases.reporter_person_ref is
  'Durable reference (identity.identities.person_ref), no foreign key — matches every other person-keyed column in this codebase since Epic 03.';
comment on column safety.cases.status is
  'Three states, not legacy''s four — no under_review: case ownership among multiple operators is real, separable future work ("operator roles, plural," ROADMAP_C §6, still an open question). A case moves only when a real decision is recorded.';

create index if not exists cases_reported_workspace_idx on safety.cases (reported_workspace_id);
create index if not exists cases_open_status_idx on safety.cases (status) where status in ('open', 'escalated');

grant update on safety.cases to klussie_engine_safety;

create table if not exists safety.decisions (
  id                    uuid        not null,
  case_id               uuid        not null
                        references safety.cases (id),

  operator_person_ref   uuid        not null,
  action                text        not null
                        check (action in ('warn', 'suspend', 'escalate', 'close_no_action')),
  reason                text        null,

  -- Set only when action = 'suspend' — which real capability workspace.withdraw_capability()
  -- was called for. Null for every other action, enforced below.
  capability_key        text        null,

  decided_at            timestamptz not null default now(),

  constraint decisions_pkey primary key (id),
  constraint decisions_capability_key_only_on_suspend check (
    (action = 'suspend' and capability_key is not null) or
    (action <> 'suspend' and capability_key is null)
  )
);

comment on table safety.decisions is
  'Append-only decision history per case (WP 5.0) — one row per operator action, never a single mutable "current decision" column, matching the workflow-transition/audit-log append-only pattern already established everywhere else in this codebase. A suspend decision is the one that actually calls workspace.withdraw_capability(); see record_decision_for_caller()''s own comment below.';

create index if not exists decisions_case_idx on safety.decisions (case_id);

alter table safety.cases enable row level security;
alter table safety.decisions enable row level security;

-- No policy on either — the identical posture every engine schema in this codebase
-- holds: reachable only through the api.* delegates below, never a direct client grant.
revoke all on safety.cases from anon, authenticated, service_role;
revoke all on safety.decisions from anon, authenticated, service_role;

-- =========================================================================
-- 3 · WRITE CONTRACT — the two _for_caller functions. Neither is SECURITY DEFINER
-- itself; both run as postgres because both are reached only through a SECURITY
-- DEFINER api.* delegate (§4 below) — see this migration's own header for why that
-- makes the nested workspace.withdraw_capability() call work with no new grant.

create or replace function safety.file_case_for_caller(
  p_case_id                uuid,
  p_reported_workspace_id  uuid,
  p_category               text,
  p_details                text,
  p_subject_type           text,
  p_subject_id             uuid,
  p_event_id               uuid,
  p_correlation_id         uuid,
  p_actor_type             platform.actor_type,
  p_actor_ref              text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_reporter_person_ref  uuid;
  v_has_relationship     boolean;
begin
  select i.person_ref into v_reporter_person_ref
  from identity.identities i
  where i.auth_user_id = auth.uid() and i.erased_at is null;

  if v_reporter_person_ref is null then
    raise exception
      'safety.file_case_for_caller: caller has no resolvable identity'
      using errcode = 'insufficient_privilege';
  end if;

  -- Real relationship required — not an anonymous, unrelated report. Matches
  -- ROADMAP_C §5.1's own journey title ("a customer reports a professional"): the
  -- reporter's own workspace must have a real engagement with the reported one, as the
  -- requesting side.
  select exists (
    select 1
    from work.engagements e
    join workspace.memberships m on m.workspace_id = e.requesting_workspace_id
    where m.person_ref = v_reporter_person_ref
      and m.state = 'active'
      and e.performing_workspace_id = p_reported_workspace_id
  ) into v_has_relationship;

  if not v_has_relationship then
    raise exception
      'safety.file_case_for_caller: caller has no real engagement with workspace %', p_reported_workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  insert into safety.cases (
    id, reporter_person_ref, reported_workspace_id, category, details,
    subject_type, subject_id, status, created_at, updated_at
  ) values (
    p_case_id, v_reporter_person_ref, p_reported_workspace_id, p_category, p_details,
    p_subject_type, p_subject_id, 'open', now(), now()
  );

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'safety.case.filed',
    p_workspace_id   => p_reported_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'case',
    p_subject_id     => p_case_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('category', p_category)
  );
end;
$$;

comment on function safety.file_case_for_caller(uuid, uuid, text, text, text, uuid, uuid, uuid, platform.actor_type, text) is
  'Real caller check: the reporter''s own identity must resolve from auth.uid(), and their own workspace must hold a real engagement with the reported workspace. Not SECURITY DEFINER, granted to nobody, reachable only from api.file_case().';

create or replace function safety.record_decision_for_caller(
  p_decision_id            uuid,
  p_case_id                uuid,
  p_action                 text,
  p_reason                 text,
  p_capability_key         text,
  p_withdrawal_history_id  uuid,
  p_withdrawal_event_id    uuid,
  p_decided_event_id       uuid,
  p_correlation_id         uuid,
  p_actor_type             platform.actor_type,
  p_actor_ref              text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_operator_person_ref   uuid;
  v_reported_workspace_id uuid;
  v_status                text;
begin
  select i.person_ref into v_operator_person_ref
  from identity.identities i
  where i.auth_user_id = auth.uid() and i.erased_at is null;

  if v_operator_person_ref is null then
    raise exception
      'safety.record_decision_for_caller: caller has no resolvable identity'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from workspace.current_memberships() m
    where workspace.workspace_has_capability(m.workspace_id, 'platform_operations')
  ) then
    raise exception
      'safety.record_decision_for_caller: caller does not hold platform_operations'
      using errcode = 'insufficient_privilege';
  end if;

  select reported_workspace_id, status into v_reported_workspace_id, v_status
  from safety.cases
  where id = p_case_id;

  if v_reported_workspace_id is null then
    raise exception
      'safety.record_decision_for_caller: case % does not exist', p_case_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if v_status = 'resolved' then
    raise exception
      'safety.record_decision_for_caller: case % is already resolved', p_case_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  insert into safety.decisions (id, case_id, operator_person_ref, action, reason, capability_key, decided_at)
  values (p_decision_id, p_case_id, v_operator_person_ref, p_action, p_reason, p_capability_key, now());

  update safety.cases
  set status = case when p_action = 'escalate' then 'escalated' else 'resolved' end,
      updated_at = now()
  where id = p_case_id;

  -- The one privileged cross-engine write this function performs — see this migration's
  -- own header for why no new grant or wrapper is needed to reach it from here.
  if p_action = 'suspend' then
    perform workspace.withdraw_capability(
      p_workspace_id   => v_reported_workspace_id,
      p_capability_key => p_capability_key,
      p_history_id     => p_withdrawal_history_id,
      p_event_id       => p_withdrawal_event_id,
      p_correlation_id => p_correlation_id,
      p_actor_type     => p_actor_type,
      p_actor_ref      => p_actor_ref
    );
  end if;

  perform platform.emit_event(
    p_event_id       => p_decided_event_id,
    p_event_type     => 'safety.case.decided',
    p_workspace_id   => v_reported_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'case',
    p_subject_id     => p_case_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('action', p_action, 'capabilityKey', p_capability_key)
  );
end;
$$;

comment on function safety.record_decision_for_caller(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Real caller check: the operator''s own identity must resolve from auth.uid(), and their own active workspace must hold platform_operations (workspace.my_workspace_has_capability()''s own composed EXISTS shape, 0134). Refuses a case that does not exist or is already resolved. Calls workspace.withdraw_capability() directly when action = ''suspend'' — see this migration''s own header. Not SECURITY DEFINER, granted to nobody, reachable only from api.record_decision().';

revoke all on function safety.file_case_for_caller(uuid, uuid, text, text, text, uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function safety.record_decision_for_caller(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;

-- =========================================================================
-- 4 · READ CONTRACT — the operator-only queue and case detail. Same composed EXISTS
-- check 0133's list_audit_records() and 0138's search_workspaces() both already
-- established: zero rows for a non-operator caller, never a raised exception, matching
-- every other engine's own read-switch pattern.

create or replace function safety.trust_safety_queue_for_caller(p_limit integer default 50, p_offset integer default 0)
returns table (
  case_id                  uuid,
  reporter_name            text,
  reported_workspace_id    uuid,
  reported_workspace_name  text,
  category                 text,
  status                   text,
  created_at               timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    c.id, reporter.full_name, c.reported_workspace_id, w.name, c.category, c.status, c.created_at
  from safety.cases c
  join workspace.workspaces w on w.id = c.reported_workspace_id
  left join identity.identities reporter
    on reporter.person_ref = c.reporter_person_ref and reporter.erased_at is null
  where exists (
    select 1 from workspace.current_memberships() m
    where workspace.workspace_has_capability(m.workspace_id, 'platform_operations')
  )
  and c.status in ('open', 'escalated')
  order by c.created_at asc
  limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function safety.trust_safety_queue_for_caller(integer, integer) is
  'The triage queue (WP 5.0/5.2): every open or escalated case, oldest first, restricted to callers holding platform_operations — the same composed EXISTS check list_audit_records()/search_workspaces() already established. Resolved cases do not appear here; case_detail_for_caller() reaches them by id. No SECURITY DEFINER of its own; reached only through api.trust_safety_queue().';

create or replace function safety.case_detail_for_caller(p_case_id uuid)
returns table (
  case_id                  uuid,
  reporter_name            text,
  reported_workspace_id    uuid,
  reported_workspace_name  text,
  category                 text,
  details                  text,
  subject_type             text,
  subject_id               uuid,
  status                   text,
  created_at               timestamptz,
  decisions                jsonb
)
language sql
stable
set search_path = ''
as $$
  select
    c.id, reporter.full_name, c.reported_workspace_id, w.name, c.category, c.details,
    c.subject_type, c.subject_id, c.status, c.created_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'operatorName', op.full_name,
        'action', d.action,
        'reason', d.reason,
        'capabilityKey', d.capability_key,
        'decidedAt', d.decided_at
      ) order by d.decided_at asc)
      from safety.decisions d
      left join identity.identities op on op.person_ref = d.operator_person_ref and op.erased_at is null
      where d.case_id = c.id
    ), '[]'::jsonb)
  from safety.cases c
  join workspace.workspaces w on w.id = c.reported_workspace_id
  left join identity.identities reporter
    on reporter.person_ref = c.reporter_person_ref and reporter.erased_at is null
  where c.id = p_case_id
  and exists (
    select 1 from workspace.current_memberships() m
    where workspace.workspace_has_capability(m.workspace_id, 'platform_operations')
  );
$$;

comment on function safety.case_detail_for_caller(uuid) is
  'One case in full, including its own append-only decision history as a jsonb array (WP 5.0/5.2) — no separate round trip for decisions. subject_type/subject_id are exposed, not resolved into evidence here: the client fetches the relevant conversation/service record/documents through their own existing, already-correct read paths, the same "compose at read time, never duplicate" principle platform.my_inbox() and property.locations_for_property() already use. No SECURITY DEFINER of its own; reached only through api.case_detail().';

revoke all on function safety.trust_safety_queue_for_caller(integer, integer) from public, anon, authenticated, service_role;
revoke all on function safety.case_detail_for_caller(uuid) from public, anon, authenticated, service_role;

-- =========================================================================
-- 5 · api.* DELEGATES — thin SECURITY DEFINER pass-throughs, matching every prior
-- contract this programme has built.

create or replace function api.file_case(
  p_case_id                uuid,
  p_reported_workspace_id  uuid,
  p_category               text,
  p_details                text,
  p_subject_type           text,
  p_subject_id             uuid,
  p_event_id               uuid,
  p_correlation_id         uuid,
  p_actor_type             platform.actor_type,
  p_actor_ref              text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select safety.file_case_for_caller(
    p_case_id, p_reported_workspace_id, p_category, p_details, p_subject_type, p_subject_id,
    p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

comment on function api.file_case(uuid, uuid, text, text, text, uuid, uuid, uuid, platform.actor_type, text) is
  'Delegate for safety.file_case_for_caller() (WP 5.0). The real, reachable path ReportSheet.jsx cuts over to (WP 5.1).';

create or replace function api.record_decision(
  p_decision_id            uuid,
  p_case_id                uuid,
  p_action                 text,
  p_reason                 text,
  p_capability_key         text,
  p_withdrawal_history_id  uuid,
  p_withdrawal_event_id    uuid,
  p_decided_event_id       uuid,
  p_correlation_id         uuid,
  p_actor_type             platform.actor_type,
  p_actor_ref              text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select safety.record_decision_for_caller(
    p_decision_id, p_case_id, p_action, p_reason, p_capability_key,
    p_withdrawal_history_id, p_withdrawal_event_id, p_decided_event_id,
    p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

comment on function api.record_decision(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Delegate for safety.record_decision_for_caller() (WP 5.0). The operator''s own warn/suspend/escalate/close_no_action action.';

create or replace function api.trust_safety_queue(p_limit integer default 50, p_offset integer default 0)
returns table (
  case_id                  uuid,
  reporter_name            text,
  reported_workspace_id    uuid,
  reported_workspace_name  text,
  category                 text,
  status                   text,
  created_at               timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from safety.trust_safety_queue_for_caller(p_limit, p_offset);
$$;

comment on function api.trust_safety_queue(integer, integer) is
  'Delegate for safety.trust_safety_queue_for_caller() (WP 5.0). The Operator''s own Trust & Safety tab (WP 5.2).';

create or replace function api.case_detail(p_case_id uuid)
returns table (
  case_id                  uuid,
  reporter_name            text,
  reported_workspace_id    uuid,
  reported_workspace_name  text,
  category                 text,
  details                  text,
  subject_type             text,
  subject_id               uuid,
  status                   text,
  created_at               timestamptz,
  decisions                jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from safety.case_detail_for_caller(p_case_id);
$$;

comment on function api.case_detail(uuid) is
  'Delegate for safety.case_detail_for_caller() (WP 5.0).';

revoke all on function api.file_case(uuid, uuid, text, text, text, uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.record_decision(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.trust_safety_queue(integer, integer) from public, anon, service_role;
revoke all on function api.case_detail(uuid) from public, anon, service_role;

grant execute on function api.file_case(uuid, uuid, text, text, text, uuid, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.record_decision(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.trust_safety_queue(integer, integer) to authenticated;
grant execute on function api.case_detail(uuid) to authenticated;

-- =========================================================================
-- 6 · authenticated GAINS NO NEW TABLE GRANTS — the same posture as every other engine's
-- own contract migration in this programme. safety.cases/safety.decisions keep RLS
-- enabled, no policy — correct now, not a gap: no caller ever reaches those tables
-- except through this contract's own already-checked functions.
