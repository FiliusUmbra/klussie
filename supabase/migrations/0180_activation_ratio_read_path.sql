-- Activation Ratio — the Overview screen's first real content. See
-- ACTIVATION_RATIO_OVERVIEW_DESIGN.md for the full reasoning; this migration builds the
-- one new read path it specifies.
--
-- PLATFORM_ACTIVATION_PROGRAMME.md §4's OWN FORMULA, MADE COMPUTABLE — NOT NEW POLICY
--
-- "Activation Ratio (journey type, window) = count(platform.events rows of that
-- journey's event_type, in window) ÷ count(all completions of that journey, legacy +
-- platform, in window)." Five journeys, five rows, each a real event_type counted
-- against a real legacy table — see the design doc's own §2 table for which table, and
-- why journey 3 (Service Records) is measured differently: no legacy table predates it,
-- so it is measured against completed engagements in the same window instead.
--
-- SAME TWO-LAYER, EXISTS-GATED SHAPE AS platform.list_audit_records() (0133) — NOT
-- REINVENTED
--
-- Plain SECURITY INVOKER logic in platform, a thin SECURITY DEFINER delegate in api,
-- authorized by the same "real, active membership in a workspace holding
-- platform_operations" EXISTS predicate every other operator-only read already uses. A
-- non-operator caller gets zero rows, never an exception — matching every other read
-- switch in this codebase, not a new posture.
--
-- DELIBERATELY A READ, NOT A _for_caller WRITE WRAPPER — THE ROLE AUDIT DOES NOT APPLY
-- HERE
--
-- SUPPORT_ACCESS_DESIGN.md §1.3(b)'s own write-path role audit (0173-0179) drew a firm
-- line: reads are fine for a support-access grant to see, only writes needed the
-- role <> 'support' guard. This function is a read, following list_audit_records()'s own
-- unguarded EXISTS shape exactly — not re-litigated here, just applied consistently.
--
-- ratio IS null, NOT 0, WHEN A JOURNEY HAS PRODUCED NOTHING AT ALL
--
-- Division by zero is caught explicitly and returns null rather than erroring or
-- silently reading as 0 — a journey with truly nothing yet (both counts zero) is a
-- distinct, more honest state than "started, stalled at zero," matching §4's own
-- "reads 0%, honestly, rather than being invisible" principle applied one level further.

-- =========================================================================
-- THE LOGIC

create or replace function platform.activation_ratios_for_caller(p_window_days integer default 30)
returns table (
  journey_key     text,
  platform_count  bigint,
  legacy_count    bigint,
  ratio           numeric,
  window_from     timestamptz,
  window_to       timestamptz
)
language sql
stable
set search_path = ''
as $$
  with window_bounds as (
    select
      now() - make_interval(days => greatest(coalesce(p_window_days, 30), 1)) as window_from,
      now() as window_to
  ),
  operator_check as (
    select exists (
      select 1
      from workspace.current_memberships() m
      where workspace.workspace_has_capability(m.workspace_id, 'platform_operations')
    ) as is_operator
  ),
  counts as (
    select 'property_asset_recorded'::text as journey_key,
      (select count(*) from platform.events e, window_bounds w
        where e.event_type = 'property.asset.created' and e.occurred_at >= w.window_from and e.occurred_at <= w.window_to) as platform_count,
      (select count(*) from public.household_items h, window_bounds w
        where h.created_at >= w.window_from and h.created_at <= w.window_to) as legacy_count
    union all
    select 'request_to_booking'::text,
      (select count(*) from platform.events e, window_bounds w
        where e.event_type = 'marketplace.request.created' and e.occurred_at >= w.window_from and e.occurred_at <= w.window_to),
      (select count(*) from public.service_requests r, window_bounds w
        where r.created_at >= w.window_from and r.created_at <= w.window_to)
    union all
    select 'work_performed_to_service_record'::text,
      (select count(*) from platform.events e, window_bounds w
        where e.event_type = 'service_record.service_record.created' and e.occurred_at >= w.window_from and e.occurred_at <= w.window_to),
      (select count(*) from work.engagements g, window_bounds w
        where g.status = 'completed' and g.completed_at >= w.window_from and g.completed_at <= w.window_to)
    union all
    select 'conversation'::text,
      (select count(*) from platform.events e, window_bounds w
        where e.event_type = 'conversation.conversation.opened' and e.occurred_at >= w.window_from and e.occurred_at <= w.window_to),
      (select count(*) from public.conversations c, window_bounds w
        where c.created_at >= w.window_from and c.created_at <= w.window_to)
    union all
    select 'report_or_dispute'::text,
      (select count(*) from platform.events e, window_bounds w
        where e.event_type = 'safety.case.filed' and e.occurred_at >= w.window_from and e.occurred_at <= w.window_to),
      (select count(*) from public.reports p, window_bounds w
        where p.created_at >= w.window_from and p.created_at <= w.window_to)
  )
  select
    c.journey_key,
    c.platform_count,
    c.legacy_count,
    case when (c.platform_count + c.legacy_count) = 0 then null
         else round(c.platform_count::numeric / (c.platform_count + c.legacy_count), 4)
    end as ratio,
    w.window_from,
    w.window_to
  from counts c, window_bounds w, operator_check o
  where o.is_operator;
$$;

comment on function platform.activation_ratios_for_caller(integer) is
  'PLATFORM_ACTIVATION_PROGRAMME.md §4''s own Activation Ratio formula, made computable — five rows, one per named journey, platform.events counted against each journey''s real legacy comparator (ACTIVATION_RATIO_OVERVIEW_DESIGN.md §2 names each; work_performed_to_service_record is the one exception, measured against completed engagements since no legacy table predates Service Records). ratio is null, not 0, when a journey has produced nothing at all in the window. Restricted to callers with a real, active membership in a workspace holding platform_operations, the same EXISTS predicate platform.list_audit_records() (0133) already established — zero rows for a non-operator caller, never an exception. Deliberately a read, not a _for_caller write wrapper; SUPPORT_ACCESS_DESIGN.md''s own write-path role audit does not apply here. No SECURITY DEFINER of its own; reached only through api.activation_ratios().';

-- =========================================================================
-- THE DELEGATE

create or replace function api.activation_ratios(p_window_days integer default 30)
returns table (
  journey_key     text,
  platform_count  bigint,
  legacy_count    bigint,
  ratio           numeric,
  window_from     timestamptz,
  window_to       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from platform.activation_ratios_for_caller(p_window_days);
$$;

comment on function api.activation_ratios(integer) is
  'The Administration engine''s isolation contract for platform.activation_ratios_for_caller() (Overview screen, ROADMAP_C §3.1). Delegates entirely; holds no logic of its own.';

-- =========================================================================
-- ACCESS — explicit revokes, verified rather than assumed, the same discipline every
-- prior api.* delegate in this codebase follows.

revoke all on function api.activation_ratios(integer) from public, anon, service_role;
grant execute on function api.activation_ratios(integer) to authenticated;

-- platform.activation_ratios_for_caller() is granted to nobody at all — the same
-- posture platform.list_audit_records() already holds. Reachable only as a nested call
-- inside the SECURITY DEFINER delegate above.
