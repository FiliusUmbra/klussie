-- Epic 18 WP03 — the provider intelligence contract: produce a recommendation, record
-- the customer's selection or override, and read decisions back for a subject.
--
-- event_type FOLLOWS ADR-0019's OWN FORMAT FROM THE START — THE FOURTH EPIC IN A ROW
--
-- SYSTEM_ARCHITECTURE.md §9.3's own produced-event list decomposes directly:
-- RecommendationProduced -> provider_intelligence.recommendation.produced;
-- ProviderSelected -> provider_intelligence.recommendation.provider_selected;
-- RecommendationOverridden -> provider_intelligence.recommendation.overridden. Engine
-- token is `provider_intelligence`, the snake_case of §9.3's own section title — the same
-- derivation `service_record`/`knowledge` already used for their own section titles.
--
-- select_provider() VERIFIES THE CHOICE WAS ACTUALLY RECOMMENDED — override_recommendation()
-- DOES NOT, AND THAT ASYMMETRY IS THE WHOLE POINT OF HAVING BOTH FUNCTIONS
--
-- "Selected" means the customer accepted one of the providers the recommendation itself
-- named; "overridden" means they did not (PLATFORM_DOMAIN_MODEL.md §14.4: "A customer
-- overriding the recommendation is useful information"). select_provider() checks the
-- chosen provider actually appears in recommended_providers and refuses otherwise — a
-- caller trying to "select" a provider that was never recommended is calling the wrong
-- function, not this one with a bypassed check.
--
-- CUSTOMER INSTRUCTIONS OVERRIDE EVERYTHING — override_recommendation() TAKES A REQUIRED
-- REASON, NEVER OPTIONAL
--
-- §14.4's own words: "An explicit 'not them again,' or 'always use this firm,' is a
-- decision, not a signal to be weighed." Refused if blank, the same discipline
-- commerce.issue_credit() (Epic 14) already holds for its own required reason.
--
-- NO api.* DELEGATE — THE FOURTEENTH OCCURRENCE, AND ZERO NEW CROSS-SCHEMA GRANTS
--
-- Unlike every epic since 15, this migration needs no new grant statement at all —
-- klussie_engine_work already reaches everything its own contract touches, including
-- platform.events (via 0106's own fix, Epic 16), because this epic's aggregate lives in
-- the same schema Marketplace, Service Record, Workflow, Maintenance and Conversation
-- already share (0118's own header explains why). A direct, structural benefit of
-- resolving the schema-placement question by join locality rather than convenience.

-- =========================================================================
-- THE LOGIC — produce

create or replace function work.produce_recommendation(
  p_decision_id          uuid,
  p_workspace_id         uuid,
  p_subject_type         text,
  p_subject_id           uuid,
  p_recommended_providers jsonb,
  p_event_id             uuid,
  p_correlation_id       uuid,
  p_actor_type           platform.actor_type,
  p_actor_ref            text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into work.provider_decisions (
    id, workspace_id, subject_type, subject_id, recommended_providers, actor_type, actor_ref
  ) values (
    p_decision_id, p_workspace_id, p_subject_type, p_subject_id, p_recommended_providers, p_actor_type, p_actor_ref
  );

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'provider_intelligence.recommendation.produced',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => p_subject_type,
    p_subject_id     => p_subject_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('decisionId', p_decision_id, 'candidateCount', jsonb_array_length(p_recommended_providers))
  );
end;
$$;

comment on function work.produce_recommendation(uuid, uuid, text, uuid, jsonb, uuid, uuid, platform.actor_type, text) is
  'Records a recommendation with its reasoning captured at decision time (§9.3: "explainability is structural"). p_recommended_providers: [{providerType, providerRef, score, reasoning}, ...], required and non-empty (0118''s own check constraint).';

-- =========================================================================
-- THE LOGIC — select / override

create or replace function work.select_provider(
  p_decision_id       uuid,
  p_provider_type     text,
  p_provider_ref      uuid,
  p_event_id          uuid,
  p_correlation_id    uuid,
  p_actor_type        platform.actor_type,
  p_actor_ref         text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_workspace_id  uuid;
  v_subject_type  text;
  v_subject_id    uuid;
  v_was_recommended boolean;
begin
  select workspace_id, subject_type, subject_id,
    exists (
      select 1 from jsonb_array_elements(recommended_providers) r
      where r ->> 'providerType' = p_provider_type and (r ->> 'providerRef')::uuid = p_provider_ref
    )
    into v_workspace_id, v_subject_type, v_subject_id, v_was_recommended
  from work.provider_decisions
  where id = p_decision_id and decided_at is null and overridden_at is null;

  if v_workspace_id is null then
    raise exception
      'work.select_provider: decision % does not exist or has already reached an outcome', p_decision_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if not v_was_recommended then
    raise exception
      'work.select_provider: provider % was not among the recommended providers — use work.override_recommendation() instead', p_provider_ref
      using errcode = 'invalid_parameter_value';
  end if;

  update work.provider_decisions
  set selected_provider = jsonb_build_object('providerType', p_provider_type, 'providerRef', p_provider_ref),
      decided_at = now()
  where id = p_decision_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'provider_intelligence.recommendation.provider_selected',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => v_subject_type,
    p_subject_id     => v_subject_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('decisionId', p_decision_id, 'providerType', p_provider_type, 'providerRef', p_provider_ref)
  );
end;
$$;

comment on function work.select_provider(uuid, text, uuid, uuid, uuid, platform.actor_type, text) is
  'Records that the customer accepted one of the recommended providers. Refuses if the decision does not exist, already has an outcome, or the chosen provider was not actually recommended.';

create or replace function work.override_recommendation(
  p_decision_id       uuid,
  p_provider_type     text,
  p_provider_ref      uuid,
  p_reason            text,
  p_event_id          uuid,
  p_correlation_id    uuid,
  p_actor_type        platform.actor_type,
  p_actor_ref         text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_workspace_id  uuid;
  v_subject_type  text;
  v_subject_id    uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception
      'work.override_recommendation: p_reason is required — PLATFORM_DOMAIN_MODEL.md §14.4 treats an override as a decision, not a signal'
      using errcode = 'invalid_parameter_value';
  end if;

  select workspace_id, subject_type, subject_id into v_workspace_id, v_subject_type, v_subject_id
  from work.provider_decisions
  where id = p_decision_id and decided_at is null and overridden_at is null;

  if v_workspace_id is null then
    raise exception
      'work.override_recommendation: decision % does not exist or has already reached an outcome', p_decision_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  update work.provider_decisions
  set overridden_provider = jsonb_build_object('providerType', p_provider_type, 'providerRef', p_provider_ref),
      override_reason = p_reason,
      overridden_at = now()
  where id = p_decision_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'provider_intelligence.recommendation.overridden',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => v_subject_type,
    p_subject_id     => v_subject_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('decisionId', p_decision_id, 'providerType', p_provider_type, 'providerRef', p_provider_ref, 'reason', p_reason)
  );
end;
$$;

comment on function work.override_recommendation(uuid, text, uuid, text, uuid, uuid, platform.actor_type, text) is
  'Records that the customer chose a provider the recommendation did not name — no verification against recommended_providers, unlike select_provider(), because an override is deliberately allowed to disagree. p_reason is required, never optional (§14.4).';

-- =========================================================================
-- THE LOGIC — read

create or replace function work.provider_decisions_for(
  p_workspace_id  uuid,
  p_subject_type  text,
  p_subject_id    uuid
)
returns table (
  id                     uuid,
  recommended_providers  jsonb,
  recommended_at         timestamptz,
  selected_provider      jsonb,
  decided_at             timestamptz,
  overridden_provider    jsonb,
  override_reason        text,
  overridden_at          timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    d.id, d.recommended_providers, d.recommended_at,
    d.selected_provider, d.decided_at,
    d.overridden_provider, d.override_reason, d.overridden_at
  from work.provider_decisions d
  where d.workspace_id = p_workspace_id
    and d.subject_type = p_subject_type
    and d.subject_id = p_subject_id
  order by d.recommended_at desc;
$$;

comment on function work.provider_decisions_for(uuid, text, uuid) is
  'Every recommendation, and its outcome if one exists, for one subject — "Who should do this, and why?" (§9.3''s own public contract line).';

revoke all on function work.provider_decisions_for(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function work.provider_decisions_for(uuid, text, uuid) to klussie_engine_work;

-- =========================================================================
-- ACCESS — no api.* delegate, the same posture every engine contract has held since
-- Epic 09, now a fourteenth occurrence.

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'work.produce_recommendation(uuid, uuid, text, uuid, jsonb, uuid, uuid, platform.actor_type, text)',
    'work.select_provider(uuid, text, uuid, uuid, uuid, platform.actor_type, text)',
    'work.override_recommendation(uuid, text, uuid, text, uuid, uuid, platform.actor_type, text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated, service_role', fn);
    execute pg_catalog.format('grant execute on function %s to klussie_engine_work', fn);
  end loop;
end;
$$;
