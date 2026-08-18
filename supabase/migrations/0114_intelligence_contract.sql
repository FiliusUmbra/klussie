-- Epic 17 WP03/WP04 — the intelligence contract: propose, confirm and reject rules
-- (closing the gap Epic 16 deliberately left open); publish and read memory versions;
-- record recommendations, predictions, proposed assets, and summaries.
--
-- event_type FOLLOWS ADR-0019's OWN FORMAT FROM THE START — THE LESSON EPIC 15 NAMED,
-- THE SECOND EPIC IN A ROW TO GET IT RIGHT FIRST TRY
--
-- SYSTEM_ARCHITECTURE.md §9.1/§9.2's own produced-event lists decompose directly:
-- KnowledgeRuleDeclared (confirmation path) -> knowledge.rule.declared; MemoryVersion
-- Published -> knowledge.memory.version_published; RecommendationMade ->
-- knowledge.recommendation.made; PredictionProposed -> knowledge.prediction.proposed;
-- AssetProposed -> knowledge.asset.proposed; SummaryGenerated -> knowledge.summary.
-- generated. `RuleProposed` (§9.2's own list, not §9.1's — proposing is Intelligence's
-- act, confirming/rejecting is the workspace's own) -> knowledge.rule.proposed.
--
-- knowledge.propose_rule()/confirm_proposed_rule()/reject_proposed_rule() CLOSE THE GAP
-- 0111's OWN HEADER NAMED — "the write path for THAT operation... added when Epic 17 has
-- a real pattern to propose"
--
-- Three functions, not one, matching §18.2's own two-step lifecycle: "Inferred and
-- confirmed — the platform notices a pattern... and proposes it as a rule the customer
-- accepts, edits or rejects. Becomes authoritative only on acceptance." propose_rule()
-- inserts into knowledge.rules (0107) with origin = 'proposed', confirmed_at = null —
-- exactly the shape the confirmed_at fix earlier in this migration's own contract
-- (0111's header, found before this epic branched) now correctly excludes from
-- rules_in_force() until confirmed. confirm_proposed_rule() sets confirmed_at and emits
-- the same knowledge.rule.declared event declare_rule() emits — confirmation is simply
-- the later of two paths to the identical fact, becoming binding. reject_proposed_rule()
-- COMPOSES knowledge.retire_rule() rather than duplicating its logic — a rejected
-- proposal and a retired rule are the same fact (ended, no replacement), differing only
-- in whether it had ever become binding first — the compose-don't-duplicate pattern
-- reused a fifth time this session.
--
-- knowledge.publish_memory_version() RESOLVES THE EVENT'S workspace_id LIVE, THE SAME WAY
-- work.create_service_record() ALREADY DOES FOR ITS OWN PROPERTY-HOMED WRITES
--
-- 0112's own header explains why memory_versions carries no workspace_id column. But
-- platform.events.workspace_id is NOT NULL (Epic 13's own lesson), so this function
-- resolves the CURRENT steward live, at the moment of publishing, via
-- property.properties.steward_workspace_id — never a caller-supplied value that could go
-- stale the moment stewardship transfers.
--
-- subject_type = 'property' ON THE PUBLISHED-VERSION EVENT — A DELIBERATE CONNECTION TO
-- EPIC 15'S OWN TIMELINE, NOT A COINCIDENCE
--
-- property.timeline_segment() (Epic 15) already resolves events with subject_type =
-- 'property' as that property's own events, with zero code changes needed. Using the
-- same subject_type here means a published memory version appears in a property's
-- timeline automatically, for free — the kind of connection this session's per-epic
-- read-before-design pass exists to notice before it ships as a missed opportunity.
--
-- ONE NAMING DUPLICATION IN THE FROZEN EVENT VOCABULARY, NOTED RATHER THAN SILENTLY
-- RESOLVED — THE THIRD TIME THIS SESSION HAS HELD THIS RESTRAINT (AFTER EPIC 12, EPIC 16)
--
-- §9.2 names both `MemoryRevised` and `MemoryVersionPublished` for what reads as the
-- identical real-world moment — a new interpretation becoming current and simultaneously
-- being archived. This migration emits exactly one event,
-- knowledge.memory.version_published, matching the concrete table it writes to.
--
-- FOUR NAMED ACTIONS WITH NO DEDICATED TABLE, DELIBERATELY — RecommendationMade,
-- PredictionProposed, AssetProposed, SummaryGenerated
--
-- §9.2's own "Owns" line names "Prediction proposals" but DATABASE_ARCHITECTURE.md §3's
-- classification table has no separate row for predictions, recommendations or proposed
-- assets the way it does for memory versions — meaning the Rebuild Test does not, on its
-- own text, demand a dedicated aggregate for these the way it demanded one for published
-- memory. Nothing today needs to QUERY a recommendation or prediction back out (no read
-- surface exists yet), so each is a named, documented event-emitting function rather than
-- a table invented ahead of a real read requirement — ADR-0010's restraint, applied a
-- fourth time this session (after Epic 12's reviews, Epic 15's document resolution, and
-- Epic 16's derived/inferred graph edges).
--
-- propose_asset()'S SUBJECT IS THE PROPERTY, NOT THE ASSET — BECAUSE THE ASSET DOES NOT
-- EXIST YET
--
-- "Proposing assets from recognition" (§9.2) describes a suggestion, not a commit — Asset
-- engine (Epic 07) has no write contract yet (Epic 15's own finding, COMPLETION.md §5.4),
-- so this function does not and cannot create a property.assets row. It records the
-- proposal itself, subject_type = 'property', for whoever eventually reviews it.
--
-- CROSS-SCHEMA ACCESS THIS MIGRATION NEEDS, NAMED AND NARROW
--
-- publish_memory_version() resolves the current steward via property.properties —
-- klussie_engine_knowledge already holds USAGE on schema property (0111) but not SELECT
-- on property.properties itself (0111 granted only property.locations, for a different
-- read). Granted here, narrowly, for the one query this function performs.

grant select on property.properties to klussie_engine_knowledge;

-- =========================================================================
-- THE LOGIC — propose / confirm / reject a rule

create or replace function knowledge.propose_rule(
  p_rule_id         uuid,
  p_workspace_id    uuid,
  p_category        text,
  p_scope_type      text,
  p_scope_id        uuid,
  p_rule            jsonb,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into knowledge.rules (
    id, workspace_id, category, scope_type, scope_id, rule, origin, confirmed_at
  ) values (
    p_rule_id, p_workspace_id, p_category, p_scope_type, p_scope_id, p_rule, 'proposed', null
  );

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'knowledge.rule.proposed',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'rule',
    p_subject_id     => p_rule_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('category', p_category, 'scopeType', p_scope_type, 'scopeId', p_scope_id)
  );
end;
$$;

comment on function knowledge.propose_rule(uuid, uuid, text, text, uuid, jsonb, uuid, uuid, platform.actor_type, text) is
  'Proposes a rule from an observed pattern — not yet binding (confirmed_at stays null until knowledge.confirm_proposed_rule()). Expected caller passes p_actor_type = ''intelligence'', not enforced structurally.';

create or replace function knowledge.confirm_proposed_rule(
  p_rule_id         uuid,
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
  v_origin       text;
  v_updated      boolean;
begin
  select workspace_id, origin into v_workspace_id, v_origin
  from knowledge.rules
  where id = p_rule_id and status = 'active';

  if v_workspace_id is null then
    raise exception
      'knowledge.confirm_proposed_rule: rule % does not exist or is not active', p_rule_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if v_origin <> 'proposed' then
    raise exception
      'knowledge.confirm_proposed_rule: rule % is not a proposal', p_rule_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  update knowledge.rules
  set confirmed_at = now()
  where id = p_rule_id and confirmed_at is null;

  get diagnostics v_updated = row_count;
  if not v_updated then
    raise exception
      'knowledge.confirm_proposed_rule: rule % is already confirmed', p_rule_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- The same event declare_rule() (0111) emits when a rule is immediately binding from
  -- creation — confirmation is the later of two paths to the identical fact (§18.2:
  -- "Becomes authoritative only on acceptance").
  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'knowledge.rule.declared',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'rule',
    p_subject_id     => p_rule_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('confirmedFromProposal', true)
  );
end;
$$;

comment on function knowledge.confirm_proposed_rule(uuid, uuid, uuid, platform.actor_type, text) is
  'Accepts a proposed rule, making it binding. Refuses if the rule does not exist, is not a proposal, or is already confirmed.';

create or replace function knowledge.reject_proposed_rule(
  p_rule_id         uuid,
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
  v_origin       text;
  v_confirmed_at timestamptz;
begin
  select origin, confirmed_at into v_origin, v_confirmed_at
  from knowledge.rules
  where id = p_rule_id and status = 'active';

  if v_origin is null then
    raise exception
      'knowledge.reject_proposed_rule: rule % does not exist or is not active', p_rule_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if v_origin <> 'proposed' or v_confirmed_at is not null then
    raise exception
      'knowledge.reject_proposed_rule: rule % is not an unconfirmed proposal', p_rule_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- Composes retire_rule() rather than duplicating its logic — a rejected proposal and a
  -- retired rule are the same fact, ended with no replacement, differing only in whether
  -- it had ever become binding first.
  perform knowledge.retire_rule(p_rule_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
end;
$$;

comment on function knowledge.reject_proposed_rule(uuid, uuid, uuid, platform.actor_type, text) is
  'Rejects a proposal that never became binding. Composes knowledge.retire_rule() (0111) rather than duplicating its logic. Refuses if the rule is not an unconfirmed proposal.';

-- =========================================================================
-- THE LOGIC — publish and read memory versions

create or replace function knowledge.publish_memory_version(
  p_version_id      uuid,
  p_property_id     uuid,
  p_content         jsonb,
  p_basis           jsonb,
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
  select steward_workspace_id into v_workspace_id
  from property.properties
  where id = p_property_id;

  if v_workspace_id is null then
    raise exception
      'knowledge.publish_memory_version: property % does not exist', p_property_id
      using errcode = 'invalid_parameter_value';
  end if;

  insert into knowledge.memory_versions (
    id, property_id, content, basis, published_by_actor_type, published_by_actor_ref
  ) values (
    p_version_id, p_property_id, p_content, p_basis, p_actor_type, p_actor_ref
  );

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'knowledge.memory.version_published',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'property',
    p_subject_id     => p_property_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('versionId', p_version_id)
  );
end;
$$;

comment on function knowledge.publish_memory_version(uuid, uuid, jsonb, jsonb, uuid, uuid, platform.actor_type, text) is
  'Publishes a new Property Memory version — permanent, append-only (0112). Resolves the event''s workspace_id from the property''s CURRENT steward, live, never a caller-supplied value. subject_type = ''property'' deliberately, so this appears in property.timeline_segment() (Epic 15) with no changes needed there.';

create or replace function knowledge.current_property_memory(p_property_id uuid)
returns table (
  id            uuid,
  content       jsonb,
  basis         jsonb,
  published_at  timestamptz
)
language sql
stable
set search_path = ''
as $$
  select mv.id, mv.content, mv.basis, mv.published_at
  from knowledge.memory_versions mv
  join property.properties p on p.id = mv.property_id
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  where mv.property_id = p_property_id
  order by mv.published_at desc
  limit 1;
$$;

comment on function knowledge.current_property_memory(uuid) is
  'Current Property Memory — a projection, "may be recomputed at any time" (§26): simply the latest published version, never a separately-maintained structure. Self-enforcing by construction, the same shape property.resolve_property() (0041) established: only the current steward resolves a row.';

revoke all on function knowledge.current_property_memory(uuid) from public, anon, authenticated, service_role;
grant execute on function knowledge.current_property_memory(uuid) to klussie_engine_knowledge;

-- =========================================================================
-- THE LOGIC — recommendations, predictions, proposed assets, summaries. No dedicated
-- table for any of the four — see this migration's own header.

create or replace function knowledge.record_recommendation(
  p_workspace_id    uuid,
  p_subject_type    text,
  p_subject_id      uuid,
  p_reasoning       jsonb,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'knowledge.recommendation.made',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => p_subject_type,
    p_subject_id     => p_subject_id,
    p_correlation_id => p_correlation_id,
    p_payload        => p_reasoning
  );
end;
$$;

comment on function knowledge.record_recommendation(uuid, text, uuid, jsonb, uuid, uuid, platform.actor_type, text) is
  '"Recording what it recommended and why" (§9.2), a real responsibility, not a UI-only concern. p_reasoning carries the recommendation, its alternatives and its cost (§19.3) directly as the event payload — no dedicated table, see this migration''s own header.';

create or replace function knowledge.propose_prediction(
  p_workspace_id    uuid,
  p_subject_type    text,
  p_subject_id      uuid,
  p_prediction      jsonb,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'knowledge.prediction.proposed',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => p_subject_type,
    p_subject_id     => p_subject_id,
    p_correlation_id => p_correlation_id,
    p_payload        => p_prediction
  );
end;
$$;

comment on function knowledge.propose_prediction(uuid, text, uuid, jsonb, uuid, uuid, platform.actor_type, text) is
  'A prediction about something in scope — no dedicated table, see this migration''s own header.';

create or replace function knowledge.propose_asset(
  p_workspace_id      uuid,
  p_property_id       uuid,
  p_proposed_asset    jsonb,
  p_event_id          uuid,
  p_correlation_id    uuid,
  p_actor_type        platform.actor_type,
  p_actor_ref         text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- subject_type = 'property', not 'asset' — the asset does not exist yet (Asset engine,
  -- Epic 07, has no write contract this proposal could commit to). See this migration's
  -- own header.
  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'knowledge.asset.proposed',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'property',
    p_subject_id     => p_property_id,
    p_correlation_id => p_correlation_id,
    p_payload        => p_proposed_asset
  );
end;
$$;

comment on function knowledge.propose_asset(uuid, uuid, jsonb, uuid, uuid, platform.actor_type, text) is
  '"Proposing assets from recognition" (§9.2) — a suggestion, not a commit. Never creates a property.assets row; Asset engine has no write contract yet (implementation/epic-15/COMPLETION.md §5.4).';

create or replace function knowledge.generate_summary(
  p_workspace_id    uuid,
  p_subject_type    text,
  p_subject_id      uuid,
  p_summary         text,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'knowledge.summary.generated',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => p_subject_type,
    p_subject_id     => p_subject_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('summary', p_summary)
  );
end;
$$;

comment on function knowledge.generate_summary(uuid, text, uuid, text, uuid, uuid, platform.actor_type, text) is
  '"Summarise" (§9.2''s own public contract line) — no dedicated table, see this migration''s own header.';

-- =========================================================================
-- ACCESS — no api.* delegate, the same posture every engine contract has held since
-- Epic 09, now a twelfth occurrence.

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'knowledge.propose_rule(uuid, uuid, text, text, uuid, jsonb, uuid, uuid, platform.actor_type, text)',
    'knowledge.confirm_proposed_rule(uuid, uuid, uuid, platform.actor_type, text)',
    'knowledge.reject_proposed_rule(uuid, uuid, uuid, platform.actor_type, text)',
    'knowledge.publish_memory_version(uuid, uuid, jsonb, jsonb, uuid, uuid, platform.actor_type, text)',
    'knowledge.record_recommendation(uuid, text, uuid, jsonb, uuid, uuid, platform.actor_type, text)',
    'knowledge.propose_prediction(uuid, text, uuid, jsonb, uuid, uuid, platform.actor_type, text)',
    'knowledge.propose_asset(uuid, uuid, jsonb, uuid, uuid, platform.actor_type, text)',
    'knowledge.generate_summary(uuid, text, uuid, text, uuid, uuid, platform.actor_type, text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated, service_role', fn);
    execute pg_catalog.format('grant execute on function %s to klussie_engine_knowledge', fn);
  end loop;
end;
$$;
