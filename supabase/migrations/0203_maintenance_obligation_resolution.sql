-- Maintenance resolution slice — a homeowner can finally mark a maintenance task done or
-- cancel one, closing the gap this exact codebase already named twice: ItemDetailSheet.jsx's
-- own header ("Marking a task complete or cancelling one is a real, separate gap...
-- deliberately not built as part of adding creation") and this migration's own audit,
-- repeated here for anyone reading only this file.
--
-- work.complete_maintenance_obligation() / work.cancel_maintenance_obligation() (0074)
-- ALREADY EXIST AND ARE ALREADY CORRECT -- BUT HAVE NO AUTHORIZATION CHECK AT ALL
--
-- Both are a bare `update work.maintenance_obligations set status = ... where id =
-- p_obligation_id and status = 'open'` — no membership check, nothing. That is not a bug
-- in them: they are raw, internal-only logic, granted only to klussie_engine_work (0074's
-- own ACCESS block), the same "unauthenticated-context" tier work.create_maintenance_
-- obligation() itself sits at (0142's own comment: "'schedule'/'compliance'/'prediction'
-- keep calling it directly, unauthenticated-context, unchanged"). Exposing either one
-- directly to a real caller would let ANY authenticated user complete or cancel ANY
-- obligation in the database just by guessing a UUID.
--
-- THE FIX IS THE SAME "_for_caller" WRAPPER PATTERN THIS CODEBASE HAS NOW ESTABLISHED
-- TWICE (work.create_manual_maintenance_obligation(), 0142; property.move_asset_for_
-- caller(), 0201) -- NOT A NEW DECISION
--
-- Each new *_for_caller() function resolves the obligation's own workspace_id, checks the
-- caller has a live membership in it (collapsing "does not exist" and "not yours" into
-- the exact same error, never leaked as which), then delegates to the existing raw
-- function unchanged. Neither raw function, nor its existing grant to klussie_engine_work,
-- is touched by this migration — the same restraint 0142's own header held for
-- work.create_maintenance_obligation() itself.
--
-- CANCELLING STILL REQUIRES A REASON -- ENFORCED WHERE IT ALREADY WAS
--
-- work.cancel_maintenance_obligation() already raises before ever reaching the table's
-- own not-null-when-cancelled check (0072); this migration adds no new validation on top
-- of it, only the membership gate in front of it.

-- =========================================================================
-- THE LOGIC — work.complete_maintenance_obligation_for_caller()

create or replace function work.complete_maintenance_obligation_for_caller(
  p_obligation_id   uuid,
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
  select workspace_id into v_workspace_id
  from work.maintenance_obligations
  where id = p_obligation_id;

  if v_workspace_id is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_workspace_id
  ) then
    raise exception
      'work.complete_maintenance_obligation_for_caller: caller may not complete obligation %', p_obligation_id
      using errcode = 'insufficient_privilege';
  end if;

  perform work.complete_maintenance_obligation(p_obligation_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
end;
$$;

comment on function work.complete_maintenance_obligation_for_caller(uuid, uuid, uuid, platform.actor_type, text) is
  'The first real live-caller entry point to work.complete_maintenance_obligation() (0074) — checks the caller has a live membership in the obligation''s own workspace, "does not exist" and "not yours" raising the identical error, then delegates unchanged. Not SECURITY DEFINER, granted to nobody, reachable only from api.complete_maintenance_obligation().';

-- =========================================================================
-- THE LOGIC — work.cancel_maintenance_obligation_for_caller()

create or replace function work.cancel_maintenance_obligation_for_caller(
  p_obligation_id   uuid,
  p_reason          text,
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
  select workspace_id into v_workspace_id
  from work.maintenance_obligations
  where id = p_obligation_id;

  if v_workspace_id is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_workspace_id
  ) then
    raise exception
      'work.cancel_maintenance_obligation_for_caller: caller may not cancel obligation %', p_obligation_id
      using errcode = 'insufficient_privilege';
  end if;

  perform work.cancel_maintenance_obligation(p_obligation_id, p_reason, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
end;
$$;

comment on function work.cancel_maintenance_obligation_for_caller(uuid, text, uuid, uuid, platform.actor_type, text) is
  'The first real live-caller entry point to work.cancel_maintenance_obligation() (0074) — same membership gate as complete_maintenance_obligation_for_caller() above, then delegates unchanged (the reason-required check already lives in the function it calls). Not SECURITY DEFINER, granted to nobody, reachable only from api.cancel_maintenance_obligation().';

-- =========================================================================
-- THE DELEGATES — api.complete_maintenance_obligation() / api.cancel_maintenance_obligation()

create or replace function api.complete_maintenance_obligation(
  p_obligation_id   uuid,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.complete_maintenance_obligation_for_caller(p_obligation_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

comment on function api.complete_maintenance_obligation(uuid, uuid, uuid, platform.actor_type, text) is
  'Delegate for work.complete_maintenance_obligation_for_caller() (ADR-0026''s split). Marks an open maintenance obligation done, for a workspace the caller has a live membership in.';

create or replace function api.cancel_maintenance_obligation(
  p_obligation_id   uuid,
  p_reason          text,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.cancel_maintenance_obligation_for_caller(p_obligation_id, p_reason, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

comment on function api.cancel_maintenance_obligation(uuid, text, uuid, uuid, platform.actor_type, text) is
  'Delegate for work.cancel_maintenance_obligation_for_caller() (ADR-0026''s split). Cancels an open maintenance obligation with a required reason, for a workspace the caller has a live membership in.';

-- =========================================================================
-- READ EXTENSION — my_maintenance_obligations() gains cancellation_reason
--
-- §16: "Cancelled ones retain their cancellation and its reason." The column has existed
-- since 0072; nothing has ever read it back (found live, verifying this very migration) —
-- a cancelled task with an invisible reason defeats the whole point of requiring one at
-- cancel time. Same parameter signature as before, so the return shape can only change
-- via drop-then-recreate (Postgres refuses to CREATE OR REPLACE a function into a
-- different return type) — the identical mechanic 0201's own my_service_records()
-- extension used for its own added columns.

drop function if exists work.my_maintenance_obligations(uuid);
drop function if exists api.my_maintenance_obligations(uuid);

create function work.my_maintenance_obligations(p_workspace_id uuid)
returns table (
  id                   uuid,
  asset_id             uuid,
  location_id          uuid,
  schedule_id          uuid,
  title                text,
  description          text,
  source               text,
  due_on               date,
  status               text,
  is_overdue           boolean,
  completed_at         timestamptz,
  cancelled_at         timestamptz,
  cancellation_reason  text
)
language sql
stable
set search_path = ''
as $$
  select o.id, o.asset_id, o.location_id, o.schedule_id, o.title, o.description, o.source, o.due_on, o.status,
         (o.status = 'open' and o.due_on < current_date) as is_overdue,
         o.completed_at, o.cancelled_at, o.cancellation_reason
  from work.maintenance_obligations o
  where o.workspace_id = p_workspace_id
    and exists (select 1 from workspace.current_memberships() m where m.workspace_id = p_workspace_id);
$$;

comment on function work.my_maintenance_obligations(uuid) is
  'A workspace''s own maintenance obligations (Epic 10, 0074), checking the caller''s real membership before returning anything (0137). Extended with cancellation_reason (0203) — present since 0072, never read back until now. Reached by any authenticated client only through api.my_maintenance_obligations(); klussie_engine_work also retains the direct EXECUTE 0074 granted it, unused by any real caller today.';

create function api.my_maintenance_obligations(p_workspace_id uuid)
returns table (
  id                   uuid,
  asset_id             uuid,
  location_id          uuid,
  schedule_id          uuid,
  title                text,
  description          text,
  source               text,
  due_on               date,
  status               text,
  is_overdue           boolean,
  completed_at         timestamptz,
  cancelled_at         timestamptz,
  cancellation_reason  text
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.my_maintenance_obligations(p_workspace_id);
$$;

comment on function api.my_maintenance_obligations(uuid) is
  'The Maintenance engine''s client-facing delegate for a workspace''s obligations (0137), including the is_overdue flag and, since 0203, cancellation_reason.';

revoke all on function api.my_maintenance_obligations(uuid) from public, anon, service_role;
grant execute on function api.my_maintenance_obligations(uuid) to authenticated;
revoke all on function work.my_maintenance_obligations(uuid) from public, anon, authenticated, service_role;

-- =========================================================================
-- ACCESS — explicit revokes, verified rather than assumed (ADR-0026 property 4). The raw
-- work.complete_maintenance_obligation()/cancel_maintenance_obligation() functions and
-- their existing grant to klussie_engine_work (0074) are untouched by this migration.

revoke all on function work.complete_maintenance_obligation_for_caller(uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.cancel_maintenance_obligation_for_caller(uuid, text, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;

revoke all on function api.complete_maintenance_obligation(uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, service_role;
grant execute on function api.complete_maintenance_obligation(uuid, uuid, uuid, platform.actor_type, text)
  to authenticated;

revoke all on function api.cancel_maintenance_obligation(uuid, text, uuid, uuid, platform.actor_type, text)
  from public, anon, service_role;
grant execute on function api.cancel_maintenance_obligation(uuid, text, uuid, uuid, platform.actor_type, text)
  to authenticated;
