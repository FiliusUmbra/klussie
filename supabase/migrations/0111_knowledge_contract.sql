-- Epic 16 WP06 — the knowledge engine contract: declare, supersede and retire rules;
-- resolve rules in force with conflicts surfaced rather than resolved silently; assert,
-- retract and traverse workspace-graph edges; promote a fact to the world graph as an
-- explicit, audited operation.
--
-- A REAL BUG CAUGHT BEFORE EPIC 17 BRANCHED — rules_in_force() DID NOT CHECK confirmed_at
--
-- 0107's own table default is `status text not null default 'active'`, independent of
-- `confirmed_at` — a `proposed` rule (origin = 'proposed', confirmed_at null, exactly the
-- shape Epic 17's own knowledge.propose_rule() will insert) is `status = 'active'` from
-- the moment it is inserted, the same as a declared one. The first draft of both
-- rules_in_force()'s own candidate filter and declare_rule()'s own tie-detection query
-- checked only `status = 'active'`, which would have treated an unconfirmed proposal as
-- already binding — directly contradicting §18.2's own words, "Becomes authoritative only
-- on acceptance." Caught by re-reading this function before building Epic 17's propose/
-- confirm pair on top of it, fixed by adding `and r.confirmed_at is not null` to both
-- queries — the same discipline that caught Epic 04's and Epic 11's own gen_random_uuid()
-- mistakes before they shipped, this time against the epic's own prior work rather than a
-- different one.
--
-- event_type FOLLOWS ADR-0019's OWN FORMAT FROM THE START — THE LESSON EPIC 15 NAMED
--
-- Every event below is minted directly in <engine>.<aggregate>.<past-participle> form,
-- not the bare PascalCase every contract before Epic 15's own finding used and then had
-- to correct (implementation/epic-15/COMPLETION.md §6). SYSTEM_ARCHITECTURE.md §9.1's own
-- produced-event list gives the English names this migration decomposes:
-- KnowledgeRuleDeclared -> knowledge.rule.declared; KnowledgeRuleSuperseded ->
-- knowledge.rule.superseded; KnowledgeRuleRetired -> knowledge.rule.retired;
-- KnowledgeConflictDetected -> knowledge.rule.conflict_detected; EdgeAsserted ->
-- knowledge.workspace_edge.asserted; FactPromoted -> knowledge.promotion.executed.
--
-- ONE NAMING DUPLICATION IN THE FROZEN DOCUMENTS, NOTED RATHER THAN SILENTLY RESOLVED —
-- THE SAME RESTRAINT EPIC 12'S OWN HEADER HELD FOR EngagementCreated/EngagementAccepted
--
-- §9.1 also names `WorldFactPublished` alongside `FactPromoted` for what reads as the
-- identical real-world moment — a fact leaving a workspace and arriving in the world
-- graph. Emitting a second event needs a second workspace_id to attribute it to
-- (platform.events.workspace_id is NOT NULL, Epic 13's own hard-won lesson), and the
-- world graph has none by design (0109's own header). This migration emits exactly one
-- event, knowledge.promotion.executed, attributed to the origin assertion's own
-- workspace — the discrepancy between two frozen names for one moment is recorded here,
-- not resolved by inventing a second, workspace-less emission the schema has nowhere to
-- put.
--
-- knowledge.rule.conflict_detected — A SINGLE, REQUIRED, CONDITIONALLY-USED EVENT ID,
-- THE FOURTH-PLUS OCCURRENCE OF THIS SESSION'S OWN ESTABLISHED PATTERN
--
-- declare_rule() may emit a second event when the newly-declared rule ties an existing
-- active rule at the same workspace/category/scope — conditional on that tie existing, in
-- the same transaction, never a second call a caller could forget. Its id,
-- p_conflict_event_id, is a required parameter on every call whether or not the branch
-- runs — the identical shape work.create_service_record()'s p_warranty_event_id already
-- established (Epic 11), reused rather than reinvented a fourth time.
--
-- knowledge.rules_in_force() SURFACES A CONFLICT; IT DOES NOT DETECT ONE FOR THE FIRST
-- TIME — DETECTION HAPPENS ONCE, AT DECLARATION
--
-- PLATFORM_DOMAIN_MODEL.md §18.2: "the platform must surface the conflict rather than
-- resolve it silently." A read function is the wrong place to also be the place a
-- conflict comes into existence as a recorded fact — a STABLE function queried on every
-- recommendation must not emit an event on every call just because two rows happen to
-- tie. The moment a conflict is created is when the second competing rule is declared;
-- rules_in_force() only ever reports what already exists, returning every row tied at the
-- most specific applicable level (more than one row means conflict, by construction of
-- the query itself, not a second detection pass).
--
-- ASSET_CLASS SCOPE RESOLUTION IS A NAMED, DELIBERATE GAP — SEE 0107's OWN HEADER
--
-- knowledge.rules_in_force() resolves workspace, property and location scope. asset_class
-- rules are structurally storable (0107's own check constraint) but not yet resolvable —
-- property.assets.type is a free-text column with no stable taxonomy behind it today, and
-- inventing one here would be exactly the speculative structure ADR-0010 rules out.
-- Resolvable additively, without redesign, whenever that taxonomy is real.
--
-- knowledge.promote_fact() COMPOSES A NODE UPSERT WITH AN EDGE INSERT, ATOMICALLY — NO
-- SEPARATE "CREATE A WORLD NODE" FUNCTION EXISTS ANYWHERE, DELIBERATELY
--
-- 0109's own header already states the reason: a standalone node-creation function would
-- be exactly the "ambient path from workspace data into platform scope" §6 prohibits.
-- Every node this function touches is upserted by caller-supplied id (`on conflict (id) do
-- nothing`, idempotent whether the id is fresh or already promoted from an earlier fact),
-- inside the same transaction as the edge and the audit record — there is no way to reach
-- knowledge.world_nodes except through this one, audited path.
--
-- CROSS-SCHEMA ACCESS THIS MIGRATION NEEDS, NAMED AND NARROW
--
-- knowledge.rules_in_force() resolves location-subtree scope via
-- property.location_within() (Epic 06) — the first real caller that function's own header
-- named as the reason no grant existed yet ("built the day it has a real containment
-- question to ask"). klussie_engine_knowledge gets USAGE on schema property, SELECT on
-- property.locations (the function is not SECURITY DEFINER — 0046's own header states
-- that deliberately — so the caller's own privileges apply throughout its body), and
-- EXECUTE on property.location_within() itself.

grant usage on schema property to klussie_engine_knowledge;
grant select on property.locations to klussie_engine_knowledge;
grant execute on function property.location_within(uuid, uuid) to klussie_engine_knowledge;

-- =========================================================================
-- THE LOGIC — declare

create or replace function knowledge.declare_rule(
  p_rule_id            uuid,
  p_workspace_id       uuid,
  p_category           text,
  p_scope_type         text,
  p_scope_id           uuid,
  p_rule               jsonb,
  p_event_id           uuid,
  p_conflict_event_id  uuid,
  p_correlation_id     uuid,
  p_actor_type         platform.actor_type,
  p_actor_ref          text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_tied_count integer;
begin
  insert into knowledge.rules (
    id, workspace_id, category, scope_type, scope_id, rule, origin, confirmed_at
  ) values (
    p_rule_id, p_workspace_id, p_category, p_scope_type, p_scope_id, p_rule, 'declared', now()
  );

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'knowledge.rule.declared',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'rule',
    p_subject_id     => p_rule_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('category', p_category, 'scopeType', p_scope_type, 'scopeId', p_scope_id)
  );

  -- A tie: another ACTIVE rule already covers this exact workspace/category/scope.
  -- PLATFORM_DOMAIN_MODEL.md §18.2: "where equally specific rules conflict, the platform
  -- must surface the conflict rather than resolve it silently" — recorded the moment it
  -- comes into existence, not deferred to whichever read happens to notice it later.
  select count(*) into v_tied_count
  from knowledge.rules r
  where r.workspace_id = p_workspace_id
    and r.category = p_category
    and r.scope_type = p_scope_type
    and r.scope_id is not distinct from p_scope_id
    and r.status = 'active'
    and r.confirmed_at is not null
    and r.id <> p_rule_id;

  if v_tied_count > 0 then
    perform platform.emit_event(
      p_event_id       => p_conflict_event_id,
      p_event_type     => 'knowledge.rule.conflict_detected',
      p_workspace_id   => p_workspace_id,
      p_actor_type     => p_actor_type,
      p_actor_ref      => p_actor_ref,
      p_subject_type   => 'rule',
      p_subject_id     => p_rule_id,
      p_correlation_id => p_correlation_id,
      p_payload        => jsonb_build_object('category', p_category, 'scopeType', p_scope_type, 'scopeId', p_scope_id, 'tiedRuleCount', v_tied_count)
    );
  end if;
end;
$$;

comment on function knowledge.declare_rule(uuid, uuid, text, text, uuid, jsonb, uuid, uuid, uuid, platform.actor_type, text) is
  'Declares a rule, immediately binding (origin = declared, confirmed_at = now()). Emits knowledge.rule.declared always, and knowledge.rule.conflict_detected when this rule ties another active one at the identical workspace/category/scope — using p_conflict_event_id, required on every call, used only when the tie exists (the WarrantyArising-shaped pattern, Epic 11).';

-- =========================================================================
-- THE LOGIC — supersede

create or replace function knowledge.supersede_rule(
  p_old_rule_id     uuid,
  p_new_rule_id     uuid,
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
declare
  v_workspace_id uuid;
  v_category     text;
  v_scope_type   text;
  v_scope_id     uuid;
begin
  select workspace_id, category, scope_type, scope_id
    into v_workspace_id, v_category, v_scope_type, v_scope_id
  from knowledge.rules
  where id = p_old_rule_id and status = 'active';

  if v_workspace_id is null then
    raise exception
      'knowledge.supersede_rule: rule % does not exist or is not active', p_old_rule_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- The replacement inherits what it governs (workspace/category/scope) from the rule it
  -- replaces — supersession changes the CONTENT of a standing decision, never what the
  -- decision is about.
  insert into knowledge.rules (
    id, workspace_id, category, scope_type, scope_id, rule, origin, confirmed_at
  ) values (
    p_new_rule_id, v_workspace_id, v_category, v_scope_type, v_scope_id, p_rule, 'declared', now()
  );

  update knowledge.rules
  set status = 'superseded', superseded_by = p_new_rule_id
  where id = p_old_rule_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'knowledge.rule.superseded',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'rule',
    p_subject_id     => p_old_rule_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('supersededBy', p_new_rule_id)
  );
end;
$$;

comment on function knowledge.supersede_rule(uuid, uuid, jsonb, uuid, uuid, platform.actor_type, text) is
  'Replaces a rule''s content with a new row, never an edit — a EUR 300 threshold becoming EUR 500 is a new rule, the old one marked superseded. Refuses if the old rule does not exist or is not active.';

-- =========================================================================
-- THE LOGIC — retire

create or replace function knowledge.retire_rule(
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
begin
  update knowledge.rules
  set status = 'retired', retired_at = now()
  where id = p_rule_id and status = 'active'
  returning workspace_id into v_workspace_id;

  if v_workspace_id is null then
    raise exception
      'knowledge.retire_rule: rule % does not exist or is not active', p_rule_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'knowledge.rule.retired',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'rule',
    p_subject_id     => p_rule_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('outcome', 'retired')
  );
end;
$$;

comment on function knowledge.retire_rule(uuid, uuid, uuid, platform.actor_type, text) is
  'Ends a rule with no replacement — distinct from supersede_rule(), which always names what replaces it. Refuses if already retired or superseded, a one-way transition.';

-- =========================================================================
-- THE LOGIC — rules in force, precedence with conflicts surfaced

create or replace function knowledge.rules_in_force(
  p_workspace_id  uuid,
  p_category      text,
  p_property_id   uuid default null,
  p_location_id   uuid default null
)
returns table (
  rule_id      uuid,
  scope_type   text,
  scope_id     uuid,
  rule         jsonb,
  is_conflict  boolean
)
language sql
stable
set search_path = ''
as $$
  with candidates as (
    select
      r.id, r.scope_type, r.scope_id, r.rule,
      case r.scope_type
        when 'location' then 3
        when 'property' then 2
        when 'workspace' then 1
      end as specificity
    from knowledge.rules r
    where r.workspace_id = p_workspace_id
      and r.category = p_category
      and r.status = 'active'
      and r.confirmed_at is not null
      and (
        r.scope_type = 'workspace'
        or (r.scope_type = 'property' and r.scope_id = p_property_id)
        or (
          r.scope_type = 'location'
          and p_location_id is not null
          and property.location_within(p_location_id, r.scope_id)
        )
      )
  ),
  top as (
    select * from candidates where specificity = (select max(specificity) from candidates)
  )
  select
    top.id, top.scope_type, top.scope_id, top.rule,
    (select count(*) from top) > 1 as is_conflict
  from top;
$$;

comment on function knowledge.rules_in_force(uuid, text, uuid, uuid) is
  'The rules governing one category at the most specific applicable scope (workspace < property < location — asset_class deliberately unresolved, see this migration''s own header). Returns every row at the winning specificity: one row means resolved, more than one means every returned row is_conflict = true, the platform''s own words for a tie surfaced rather than picked silently (PLATFORM_DOMAIN_MODEL.md §18.2).';

revoke all on function knowledge.rules_in_force(uuid, text, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function knowledge.rules_in_force(uuid, text, uuid, uuid) to klussie_engine_knowledge;

-- =========================================================================
-- THE LOGIC — assert / retract edges

create or replace function knowledge.assert_edge(
  p_edge_id          uuid,
  p_workspace_id     uuid,
  p_from_type        text,
  p_from_id          uuid,
  p_edge_type        text,
  p_to_type          text,
  p_to_id            uuid,
  p_asserted_by_ref  uuid,
  p_event_id         uuid,
  p_correlation_id   uuid,
  p_actor_type       platform.actor_type,
  p_actor_ref        text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into knowledge.workspace_edges (
    id, workspace_id, from_type, from_id, edge_type, to_type, to_id, asserted_by_ref
  ) values (
    p_edge_id, p_workspace_id, p_from_type, p_from_id, p_edge_type, p_to_type, p_to_id, p_asserted_by_ref
  );

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'knowledge.workspace_edge.asserted',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'workspace_edge',
    p_subject_id     => p_edge_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('fromType', p_from_type, 'fromId', p_from_id, 'edgeType', p_edge_type, 'toType', p_to_type, 'toId', p_to_id)
  );
end;
$$;

comment on function knowledge.assert_edge(uuid, uuid, text, uuid, text, text, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Records a relationship a human stated that no other aggregate implies (DATABASE_ARCHITECTURE.md §27). from_type/to_type reference real aggregates elsewhere by (type, id), unconstrained by foreign key — see 0108''s own header.';

create or replace function knowledge.retract_edge(
  p_edge_id         uuid,
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
  update knowledge.workspace_edges
  set retracted_at = now()
  where id = p_edge_id and retracted_at is null
  returning workspace_id into v_workspace_id;

  if v_workspace_id is null then
    raise exception
      'knowledge.retract_edge: edge % does not exist or is already retracted', p_edge_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- A named, deliberate extension beyond §9.1's own produced-event list — the same
  -- pragmatic gap-fill commerce.fail_payment()'s billing.payout.failed already
  -- established (Epic 14): the frozen list names EdgeAsserted only, but a wrong
  -- assertion structurally can be retracted (0108's own retracted_at column), and an
  -- event that changed nothing about the fact would leave that state change unrecorded.
  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'knowledge.workspace_edge.retracted',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'workspace_edge',
    p_subject_id     => p_edge_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('outcome', 'retracted')
  );
end;
$$;

comment on function knowledge.retract_edge(uuid, uuid, uuid, platform.actor_type, text) is
  'Retracts a wrong assertion without deleting the record that it was ever made (0108''s own retracted_at). Emits knowledge.workspace_edge.retracted, a named extension beyond §9.1''s own event list — see this function''s own body comment.';

-- =========================================================================
-- THE LOGIC — traverse

create or replace function knowledge.workspace_edges_for(
  p_workspace_id  uuid,
  p_node_type     text,
  p_node_id       uuid
)
returns table (
  id            uuid,
  from_type     text,
  from_id       uuid,
  edge_type     text,
  to_type       text,
  to_id         uuid,
  asserted_at   timestamptz
)
language sql
stable
set search_path = ''
as $$
  select e.id, e.from_type, e.from_id, e.edge_type, e.to_type, e.to_id, e.asserted_at
  from knowledge.workspace_edges e
  where e.workspace_id = p_workspace_id
    and e.retracted_at is null
    and (
      (e.from_type = p_node_type and e.from_id = p_node_id)
      or (e.to_type = p_node_type and e.to_id = p_node_id)
    )
  order by e.asserted_at;
$$;

comment on function knowledge.workspace_edges_for(uuid, text, uuid) is
  'Every live (non-retracted) edge touching one node, either direction — the one-hop traversal §9.1''s own public contract line names ("Traverse the graph from here"). Multi-hop traversal is a future read, not this epic''s.';

revoke all on function knowledge.workspace_edges_for(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function knowledge.workspace_edges_for(uuid, text, uuid) to klussie_engine_knowledge;

-- =========================================================================
-- THE LOGIC — promote

create or replace function knowledge.promote_fact(
  p_promotion_id         uuid,
  p_origin_edge_id       uuid,
  p_from_node_id         uuid,
  p_from_node_type       text,
  p_from_node_label      text,
  p_from_node_attributes jsonb,
  p_edge_id              uuid,
  p_edge_type            text,
  p_to_node_id           uuid,
  p_to_node_type         text,
  p_to_node_label        text,
  p_to_node_attributes   jsonb,
  p_population           text,
  p_authority            text,
  p_event_id             uuid,
  p_correlation_id       uuid,
  p_actor_type           platform.actor_type,
  p_actor_ref            text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_origin_workspace_id uuid;
begin
  select workspace_id into v_origin_workspace_id
  from knowledge.workspace_edges
  where id = p_origin_edge_id;

  if v_origin_workspace_id is null then
    raise exception
      'knowledge.promote_fact: origin edge % does not exist', p_origin_edge_id
      using errcode = 'invalid_parameter_value';
  end if;

  if p_population is null or btrim(p_population) = '' then
    raise exception
      'knowledge.promote_fact: p_population is required — DATABASE_ARCHITECTURE.md section 6 requires naming the aggregate population a promotion was derived from'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Idempotent by id, whether p_from_node_id/p_to_node_id are fresh or already promoted
  -- from an earlier fact — no separate "create a world node" function exists (this
  -- migration's own header), so every node this platform has ever promoted is reachable
  -- only through here.
  insert into knowledge.world_nodes (id, node_type, label, attributes)
  values (p_from_node_id, p_from_node_type, p_from_node_label, coalesce(p_from_node_attributes, '{}'::jsonb))
  on conflict (id) do nothing;

  insert into knowledge.world_nodes (id, node_type, label, attributes)
  values (p_to_node_id, p_to_node_type, p_to_node_label, coalesce(p_to_node_attributes, '{}'::jsonb))
  on conflict (id) do nothing;

  insert into knowledge.world_edges (id, from_node_id, edge_type, to_node_id)
  values (p_edge_id, p_from_node_id, p_edge_type, p_to_node_id);

  -- Every promotion is an explicit, recorded, audited operation (§6/§33) — naming what
  -- was promoted, the population it was derived from, and who authorised it. Written
  -- through the privileged path WP 16.01 built for exactly this call.
  perform platform.write_audit_record(
    p_audit_id       => p_promotion_id,
    p_workspace_id   => v_origin_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_action         => 'knowledge.fact_promoted',
    p_subject_type   => 'world_edge',
    p_subject_id     => p_edge_id,
    p_outcome        => 'permitted',
    p_authority      => p_authority,
    p_correlation_id => p_correlation_id,
    p_detail         => jsonb_build_object(
      'originEdgeId', p_origin_edge_id,
      'population', p_population,
      'edgeType', p_edge_type
    )
  );

  -- FactPromoted (§9.1) — attributed to the origin workspace, since that is the only real
  -- workspace_id this moment has (platform.events.workspace_id is NOT NULL). See this
  -- migration's own header for why WorldFactPublished is not a second emission.
  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'knowledge.promotion.executed',
    p_workspace_id   => v_origin_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'workspace_edge',
    p_subject_id     => p_origin_edge_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('worldEdgeId', p_edge_id, 'population', p_population)
  );
end;
$$;

comment on function knowledge.promote_fact(
  uuid, uuid, uuid, text, text, jsonb, uuid, text, uuid, text, text, jsonb, text, text, uuid, uuid, platform.actor_type, text
) is
  'A fact leaving a workspace and entering the world graph — one-way, irreversible, aggregate-only (§6). Upserts both world nodes and the edge between them atomically, writes the required audit record naming what was promoted and from which population, and emits knowledge.promotion.executed attributed to the origin workspace. No caller-supplied workspace reference is ever written to knowledge.world_nodes/world_edges themselves.';

-- =========================================================================
-- ACCESS — no api.* delegate, the same posture every engine contract has held since
-- Epic 09, now an eleventh occurrence.

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'knowledge.declare_rule(uuid, uuid, text, text, uuid, jsonb, uuid, uuid, uuid, platform.actor_type, text)',
    'knowledge.supersede_rule(uuid, uuid, jsonb, uuid, uuid, platform.actor_type, text)',
    'knowledge.retire_rule(uuid, uuid, uuid, platform.actor_type, text)',
    'knowledge.assert_edge(uuid, uuid, text, uuid, text, text, uuid, uuid, uuid, uuid, platform.actor_type, text)',
    'knowledge.retract_edge(uuid, uuid, uuid, platform.actor_type, text)',
    'knowledge.promote_fact(uuid, uuid, uuid, text, text, jsonb, uuid, text, uuid, text, text, jsonb, text, text, uuid, uuid, platform.actor_type, text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated, service_role', fn);
    execute pg_catalog.format('grant execute on function %s to klussie_engine_knowledge', fn);
  end loop;
end;
$$;
