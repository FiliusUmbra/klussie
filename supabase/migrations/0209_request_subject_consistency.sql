-- CONFIRMED ON CURRENT main BEFORE WRITING THIS FILE
--
-- The property_id/asset_id/location_id ownership gap named in this session's own audit
-- was already closed by 0208_request_property_location_ownership.sql (PR #153, merged).
-- Re-inspected directly on origin/main, not from memory: work.create_request_for_caller()
-- currently rejects a p_property_id, p_asset_id, or p_location_id not stewarded by
-- p_requesting_workspace_id, each independently. That part of the reported finding is
-- fixed and does not need re-fixing here.
--
-- A REAL GAP FOUND WHILE RE-AUDITING SUBJECT PATHS, NOT PART OF THE ORIGINAL REPORT
--
-- 0208's own checks validate each of property_id/asset_id/location_id against the
-- requesting workspace independently, but never against EACH OTHER. A real client caller
-- sends more than one of these together today: src/lib/requests.js's createServiceRequest()
-- always sends p_property_id (from resolveRequestLocation()) alongside an optional
-- p_asset_id (from ItemAssociationField.jsx). Confirmed live in this codebase:
-- ItemAssociationField.jsx resolves its own item list from `props[0]?.id` — the
-- workspace's FIRST property, not necessarily the property ServiceLocationField.jsx has
-- selected. A customer with more than one property can pick property B as the service
-- location while the independently-populated item picker still offers items that live at
-- property A, and nothing before this migration ever caught the mismatch: both checks
-- pass independently (each id really is stewarded by the same workspace), so
-- work.requests would carry property_id = B and asset_id = an asset actually installed at
-- A. Not a malicious cross-tenant read — a genuine data-integrity gap reachable by an
-- ordinary customer through the existing UI, with the consequences named in this
-- session's own audit: wrong approximate-location matching, a Service Record attached to
-- the wrong property's history, wrong Property Memory going forward.
--
-- THE FIX
--
-- Two new checks, evaluated after 0208's three ownership checks and before the
-- directed-booking validation, so an authorization failure is still reported before any
-- consistency failure and neither ever reaches work.create_request()'s own INSERT:
-- property_id+asset_id must share a property, and property_id+location_id must share a
-- property. Each check only fires when both sides of the pair are non-null, so every
-- existing single-subject and no-subject path is completely unaffected. Same
-- non-enumerating shape as every check in this function: "not exists" conflates "does not
-- belong to that property" with "does not exist at all" into the identical
-- insufficient_privilege outcome, exactly like 0204/0208's own ownership checks already
-- do for a foreign vs. unknown id.
--
-- NO THIRD (asset_id+location_id) CHECK -- CONFIRMED UNREACHABLE, NOT AN OVERSIGHT
--
-- work.requests already carries a table-level check constraint from its own original
-- migration, unrelated to this fix: requests_at_most_one_subject ==
-- num_nonnulls(asset_id, location_id) <= 1. asset_id and location_id can never both be
-- non-null on any row this function could ever produce, regardless of anything checked
-- here -- confirmed live on staging (a genuinely non-matching asset+location attempt was
-- rejected by this constraint, sqlstate 23514, before this migration's own consistency
-- checks were even written to test it). Adding an application-level asset/location
-- consistency check on top of an unconditional table constraint that already forbids the
-- pair entirely would be dead code checking an input shape that cannot exist -- exactly
-- the kind of parallel, duplicate logic this checkpoint was told not to create. property_id
-- is NOT part of that constraint (it can and does coexist with either asset_id or
-- location_id), which is why the two checks below are real and necessary.
--
-- NOT CHANGED, AUDITED DELIBERATELY
--
-- property.assets.lifecycle_state (active|retired|disposed, 0139) is not filtered here,
-- matching 0204's and 0208's own unfiltered behavior for asset_id: this function has
-- never restricted requests to active-lifecycle assets, and inventing that restriction
-- now would be a new lifecycle rule this checkpoint was explicitly told not to add.
-- workspace.current_memberships() already excludes every scoped (engagement-derived)
-- membership (0161 §1, restored live by 0194) and this function's own top check already
-- excludes role = 'support' (0175) — both confirmed still present below, unchanged, and
-- both re-verified live in this checkpoint's own diagnostic rather than assumed from
-- memory.
--
-- SAME SIGNATURE, SAME MECHANISM AS 0204/0208 — NOT A NEW DECISION
--
-- No parameter added or removed, no return type change, no grant change: still the real,
-- current 20-parameter signature (confirmed by grepping every migration that has ever
-- redefined this function — 0146, 0150, 0154, 0161, 0174 (no-op elsewhere), 0175, 0204,
-- 0208 — before writing this one, learning directly from PR #151's own near-miss where a
-- redefinition against a stale signature silently created a dead, unused overload).

create or replace function work.create_request_for_caller(
  p_request_id              uuid,
  p_requesting_workspace_id uuid,
  p_property_id             uuid,
  p_asset_id                uuid,
  p_location_id             uuid,
  p_category_id             text,
  p_service_id              uuid,
  p_details                 text,
  p_when_pref               text,
  p_budget                  numeric,
  p_details_json            jsonb,
  p_ai_analysis             jsonb,
  p_city                    text,
  p_service_request_id      uuid,
  p_directed_workspace_id   uuid,
  p_auto_accept_max         numeric,
  p_event_id                uuid,
  p_correlation_id          uuid,
  p_actor_type              platform.actor_type,
  p_actor_ref               text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = p_requesting_workspace_id and m.role <> 'support'
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  if p_property_id is not null and not exists (
    select 1 from property.properties p
    where p.id = p_property_id and p.steward_workspace_id = p_requesting_workspace_id
  ) then
    raise exception
      'work.create_request_for_caller: property % is not stewarded by workspace %', p_property_id, p_requesting_workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  if p_asset_id is not null and not exists (
    select 1 from property.assets a
    join property.properties p on p.id = a.property_id
    where a.id = p_asset_id and p.steward_workspace_id = p_requesting_workspace_id
  ) then
    raise exception
      'work.create_request_for_caller: asset % is not stewarded by workspace %', p_asset_id, p_requesting_workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  if p_location_id is not null and not exists (
    select 1 from property.locations l
    join property.properties p on p.id = l.property_id
    where l.id = p_location_id and p.steward_workspace_id = p_requesting_workspace_id
  ) then
    raise exception
      'work.create_request_for_caller: location % is not stewarded by workspace %', p_location_id, p_requesting_workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  -- Consistency (0209): each check above proves a given subject belongs to THIS
  -- workspace, but not that two given subjects belong to the SAME property. A well-
  -- behaved client can send property_id alongside asset_id or location_id together (see
  -- this migration's own header) — checked only when both sides of a pair are actually
  -- given, so every single-subject and no-subject path is unaffected. No asset_id+
  -- location_id check: requests_at_most_one_subject (this table's own pre-existing check
  -- constraint) already makes that pair mutually exclusive unconditionally — see this
  -- migration's own header.

  if p_property_id is not null and p_asset_id is not null and not exists (
    select 1 from property.assets a where a.id = p_asset_id and a.property_id = p_property_id
  ) then
    raise exception
      'work.create_request_for_caller: asset % does not belong to property %', p_asset_id, p_property_id
      using errcode = 'insufficient_privilege';
  end if;

  if p_property_id is not null and p_location_id is not null and not exists (
    select 1 from property.locations l where l.id = p_location_id and l.property_id = p_property_id
  ) then
    raise exception
      'work.create_request_for_caller: location % does not belong to property %', p_location_id, p_property_id
      using errcode = 'insufficient_privilege';
  end if;

  if p_directed_workspace_id is not null then
    if p_auto_accept_max is null or p_auto_accept_max <= 0 then
      raise exception 'work.create_request_for_caller: a directed request requires a positive auto_accept_max'
        using errcode = 'invalid_parameter_value';
    end if;
    if not exists (select 1 from workspace.workspaces w where w.id = p_directed_workspace_id) then
      raise exception 'work.create_request_for_caller: directed_workspace_id does not name a real workspace'
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  perform work.create_request(
    p_request_id => p_request_id, p_requesting_workspace_id => p_requesting_workspace_id,
    p_property_id => p_property_id, p_asset_id => p_asset_id, p_location_id => p_location_id,
    p_category_id => p_category_id, p_service_id => p_service_id, p_details => p_details,
    p_when_pref => p_when_pref, p_budget => p_budget,
    p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );

  update work.requests
  set details_json = p_details_json,
      ai_analysis = p_ai_analysis,
      city = p_city
  where id = p_request_id;

  if p_directed_workspace_id is not null then
    update work.requests
    set directed_workspace_id = p_directed_workspace_id,
        directed_until = now() + interval '24 hours',
        auto_accept_max = p_auto_accept_max
    where id = p_request_id;
  end if;

  if p_service_request_id is not null then
    update work.requests
    set service_request_id = p_service_request_id
    where id = p_request_id;
  end if;
end;
$$;

comment on function work.create_request_for_caller(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, jsonb, jsonb, text, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text) is
  'Creates a request for a caller with a real, active, unscoped (0161/0194) membership in the requesting workspace, excluding a support-role grant (0175). Refuses a given property_id, asset_id (0204), or location_id (0208) not actually stewarded by that same workspace, and refuses a given property_id paired with an asset_id or location_id that does not belong to it (0209) -- no separate asset_id+location_id check, since requests_at_most_one_subject already makes that pair mutually exclusive unconditionally. Delegates entirely to the unmodified work.create_request() for the base row and event, then patches details_json/ai_analysis/city, the directed-booking columns, and service_request_id in follow-up UPDATEs -- unchanged from 0204/0175 other than the checks named above.';
