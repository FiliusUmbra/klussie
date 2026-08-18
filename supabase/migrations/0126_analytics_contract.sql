-- Epic 21 WP03 — the analytics engine contract: record a workspace metric, promote a
-- platform metric, and read each back.
--
-- FUNCTIONS SPLIT ACROSS analytics_ws AND analytics_pf — THERE IS NO PLAIN `analytics`
-- SCHEMA
--
-- SUPABASE_ARCHITECTURE.md §2's own schema table names exactly ten schemas; `analytics_ws`
-- and `analytics_pf` are two of them, and there is no eleventh. Every function this
-- session has built lives in the schema that owns the table it touches (Epic 20's own
-- derived.* functions, not a separate `search` schema) — the same rule applied here:
-- record_workspace_metric()/workspace_metrics_for() live in analytics_ws;
-- promote_platform_metric()/platform_metrics_for() live in analytics_pf. "Analytics
-- Engine" (SYSTEM_ARCHITECTURE.md §10.3) names the engine and its event vocabulary, not a
-- third schema.
--
-- event_type FOLLOWS ADR-0019's OWN FORMAT FROM THE START — THE SIXTH EPIC IN A ROW
--
-- SYSTEM_ARCHITECTURE.md §10.3's own produced-event list has exactly one entry:
-- AnalyticsRefreshed -> analytics.metric.refreshed. Engine token is `analytics`, the
-- snake_case of §10.3's own section title — a token in the event vocabulary, independent
-- of which physical schema the emitting function lives in. Aggregate token is `metric`.
--
-- promote_platform_metric() HAS NO p_workspace_id PARAMETER AT ALL — STRUCTURALLY
-- UNREPRESENTABLE, NOT MERELY REFUSED AT RUNTIME
--
-- Epic 20's derived.mark_index_rebuilt() hit the identical problem (platform.events.
-- workspace_id is not null, Epic 13's own finding) for its own global domain and resolved
-- it by REFUSING a null workspace at runtime. This migration goes one step further: since
-- a promoted platform metric is by definition an aggregate with no single origin workspace
-- (DATABASE_ARCHITECTURE.md §31: "may hold only promoted aggregates"), the function simply
-- never accepts a workspace parameter to refuse in the first place. It cannot emit
-- platform.events (which requires one) and does not try to; its only durable trail is the
-- audit record below. record_workspace_metric(), by contrast, always has a real workspace
-- and emits normally.
--
-- promote_platform_metric() WRITES AN AUDIT RECORD WITH p_workspace_id => null —
-- SYSTEM_ARCHITECTURE.md §10.3's OWN "Dependencies: ... Knowledge (for promotion...)" LINE,
-- READ CORRECTLY
--
-- The dependency is on the DISCIPLINE Knowledge's own knowledge.promote_fact() established
-- (WP 16.03: "every promotion is an explicit, recorded, audited operation... naming what
-- was promoted, the population it was derived from, and who authorised it"), not a literal
-- call to promote_fact() itself — that function promotes world-graph facts, a different
-- aggregate entirely. promote_platform_metric() calls platform.write_audit_record()
-- directly, the same privileged path Epic 16 built. Unlike promote_fact()'s own call, this
-- one passes p_workspace_id => null: ADR-0021 ("one audit table with nullable workspace")
-- is exactly the case a platform-wide aggregate with no single origin workspace needs, and
-- platform.audit_records.workspace_id is nullable for precisely this reason —
-- platform.events.workspace_id is not.
--
-- THE FIRST CONSUMER ROLE GRANTED BOTH platform.emit_event() AND platform.write_audit_record()
--
-- Epic 20 granted klussie_consumer_search EXECUTE on platform.emit_event() — the first
-- consumer role granted either privileged function at all, fulfilling the case
-- 0023_emit_event.sql's own header left ungranted at Epic 01. klussie_consumer_analytics
-- needs both: emit_event() for record_workspace_metric()'s real-workspace refresh, and
-- write_audit_record() for promote_platform_metric()'s audited promotion — the first role
-- this session grants the second one to as well.

-- =========================================================================
-- THE LOGIC — write

create or replace function analytics_ws.record_workspace_metric(
  p_id              uuid,
  p_domain          text,
  p_workspace_id    uuid,
  p_metric_key      text,
  p_metric_value    numeric,
  p_dimensions      jsonb,
  p_period_start    timestamptz,
  p_period_end      timestamptz,
  p_source_event_id uuid,
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
  insert into analytics_ws.workspace_metrics (
    id, domain, workspace_id, metric_key, metric_value, dimensions,
    period_start, period_end, source_event_id
  ) values (
    p_id, p_domain, p_workspace_id, p_metric_key, p_metric_value, p_dimensions,
    p_period_start, p_period_end, p_source_event_id
  )
  on conflict (domain, workspace_id, metric_key, period_start, period_end) do update
    set metric_value    = excluded.metric_value,
        dimensions      = excluded.dimensions,
        computed_at     = now(),
        source_event_id = excluded.source_event_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'analytics.metric.refreshed',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'metric',
    p_subject_id     => p_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('domain', p_domain, 'metricKey', p_metric_key)
  );
end;
$$;

comment on function analytics_ws.record_workspace_metric(uuid, text, uuid, text, numeric, jsonb, timestamptz, timestamptz, uuid, uuid, uuid, platform.actor_type, text) is
  'Upserts one workspace-scoped metric for one period, keyed on (domain, workspace_id, metric_key, period_start, period_end), and emits analytics.metric.refreshed.';

create or replace function analytics_pf.promote_platform_metric(
  p_id              uuid,
  p_domain          text,
  p_metric_key      text,
  p_metric_value    numeric,
  p_dimensions      jsonb,
  p_period_start    timestamptz,
  p_period_end      timestamptz,
  p_promotion_id    uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text,
  p_authority       text,
  p_correlation_id  uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into analytics_pf.platform_metrics (
    id, domain, metric_key, metric_value, dimensions, period_start, period_end
  ) values (
    p_id, p_domain, p_metric_key, p_metric_value, p_dimensions, p_period_start, p_period_end
  )
  on conflict (domain, metric_key, period_start, period_end) do update
    set metric_value = excluded.metric_value,
        dimensions   = excluded.dimensions,
        promoted_at  = now();

  perform platform.write_audit_record(
    p_audit_id       => p_promotion_id,
    p_workspace_id   => null,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_action         => 'analytics.metric_promoted',
    p_subject_type   => 'platform_metric',
    p_subject_id     => p_id,
    p_outcome        => 'permitted',
    p_authority      => p_authority,
    p_correlation_id => p_correlation_id,
    p_detail         => jsonb_build_object('domain', p_domain, 'metricKey', p_metric_key)
  );
end;
$$;

comment on function analytics_pf.promote_platform_metric(uuid, text, text, numeric, jsonb, timestamptz, timestamptz, uuid, platform.actor_type, text, text, uuid) is
  'Upserts one platform-scoped aggregate metric and writes an audited promotion record with a null workspace (ADR-0021) — no platform.events row, structurally: this function has no workspace to attribute one to.';

-- =========================================================================
-- THE LOGIC — read

create or replace function analytics_ws.workspace_metrics_for(
  p_workspace_id uuid,
  p_domain       text
)
returns table (
  id           uuid,
  metric_key   text,
  metric_value numeric,
  dimensions   jsonb,
  period_start timestamptz,
  period_end   timestamptz,
  computed_at  timestamptz
)
language sql
stable
set search_path = ''
as $$
  select m.id, m.metric_key, m.metric_value, m.dimensions, m.period_start, m.period_end, m.computed_at
  from analytics_ws.workspace_metrics m
  where m.workspace_id = p_workspace_id and m.domain = p_domain
  order by m.period_start desc;
$$;

comment on function analytics_ws.workspace_metrics_for(uuid, text) is
  'Every metric for one workspace, one domain, most recent period first.';

create or replace function analytics_pf.platform_metrics_for(
  p_domain text
)
returns table (
  id           uuid,
  metric_key   text,
  metric_value numeric,
  dimensions   jsonb,
  period_start timestamptz,
  period_end   timestamptz,
  promoted_at  timestamptz
)
language sql
stable
set search_path = ''
as $$
  select m.id, m.metric_key, m.metric_value, m.dimensions, m.period_start, m.period_end, m.promoted_at
  from analytics_pf.platform_metrics m
  where m.domain = p_domain
  order by m.period_start desc;
$$;

comment on function analytics_pf.platform_metrics_for(text) is
  'Every promoted metric for one platform-scoped domain, most recent period first. No workspace parameter — this domain has none.';

-- =========================================================================
-- ACCESS — klussie_consumer_analytics only. No api.* delegate — the sixteenth occurrence.

grant usage on schema platform to klussie_consumer_analytics;

grant execute on function platform.emit_event(
  uuid, text, uuid, platform.actor_type, text, text, uuid, uuid,
  jsonb, uuid, smallint, boolean, timestamptz
) to klussie_consumer_analytics;

grant execute on function platform.write_audit_record(
  uuid, uuid, platform.actor_type, text, text, text, uuid,
  platform.audit_outcome, text, uuid, jsonb, timestamptz
) to klussie_consumer_analytics;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'analytics_ws.record_workspace_metric(uuid, text, uuid, text, numeric, jsonb, timestamptz, timestamptz, uuid, uuid, uuid, platform.actor_type, text)',
    'analytics_pf.promote_platform_metric(uuid, text, text, numeric, jsonb, timestamptz, timestamptz, uuid, platform.actor_type, text, text, uuid)',
    'analytics_ws.workspace_metrics_for(uuid, text)',
    'analytics_pf.platform_metrics_for(text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated, service_role', fn);
    execute pg_catalog.format('grant execute on function %s to klussie_consumer_analytics', fn);
  end loop;
end;
$$;
