-- Platform Activation Slice 1, WP 1.2 — the maintenance read delegates.
--
-- Unlike Location (WP 1.1), the real logic already exists —
-- work.my_maintenance_schedules()/my_maintenance_obligations() (0074, Epic 10) — but
-- 0074's own test file names the reason nothing calls them yet directly: "the 'no api.*
-- delegate yet' posture Epic 09 established." Checked directly before writing this: both
-- functions take p_workspace_id with NO membership check at all internally
-- (`where o.workspace_id = p_workspace_id`, nothing joining workspace.current_memberships()).
-- Exposing either through an api delegate unchanged would let any authenticated caller
-- read any workspace's maintenance by guessing an id — SLICE_1_PROPERTY_ASSET_ACTIVATION.md
-- §1.1 named this precisely as why these two are "half-built," not merely unwired.
--
-- BOTH FUNCTIONS ARE RE-DEFINED HERE, NOT LEFT AS-IS BEHIND A CHECKING DELEGATE
--
-- The established convention throughout this session (property.my_assets(),
-- platform.list_audit_records(), workspace.my_workspace_has_capability()) puts the
-- authorization check in the LOGIC function, never only in the delegate — the api layer
-- is a thin pass-through with no logic of its own, so a future second caller of the work.*
-- functions (there is none today, checked: no other migration references either name)
-- inherits the check automatically rather than needing to remember it. 0074's own test
-- (maintenanceContract.test.js) is scoped to that file's own text and is unaffected by
-- re-defining these functions again here — the same reason this pattern is safe every
-- time this session has used it.
--
-- THE CHECK IS AN EXISTS PREDICATE, NOT A JOIN — MATCHING platform.list_audit_records()'s
-- OWN SHAPE, NOT property.my_assets()'s
--
-- property.my_assets() joins through property.properties to reach the steward workspace,
-- because an asset has no workspace_id of its own. A maintenance obligation/schedule
-- already carries workspace_id directly — the exact single-workspace-parameter shape
-- WP 0.4's list_audit_records() already established an EXISTS predicate for, reused here
-- rather than inventing a join through nothing.

create or replace function work.my_maintenance_schedules(p_workspace_id uuid)
returns table (
  id            uuid,
  asset_id      uuid,
  location_id   uuid,
  title         text,
  description   text,
  recurrence    interval,
  next_due_on   date,
  active        boolean
)
language sql
stable
set search_path = ''
as $$
  select s.id, s.asset_id, s.location_id, s.title, s.description, s.recurrence, s.next_due_on, s.active
  from work.maintenance_schedules s
  where s.workspace_id = p_workspace_id
    and exists (select 1 from workspace.current_memberships() m where m.workspace_id = p_workspace_id);
$$;

comment on function work.my_maintenance_schedules(uuid) is
  'A workspace''s own maintenance schedules (Epic 10, 0074), now checking the caller''s real membership before returning anything (WP 1.2) — the check Epic 09''s own "no api.* delegate yet" posture deferred. Reached by any authenticated client only through api.my_maintenance_schedules(); klussie_engine_work also retains the direct EXECUTE 0074 granted it, unused by any real caller today.';

create or replace function work.my_maintenance_obligations(p_workspace_id uuid)
returns table (
  id             uuid,
  asset_id       uuid,
  location_id    uuid,
  schedule_id    uuid,
  title          text,
  description    text,
  source         text,
  due_on         date,
  status         text,
  is_overdue     boolean,
  completed_at   timestamptz,
  cancelled_at   timestamptz
)
language sql
stable
set search_path = ''
as $$
  select o.id, o.asset_id, o.location_id, o.schedule_id, o.title, o.description, o.source, o.due_on, o.status,
         (o.status = 'open' and o.due_on < current_date) as is_overdue,
         o.completed_at, o.cancelled_at
  from work.maintenance_obligations o
  where o.workspace_id = p_workspace_id
    and exists (select 1 from workspace.current_memberships() m where m.workspace_id = p_workspace_id);
$$;

comment on function work.my_maintenance_obligations(uuid) is
  'A workspace''s own maintenance obligations (Epic 10, 0074), now checking the caller''s real membership before returning anything (WP 1.2). is_overdue computed at read time, unchanged. Reached by any authenticated client only through api.my_maintenance_obligations(); klussie_engine_work also retains the direct EXECUTE 0074 granted it, unused by any real caller today.';

-- =========================================================================
-- THE DELEGATES

create or replace function api.my_maintenance_schedules(p_workspace_id uuid)
returns table (
  id            uuid,
  asset_id      uuid,
  location_id   uuid,
  title         text,
  description   text,
  recurrence    interval,
  next_due_on   date,
  active        boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.my_maintenance_schedules(p_workspace_id);
$$;

comment on function api.my_maintenance_schedules(uuid) is
  'The Maintenance engine''s client-facing delegate for a workspace''s schedules (WP 1.2). Delegates entirely to work.my_maintenance_schedules(), which holds all the logic.';

create or replace function api.my_maintenance_obligations(p_workspace_id uuid)
returns table (
  id             uuid,
  asset_id       uuid,
  location_id    uuid,
  schedule_id    uuid,
  title          text,
  description    text,
  source         text,
  due_on         date,
  status         text,
  is_overdue     boolean,
  completed_at   timestamptz,
  cancelled_at   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.my_maintenance_obligations(p_workspace_id);
$$;

comment on function api.my_maintenance_obligations(uuid) is
  'The Maintenance engine''s client-facing delegate for a workspace''s obligations (WP 1.2), including the is_overdue flag the client''s due/overdue list (WP 1.3) reads directly rather than computing client-side.';

-- =========================================================================
-- ACCESS — `authenticated` already holds USAGE on schema api (0031); not re-granted here.

revoke all on function api.my_maintenance_schedules(uuid) from public, anon, service_role;
grant execute on function api.my_maintenance_schedules(uuid) to authenticated;

revoke all on function api.my_maintenance_obligations(uuid) from public, anon, service_role;
grant execute on function api.my_maintenance_obligations(uuid) to authenticated;

-- Both work.* functions are granted to nobody CLIENT-FACING — reachable by an
-- authenticated caller only as a nested call inside the SECURITY DEFINER delegates above,
-- the same posture as property.my_assets(). Unlike that precedent, though,
-- klussie_engine_work retains its own direct EXECUTE grant from 0074 (revoked only from
-- public/anon/authenticated/service_role, unchanged here) — harmless and unused by any
-- real caller today, left alone rather than revoked as part of an unrelated work package.
revoke all on function work.my_maintenance_schedules(uuid) from public, anon, authenticated, service_role;
revoke all on function work.my_maintenance_obligations(uuid) from public, anon, authenticated, service_role;
