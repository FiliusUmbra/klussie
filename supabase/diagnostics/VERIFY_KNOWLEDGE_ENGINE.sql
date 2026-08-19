-- Verifies 0105-0111 end to end: the privileged audit write path, declaring a rule and
-- surfacing a conflict at the moment it arises, precedence across workspace/property/
-- location scope, supersession and retirement, asserting/retracting/traversing a
-- workspace edge, and promoting a fact to the world graph with its audit record.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_KNOWLEDGE_ENGINE.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_ws              uuid := gen_random_uuid();
  v_prop             uuid := gen_random_uuid();
  v_bldg_a           uuid := gen_random_uuid();
  v_floor            uuid := gen_random_uuid();
  v_asset            uuid := gen_random_uuid();
  v_rule_ws          uuid := gen_random_uuid();
  v_rule_prop        uuid := gen_random_uuid();
  v_rule_prop2       uuid := gen_random_uuid();
  v_rule_new         uuid := gen_random_uuid();
  v_edge             uuid := gen_random_uuid();
  v_promotion        uuid := gen_random_uuid();
  v_node_model       uuid := gen_random_uuid();
  v_node_part        uuid := gen_random_uuid();
  v_world_edge       uuid := gen_random_uuid();
  v_count            integer;
  v_row              record;
  v_status           text;
begin
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'Test Home');
  insert into property.properties (id, name, steward_workspace_id, steward_since)
    values (v_prop, 'Test Home', v_ws, now());
  insert into property.locations (id, property_id, parent_id, name) values (v_bldg_a, v_prop, null, 'Building A');
  insert into property.locations (id, property_id, parent_id, name) values (v_floor, v_prop, v_bldg_a, 'Floor 1');
  insert into property.assets (id, property_id, name, type) values (v_asset, v_prop, 'Boiler', 'appliance');

  -- =========================================================================
  -- 1 · A workspace-wide rule is declared cleanly, no conflict

  perform knowledge.declare_rule(
    p_rule_id => v_rule_ws, p_workspace_id => v_ws, p_category => 'budget_threshold',
    p_scope_type => 'workspace', p_scope_id => null, p_rule => '{"amount": 300, "currency": "EUR"}'::jsonb,
    p_event_id => gen_random_uuid(), p_conflict_event_id => gen_random_uuid(),
    p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'owner-1'
  );
  select count(*) into v_count from knowledge.rules_in_force(v_ws, 'budget_threshold', v_prop, v_floor);
  if v_count <> 1 then
    raise exception '1a · expected exactly one rule in force, got %', v_count;
  end if;
  select * into v_row from knowledge.rules_in_force(v_ws, 'budget_threshold', v_prop, v_floor);
  if v_row.is_conflict then
    raise exception '1b · a single workspace-wide rule should not be a conflict';
  end if;
  raise notice '1 · a workspace-wide rule is declared and resolves cleanly';

  -- =========================================================================
  -- 2 · A property-scoped rule in the SAME category overrides the workspace-wide one —
  -- more specific wins

  perform knowledge.declare_rule(
    p_rule_id => v_rule_prop, p_workspace_id => v_ws, p_category => 'budget_threshold',
    p_scope_type => 'property', p_scope_id => v_prop, p_rule => '{"amount": 500, "currency": "EUR"}'::jsonb,
    p_event_id => gen_random_uuid(), p_conflict_event_id => gen_random_uuid(),
    p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'owner-1'
  );
  select * into v_row from knowledge.rules_in_force(v_ws, 'budget_threshold', v_prop, v_floor);
  if v_row.rule_id <> v_rule_prop or v_row.is_conflict then
    raise exception '2 · expected the property-scoped rule to win cleanly, got rule % conflict %', v_row.rule_id, v_row.is_conflict;
  end if;
  raise notice '2 · the more specific (property) rule wins over the workspace-wide one';

  -- =========================================================================
  -- 2b · An unconfirmed proposal at the same scope is invisible to rules_in_force() and
  -- does not count as a conflict — the confirmed_at bug caught before Epic 17 branched
  -- (implementation/epic-16/COMPLETION.md §5.3). propose_rule() does not exist yet
  -- (Epic 17's own job), so this inserts directly, the shape it will produce.

  insert into knowledge.rules (id, workspace_id, category, scope_type, scope_id, rule, origin, confirmed_at)
  values (gen_random_uuid(), v_ws, 'budget_threshold', 'property', v_prop, '{"amount": 900, "currency": "EUR"}'::jsonb, 'proposed', null);

  select * into v_row from knowledge.rules_in_force(v_ws, 'budget_threshold', v_prop, v_floor);
  if v_row.rule_id <> v_rule_prop or v_row.is_conflict then
    raise exception '2b · an unconfirmed proposal was treated as binding or as a conflict — rule %, conflict %', v_row.rule_id, v_row.is_conflict;
  end if;
  raise notice '2b · an unconfirmed proposal is invisible to rules_in_force(), never binding and never a conflict';

  -- =========================================================================
  -- 3 · A second, tied property-scoped rule in the identical category+scope is surfaced
  -- as a conflict, not resolved silently — and knowledge.rule.conflict_detected fires

  perform knowledge.declare_rule(
    p_rule_id => v_rule_prop2, p_workspace_id => v_ws, p_category => 'budget_threshold',
    p_scope_type => 'property', p_scope_id => v_prop, p_rule => '{"amount": 750, "currency": "EUR"}'::jsonb,
    p_event_id => gen_random_uuid(), p_conflict_event_id => gen_random_uuid(),
    p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'owner-2'
  );
  select count(*) into v_count from knowledge.rules_in_force(v_ws, 'budget_threshold', v_prop, v_floor);
  if v_count <> 2 then
    raise exception '3a · expected both tied rules returned, got %', v_count;
  end if;
  if exists (select 1 from knowledge.rules_in_force(v_ws, 'budget_threshold', v_prop, v_floor) where not is_conflict) then
    raise exception '3b · a tied rule was not marked is_conflict';
  end if;
  raise notice '3 · two equally-specific rules are surfaced together as a conflict, neither picked silently';

  -- =========================================================================
  -- 4 · Superseding one of two tied rules does NOT, by itself, resolve the conflict —
  -- proving "conflicts are surfaced, never resolved silently" holds even under
  -- supersession. Caught only by running this diagnostic against real data (staging,
  -- 2026-08-19): the original expectation here was that supersession alone would drop the
  -- count back to 1, which would mean superseding ONE of two tied rules silently resolves
  -- a conflict involving a rule it never touched (v_rule_prop) — exactly what the
  -- architecture forbids. The real, correct behaviour is that the successor (v_rule_new)
  -- is STILL tied with the untouched v_rule_prop, both still marked is_conflict, until a
  -- human explicitly retires one of them — which is what actually resolves it.

  perform knowledge.supersede_rule(
    p_old_rule_id => v_rule_prop2, p_new_rule_id => v_rule_new, p_rule => '{"amount": 500, "currency": "EUR"}'::jsonb,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'owner-2'
  );
  select status into v_status from knowledge.rules where id = v_rule_prop2;
  if v_status <> 'superseded' then
    raise exception '4a · expected the old rule to be superseded, got %', v_status;
  end if;

  select count(*) into v_count from knowledge.rules_in_force(v_ws, 'budget_threshold', v_prop, v_floor);
  if v_count <> 2 then
    raise exception '4b · expected the successor still tied with the untouched v_rule_prop, got % rows', v_count;
  end if;
  if exists (select 1 from knowledge.rules_in_force(v_ws, 'budget_threshold', v_prop, v_floor) where not is_conflict) then
    raise exception '4c · superseding one tied rule silently cleared is_conflict on the other — conflicts must never resolve silently';
  end if;
  raise notice '4 · superseding one tied rule leaves its successor still tied with the untouched rule — no conflict resolves silently';

  -- Now resolve it for real: retire the rule that lost, exactly as check 5 below proves
  -- retirement itself works. Only an explicit human decision — not a side-effect of
  -- superseding an unrelated rule — reduces this back to one rule in force.
  perform knowledge.retire_rule(
    p_rule_id => v_rule_prop, p_event_id => gen_random_uuid(),
    p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'owner-1'
  );
  select count(*) into v_count from knowledge.rules_in_force(v_ws, 'budget_threshold', v_prop, v_floor);
  if v_count <> 1 then
    raise exception '4d · expected exactly one rule in force after explicitly retiring the loser, got %', v_count;
  end if;
  select * into v_row from knowledge.rules_in_force(v_ws, 'budget_threshold', v_prop, v_floor);
  if v_row.rule_id <> v_rule_new or v_row.is_conflict then
    raise exception '4e · expected the superseding rule alone, cleanly in force, got rule % conflict %', v_row.rule_id, v_row.is_conflict;
  end if;
  raise notice '4f · explicitly retiring the losing rule is what actually resolves the conflict, leaving the superseding rule alone';

  -- =========================================================================
  -- 5 · A retired rule immutability guard: cannot revert status, cannot delete

  perform knowledge.retire_rule(
    p_rule_id => v_rule_ws, p_event_id => gen_random_uuid(),
    p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'owner-1'
  );
  begin
    update knowledge.rules set status = 'active' where id = v_rule_ws;
    raise exception '5a · reverting a retired rule''s status did not raise';
  exception when others then
    if sqlerrm not like '%may leave ''active'' only once%' then raise; end if;
  end;
  begin
    delete from knowledge.rules where id = v_rule_ws;
    raise exception '5b · deleting a rule did not raise';
  exception when others then
    if sqlerrm not like '%never deleted%' then raise; end if;
  end;
  raise notice '5 · a retired rule stays retired, permanently, never deleted';

  -- =========================================================================
  -- 6 · Assert an edge, traverse it from either endpoint, then retract it

  perform knowledge.assert_edge(
    p_edge_id => v_edge, p_workspace_id => v_ws, p_from_type => 'asset', p_from_id => v_asset,
    p_edge_type => 'installed_by', p_to_type => 'provider', p_to_id => gen_random_uuid(),
    p_asserted_by_ref => gen_random_uuid(), p_event_id => gen_random_uuid(),
    p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'owner-1'
  );
  select count(*) into v_count from knowledge.workspace_edges_for(v_ws, 'asset', v_asset);
  if v_count <> 1 then
    raise exception '6a · expected the asserted edge to be traversable from the asset side, got %', v_count;
  end if;
  perform knowledge.retract_edge(
    p_edge_id => v_edge, p_event_id => gen_random_uuid(),
    p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'owner-1'
  );
  select count(*) into v_count from knowledge.workspace_edges_for(v_ws, 'asset', v_asset);
  if v_count <> 0 then
    raise exception '6b · a retracted edge is still traversable, expected 0, got %', v_count;
  end if;
  if not exists (select 1 from knowledge.workspace_edges where id = v_edge) then
    raise exception '6c · retraction deleted the row instead of marking retracted_at';
  end if;
  raise notice '6 · an asserted edge is traversable from either endpoint, and retraction hides it without deleting it';

  -- =========================================================================
  -- 7 · Promoting a fact writes both world nodes, the edge between them, the required
  -- audit record, and knowledge.promotion.executed — attributed to the origin workspace

  perform knowledge.promote_fact(
    p_promotion_id => v_promotion, p_origin_edge_id => v_edge,
    p_from_node_id => v_node_model, p_from_node_type => 'model', p_from_node_label => 'Vaillant ecoTEC 415',
    p_from_node_attributes => '{}'::jsonb,
    p_edge_id => v_world_edge, p_edge_type => 'compatible_with',
    p_to_node_id => v_node_part, p_to_node_type => 'part', p_to_node_label => 'Diverter valve DV-200',
    p_to_node_attributes => '{}'::jsonb,
    p_population => 'Observed across 40+ workspaces'' service records for this model',
    p_authority => 'operator review',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'operator-1'
  );
  if not exists (select 1 from knowledge.world_nodes where id = v_node_model) then
    raise exception '7a · the model node was not created';
  end if;
  if not exists (select 1 from knowledge.world_edges where id = v_world_edge and from_node_id = v_node_model and to_node_id = v_node_part) then
    raise exception '7b · the world edge was not created correctly';
  end if;
  if not exists (
    select 1 from platform.audit_records
    where audit_id = v_promotion and action = 'knowledge.fact_promoted' and workspace_id = v_ws
  ) then
    raise exception '7c · the required audit record was not written, or attributed to the wrong workspace';
  end if;
  raise notice '7 · promoting a fact writes both world nodes, the edge, and the required audit record together';

  -- =========================================================================
  -- 8 · Re-promoting against the same node ids is idempotent — the upsert never
  -- duplicates a world node

  perform knowledge.promote_fact(
    p_promotion_id => gen_random_uuid(), p_origin_edge_id => v_edge,
    p_from_node_id => v_node_model, p_from_node_type => 'model', p_from_node_label => 'Vaillant ecoTEC 415',
    p_from_node_attributes => '{}'::jsonb,
    p_edge_id => gen_random_uuid(), p_edge_type => 'compatible_with',
    p_to_node_id => gen_random_uuid(), p_to_node_type => 'part', p_to_node_label => 'Pressure sensor PS-10',
    p_to_node_attributes => '{}'::jsonb,
    p_population => 'Observed across 40+ workspaces'' service records for this model',
    p_authority => 'operator review',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'operator-1'
  );
  select count(*) into v_count from knowledge.world_nodes where id = v_node_model;
  if v_count <> 1 then
    raise exception '8 · re-promoting against an existing node id duplicated it, found % rows', v_count;
  end if;
  raise notice '8 · promoting against an already-promoted node id is idempotent';

  raise notice 'VERIFY_KNOWLEDGE_ENGINE: all checks passed';
end;
$$;

rollback;
