-- Platform Activation Slice 2, WP 2.6 — work.requests gains details_json/ai_analysis/
-- city, a real gap found writing the client cutover, not a speculative addition.
--
-- A REAL REGRESSION, CAUGHT BEFORE SHIPPING, NOT AFTER
--
-- work.requests (0085) never carried public.service_requests.details_json/ai_analysis/
-- city at all — Epic 12's own scope was requests/quotes/engagements as a lifecycle
-- model, not a field-for-field port of every legacy column. Checked directly before
-- finishing the client cutover: RequestDetailSheet.jsx renders
-- JobDetailsSummary/AiAnalysisSummary from exactly these two fields, on every request a
-- customer opens, including ones created through AI intake (src/home/useConversation.js)
-- — real, live, currently-working functionality. Cutting the customer-side read over to
-- work.* without these columns would have silently dropped the AI analysis and
-- structured answers from every request created after this ships — the kind of "missing
-- data" this slice was explicitly told not to produce. city is added alongside for the
-- same reason ProDashboard.jsx already renders it (that screen stays legacy-sourced —
-- fetchProLeads() is unaffected either way, §1.7 — but a request's own city belongs on
-- the request wherever it lives, not only where today's one reader happens to be).
--
-- ANOTHER "CONDITIONAL, ALWAYS-RUN" FOLLOW-UP UPDATE — THE SAME SHAPE ALREADY
-- ESTABLISHED FOUR TIMES
--
-- work.create_request() itself remains completely unmodified; its own INSERT was never
-- asked to carry these. create_request_for_caller() patches them in via one more
-- follow-up UPDATE, unconditionally (unlike the directed-booking columns, there is no
-- "only when directing" condition here — an ordinary request may have AI analysis too).

alter table work.requests
  add column if not exists details_json jsonb,
  add column if not exists ai_analysis jsonb,
  add column if not exists city text;

comment on column work.requests.details_json is
  'Structured answers from the intake form or AI conversation, mirroring public.service_requests.details_json — rendered by JobDetailsSummary (RequestDetailSheet.jsx, ProDashboard.jsx). Nullable: most requests still have none.';
comment on column work.requests.ai_analysis is
  'The AI Gateway''s own read of the request, mirroring public.service_requests.ai_analysis — rendered by AiAnalysisSummary. Nullable: not every request goes through AI intake.';
comment on column work.requests.city is
  'The request''s own city, mirroring public.service_requests.city. Nullable.';

-- =========================================================================
-- work.create_request_for_caller()/api.create_request() — gain the three fields.
-- Dropped by the exact prior (post-0150) signature first — a changed parameter list is
-- a different signature to Postgres, the same discipline 0148/0150/0153 already
-- established.

drop function if exists work.create_request_for_caller(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text);
drop function if exists api.create_request(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text);

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
    select 1 from workspace.current_memberships() m where m.workspace_id = p_requesting_workspace_id
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
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
  'Creates a request for a caller with a real, active membership in the requesting workspace (unchanged from 0146/0150). p_details_json/p_ai_analysis/p_city, p_service_request_id and the directed-booking columns are all patched in via follow-up UPDATEs, the same shape — work.create_request() itself is never asked to carry any of them.';

create or replace function api.create_request(
  p_request_id uuid, p_requesting_workspace_id uuid, p_property_id uuid, p_asset_id uuid, p_location_id uuid,
  p_category_id text, p_service_id uuid, p_details text, p_when_pref text, p_budget numeric,
  p_details_json jsonb, p_ai_analysis jsonb, p_city text,
  p_service_request_id uuid, p_directed_workspace_id uuid, p_auto_accept_max numeric,
  p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.create_request_for_caller(
    p_request_id, p_requesting_workspace_id, p_property_id, p_asset_id, p_location_id,
    p_category_id, p_service_id, p_details, p_when_pref, p_budget,
    p_details_json, p_ai_analysis, p_city,
    p_service_request_id, p_directed_workspace_id, p_auto_accept_max,
    p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

-- =========================================================================
-- work.my_requests()/api.my_requests() — gain the three fields, dropped first (0153's
-- own signature)

drop function if exists work.my_requests(uuid);
drop function if exists api.my_requests(uuid);

create or replace function work.my_requests(p_workspace_id uuid)
returns table (
  id uuid, requesting_workspace_id uuid, property_id uuid, asset_id uuid, location_id uuid,
  category_id text, service_id uuid, details text, when_pref text, budget numeric,
  details_json jsonb, ai_analysis jsonb, city text,
  status text, workflow_instance_id uuid, created_at timestamptz, updated_at timestamptz,
  directed_workspace_id uuid, directed_until timestamptz, auto_accept_max numeric
)
language sql
stable
set search_path = ''
as $$
  select r.id, r.requesting_workspace_id, r.property_id, r.asset_id, r.location_id,
         r.category_id, r.service_id, r.details, r.when_pref, r.budget,
         r.details_json, r.ai_analysis, r.city,
         r.status, r.workflow_instance_id, r.created_at, r.updated_at,
         r.directed_workspace_id, r.directed_until, r.auto_accept_max
  from work.requests r
  join workspace.current_memberships() m on m.workspace_id = p_workspace_id
  where r.requesting_workspace_id = p_workspace_id;
$$;

comment on function work.my_requests(uuid) is
  'Every request the given workspace has made, full row including details_json/ai_analysis/city, for a caller with a real, active membership in it. Extended in WP 2.6 twice now — 0153 for the base full-row shape, this migration for the structured-intake fields found missing while finishing the client cutover.';

create or replace function api.my_requests(p_workspace_id uuid)
returns table (
  id uuid, requesting_workspace_id uuid, property_id uuid, asset_id uuid, location_id uuid,
  category_id text, service_id uuid, details text, when_pref text, budget numeric,
  details_json jsonb, ai_analysis jsonb, city text,
  status text, workflow_instance_id uuid, created_at timestamptz, updated_at timestamptz,
  directed_workspace_id uuid, directed_until timestamptz, auto_accept_max numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.my_requests(p_workspace_id);
$$;

-- =========================================================================
-- work.resolve_request()/api.resolve_request() — gain the three fields too, the same
-- reasoning: a customer opening one request's own detail view needs them just as much
-- as the list does. Dropped by the exact prior (0090's own, unmodified until now)
-- signature.

drop function if exists work.resolve_request(uuid);
drop function if exists api.resolve_request(uuid);

create or replace function work.resolve_request(p_request_id uuid)
returns table (
  id uuid, requesting_workspace_id uuid, property_id uuid, asset_id uuid, location_id uuid,
  category_id text, service_id uuid, details text, when_pref text, budget numeric,
  details_json jsonb, ai_analysis jsonb, city text,
  status text, workflow_instance_id uuid, created_at timestamptz, updated_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select r.id, r.requesting_workspace_id, r.property_id, r.asset_id, r.location_id,
         r.category_id, r.service_id, r.details, r.when_pref, r.budget,
         r.details_json, r.ai_analysis, r.city,
         r.status, r.workflow_instance_id, r.created_at, r.updated_at
  from work.requests r
  where r.id = p_request_id
    and (
      r.requesting_workspace_id in (select workspace_id from workspace.current_memberships())
      or r.id in (
        select q.request_id from work.quotes q
        where q.offering_workspace_id in (select workspace_id from workspace.current_memberships())
      )
    );
$$;

comment on function work.resolve_request(uuid) is
  'One request, full row including details_json/ai_analysis/city, for a caller whose real membership is either the requesting workspace or a workspace that has quoted on it (WP 2.1''s own two-sided shape, unchanged). Extended in WP 2.6 for the structured-intake fields, matching my_requests()''s own extension in this same migration.';

create or replace function api.resolve_request(p_request_id uuid)
returns table (
  id uuid, requesting_workspace_id uuid, property_id uuid, asset_id uuid, location_id uuid,
  category_id text, service_id uuid, details text, when_pref text, budget numeric,
  details_json jsonb, ai_analysis jsonb, city text,
  status text, workflow_instance_id uuid, created_at timestamptz, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.resolve_request(p_request_id);
$$;

-- =========================================================================
-- ACCESS

revoke all on function work.create_request_for_caller(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, jsonb, jsonb, text, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function api.create_request(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, jsonb, jsonb, text, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
grant execute on function api.create_request(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, jsonb, jsonb, text, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text) to authenticated;

revoke all on function work.my_requests(uuid) from public, anon, authenticated, service_role;
revoke all on function api.my_requests(uuid) from public, anon, service_role;
grant execute on function api.my_requests(uuid) to authenticated;

revoke all on function work.resolve_request(uuid) from public, anon, authenticated, service_role;
revoke all on function api.resolve_request(uuid) from public, anon, service_role;
grant execute on function api.resolve_request(uuid) to authenticated;
