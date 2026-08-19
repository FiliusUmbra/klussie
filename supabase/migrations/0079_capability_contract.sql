-- Epic 04 WP05 — the capability engine contract: grant, withdraw, and read what a
-- workspace holds.
--
-- event_type CORRECTED TO ADR-0019's OWN FORMAT — FOUND DURING EPIC 15
--
-- ADR-0019 requires `event_type` as `<engine>.<aggregate>.<past-participle>`, enforced by
-- platform.events' own `events_type_format` check (0021). Both calls below used a bare
-- PascalCase name, conflating SYSTEM_ARCHITECTURE.md §6.3's own CONCEPTUAL event names
-- with the literal serialized column value — a mistake caught session-wide while building
-- Epic 15's own diagnostic (`implementation/epic-15/COMPLETION.md` §6). Corrected: engine
-- = capability (§6.3's own section); aggregate = capability_grant, not bare "capability"
-- — §3's own aggregate-ownership table names the aggregate this engine owns as "Capability
-- grant," and `subject_id` on both events is already the grant's own id, not the
-- catalogue capability's. `CapabilityGranted` -> `capability.capability_grant.granted`;
-- `CapabilityWithdrawn` -> `capability.capability_grant.withdrawn`.
--
-- NO api.* DELEGATE — property.reparent_location()'s PRECEDENT, NOW A FOURTH TIME
--
-- No client caller exists yet — nothing in the current product checks a capability
-- anywhere, and wiring live capability checks into the request-context resolution
-- already used everywhere (workspace.current_memberships()) is a separate, larger,
-- riskier change than this epic's own scope, the same restraint that kept Epic 09 and
-- Epic 10 from wiring their own engines into anything live. All four functions below are
-- granted to klussie_engine_workspace only.
--
-- GRANT DOES NOT AUTO-CASCADE ITS DEPENDENCIES — IT REFUSES THEIR ABSENCE, THE SAME
-- DISTINGUISHING TEST CONFLICT 3 GAVE THE WORKFLOW ENGINE
--
-- §6.2: "granting a capability grants what it requires." The tempting reading is
-- auto-cascading: grant Preventive Maintenance, and the function walks the dependency
-- graph minting grant rows for Maintenance Planning, Asset Management and Property
-- Management too — up to four new rows, four new grant ids, four new history ids, four
-- new event ids, none of which the caller necessarily supplied. That is exactly the
-- shape work.generate_due_obligation() (Epic 10) already ruled out: ADR-0022 puts
-- runtime identifier generation in the application, and a function minting several ids
-- per call to satisfy a dependency chain is runtime generation happening in the
-- database. workspace.grant_capability() instead refuses to grant a capability whose
-- dependencies are not already held — Conflict 3's "does this trigger make a decision,
-- or refuse an impossibility?" applied a third time (after Workflow's transition rules
-- and Maintenance's schedule generation) to a third kind of impossibility. The caller —
-- WP 04.06's backfill, or any future real caller — grants a workspace's capabilities in
-- dependency order, one call per capability, each with its own real identifiers.
--
-- WITHDRAW ENFORCES THE MIRROR RULE THE SAME WAY: A DEPENDENT HELD CAPABILITY BLOCKS IT
--
-- §6.2: "a capability cannot be withdrawn while something that depends on it is still
-- held." workspace.withdraw_capability() checks this directly against the workspace's
-- own currently-held set before touching anything, and names the blocking capability in
-- the error rather than a bare constraint failure.
--
-- "AT MOST ONE HELD GRANT PER (WORKSPACE, CAPABILITY)" IS A CONTRACT INVARIANT, NOT A
-- DATABASE CONSTRAINT
--
-- 0077's own header explains why capability_grants has no unique index on (workspace_id,
-- capability_key) — a withdrawn-then-regranted capability is a new row, the same shape
-- workspace.memberships allows for re-joining. grant_capability() enforces "not already
-- held" itself, at the only path that can create a new row, which is sufficient: the
-- invariant holds because the contract is the only writer, the same posture every
-- write-only-through-the-contract table in this schema already relies on.

-- =========================================================================
-- THE LOGIC — grant

create or replace function workspace.grant_capability(
  p_grant_id        uuid,
  p_history_id      uuid,
  p_workspace_id    uuid,
  p_capability_key  text,
  p_source          text,
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
  v_missing_dependency text;
begin
  if exists (
    select 1 from workspace.capability_grants
    where workspace_id = p_workspace_id
      and capability_key = p_capability_key
      and withdrawn_at is null
  ) then
    raise exception
      'workspace.grant_capability: workspace % already holds %', p_workspace_id, p_capability_key
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  select cd.requires_capability_key into v_missing_dependency
  from platform.capability_dependencies cd
  where cd.capability_key = p_capability_key
    and not exists (
      select 1 from workspace.capability_grants g
      where g.workspace_id = p_workspace_id
        and g.capability_key = cd.requires_capability_key
        and g.withdrawn_at is null
    )
  limit 1;

  if v_missing_dependency is not null then
    raise exception
      'workspace.grant_capability: % requires % first, and workspace % does not hold it', p_capability_key, v_missing_dependency, p_workspace_id
      using
        hint = 'Grant the dependency first — this function never grants more than the one capability requested (see this migration''s own header).',
        errcode = 'object_not_in_prerequisite_state';
  end if;

  insert into workspace.capability_grants (id, workspace_id, capability_key, source, granted_at)
  values (p_grant_id, p_workspace_id, p_capability_key, p_source, now());

  insert into workspace.capability_grant_history
    (id, grant_id, workspace_id, capability_key, source, granted_at, withdrawn_at)
  select p_history_id, id, workspace_id, capability_key, source, granted_at, withdrawn_at
  from workspace.capability_grants
  where id = p_grant_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'capability.capability_grant.granted',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'capability',
    p_subject_id     => p_grant_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('capabilityKey', p_capability_key, 'source', p_source)
  );
end;
$$;

comment on function workspace.grant_capability(uuid, uuid, uuid, text, text, uuid, uuid, platform.actor_type, text) is
  'Grants exactly one capability. Refuses (does not auto-grant) if any of its dependencies is not already held, and refuses if already held — never a silent no-op. See this migration''s own header for why it does not cascade.';

-- =========================================================================
-- THE LOGIC — withdraw

create or replace function workspace.withdraw_capability(
  p_workspace_id     uuid,
  p_capability_key   text,
  p_history_id       uuid,
  p_event_id         uuid,
  p_correlation_id   uuid,
  p_actor_type       platform.actor_type,
  p_actor_ref        text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_grant_id      uuid;
  v_source        text;
  v_granted_at    timestamptz;
  v_blocking_key  text;
begin
  select id, source, granted_at into v_grant_id, v_source, v_granted_at
  from workspace.capability_grants
  where workspace_id = p_workspace_id
    and capability_key = p_capability_key
    and withdrawn_at is null;

  if v_grant_id is null then
    raise exception
      'workspace.withdraw_capability: workspace % does not currently hold %', p_workspace_id, p_capability_key
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  select cd.capability_key into v_blocking_key
  from platform.capability_dependencies cd
  where cd.requires_capability_key = p_capability_key
    and exists (
      select 1 from workspace.capability_grants g
      where g.workspace_id = p_workspace_id
        and g.capability_key = cd.capability_key
        and g.withdrawn_at is null
    )
  limit 1;

  if v_blocking_key is not null then
    raise exception
      'workspace.withdraw_capability: cannot withdraw % — workspace % still holds %, which requires it', p_capability_key, p_workspace_id, v_blocking_key
      using
        hint = 'Withdraw the dependent capability first (§6.2: "a capability cannot be withdrawn while something that depends on it is still held").',
        errcode = 'object_not_in_prerequisite_state';
  end if;

  update workspace.capability_grants
  set withdrawn_at = now()
  where id = v_grant_id;

  insert into workspace.capability_grant_history
    (id, grant_id, workspace_id, capability_key, source, granted_at, withdrawn_at)
  select p_history_id, id, workspace_id, capability_key, source, granted_at, withdrawn_at
  from workspace.capability_grants
  where id = v_grant_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'capability.capability_grant.withdrawn',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'capability',
    p_subject_id     => v_grant_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('capabilityKey', p_capability_key)
  );
end;
$$;

comment on function workspace.withdraw_capability(uuid, text, uuid, uuid, uuid, platform.actor_type, text) is
  '§11: "Withdrawal removes behaviour and never data." This function removes the grant, nothing else — no feature''s data is touched here, by construction, since this table only ever recorded that the capability was enabled. Refuses if a held capability still depends on the one being withdrawn.';

-- =========================================================================
-- THE LOGIC — reads

create or replace function workspace.workspace_capabilities(p_workspace_id uuid)
returns table (capability_key text, source text, granted_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select g.capability_key, g.source, g.granted_at
  from workspace.capability_grants g
  where g.workspace_id = p_workspace_id
    and g.withdrawn_at is null;
$$;

comment on function workspace.workspace_capabilities(uuid) is
  'Every capability a workspace currently holds. No client caller yet — see this migration''s own header.';

create or replace function workspace.workspace_has_capability(p_workspace_id uuid, p_capability_key text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from workspace.capability_grants g
    where g.workspace_id = p_workspace_id
      and g.capability_key = p_capability_key
      and g.withdrawn_at is null
  );
$$;

comment on function workspace.workspace_has_capability(uuid, text) is
  'The capability gate itself (§6.2: "is this behaviour available in this workspace at all?"). No caller yet checks it — every feature in the current product predates this engine.';

-- =========================================================================
-- ACCESS

revoke all on function workspace.grant_capability(uuid, uuid, uuid, text, text, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function workspace.withdraw_capability(uuid, text, uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function workspace.workspace_capabilities(uuid)
  from public, anon, authenticated, service_role;
revoke all on function workspace.workspace_has_capability(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function workspace.grant_capability(uuid, uuid, uuid, text, text, uuid, uuid, platform.actor_type, text)
  to klussie_engine_workspace;
grant execute on function workspace.withdraw_capability(uuid, text, uuid, uuid, uuid, platform.actor_type, text)
  to klussie_engine_workspace;
grant execute on function workspace.workspace_capabilities(uuid)
  to klussie_engine_workspace;
grant execute on function workspace.workspace_has_capability(uuid, text)
  to klussie_engine_workspace;
