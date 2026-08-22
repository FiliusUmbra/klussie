-- Platform Activation Slice 3, WP 3.0 — the Service Record read and write contracts.
--
-- Epic 11 built a complete, real backend (0081-0084): ten functions, real RLS isolation,
-- the authorship split (DATABASE_ARCHITECTURE.md §17, PLATFORM_DOMAIN_MODEL.md §13.2)
-- enforced structurally. No client code anywhere references it (grep across
-- src/**/*.{js,jsx} for "service_record" returns nothing) and no api.* delegate exists
-- for any of the ten functions. This migration is that layer — see
-- SLICE_3_SERVICE_RECORD_REPUTATION_ACTIVATION.md for the full scoping.
--
-- READS ARE THIN — WRITES ARE NOT, AND THE UNDERLYING FUNCTIONS' OWN COMMENTS SAY WHY
--
-- 0083's own RLS policies cover SELECT only, nothing else, on every one of the four
-- tables. 0084's own read functions are already shaped for a thin SECURITY DEFINER
-- wrapper (work.my_service_records()'s own comment: "this function is not SECURITY
-- DEFINER-invoked through RLS the way a client read would be" — naming the exact gap
-- this migration closes). Its write functions are not: none does its own caller
-- authorization (work.my_performing_annex()'s own comment: "visibility is the caller's
-- own responsibility (no client caller yet)"), because there was never a caller. Five
-- new work.*_for_caller() wrappers below add exactly that, matching Marketplace's own
-- WP 2.3 shape (0146) — not a new pattern.
--
-- create_service_record_for_caller() DOES MORE THAN CHECK MEMBERSHIP — IT CLOSES 0087's
-- OWN NAMED GAP
--
-- 0087's own header: "work.engagements.service_record_id... Set on completion, by
-- whichever future work package wires EngagementCompleted -> a real Service Record...
-- Unpopulated in this epic." This is that work package. Rather than trust a caller-
-- supplied property_id/asset_id/location_id/performing_workspace_id directly (the raw
-- work.create_service_record()'s own shape), the _for_caller wrapper takes an
-- engagement id instead, resolves everything from it — performing_workspace_id from the
-- engagement itself, property/asset/location from its request via the identical
-- coalesce shape 0162's own workspace.grant_engagement_access() already established —
-- checks the caller is a real, active member of the resolved performing workspace,
-- checks the engagement does not already carry a service_record_id (one record per
-- engagement, checked here rather than left to the table's own constraints, since
-- work.service_records itself has no column linking back to the engagement that caused
-- it — the link lives on work.engagements' own side, WP 3.0's job to set), and sets it
-- in the same transaction as the record's own creation.
--
-- REFUSES, DELIBERATELY, WHEN THE REQUEST HAS NO PHYSICAL SUBJECT AT ALL
--
-- work.service_records.property_id is NOT NULL (0081) — unlike WP 2.4's own scoped
-- grant, which could skip silently when a request carried no property/asset/location,
-- a Service Record has nowhere to attach at all in that case. Raises, rather than
-- inventing a placeholder property — the honest answer for a request never tied to a
-- real physical twin is that this platform cannot yet produce a structured record for
-- it, not a record pointing at nothing real.

-- =========================================================================
-- 1 · WRITE CONTRACT — work.*_for_caller() wrappers, each a real membership check the
-- underlying 0084 function never had.

create or replace function work.create_service_record_for_caller(
  p_service_record_id  uuid,
  p_engagement_id       uuid,
  p_performed_at         timestamptz,
  p_work_performed        text,
  p_agreed_price           numeric,
  p_price_currency          text,
  p_warranty_until           date,
  p_ai_summary                 text,
  p_recommendations             text,
  p_content                      jsonb,
  p_event_id                      uuid,
  p_warranty_event_id               uuid,
  p_correlation_id                   uuid,
  p_actor_type                        platform.actor_type,
  p_actor_ref                          text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_performing_ws  uuid;
  v_request_id      uuid;
  v_existing_record   uuid;
  v_property_id         uuid;
  v_asset_id             uuid;
  v_location_id           uuid;
begin
  select e.performing_workspace_id, e.request_id, e.service_record_id
    into v_performing_ws, v_request_id, v_existing_record
  from work.engagements e
  where e.id = p_engagement_id;

  if v_request_id is null then
    raise exception
      'work.create_service_record_for_caller: engagement % does not exist', p_engagement_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if v_existing_record is not null then
    raise exception
      'work.create_service_record_for_caller: engagement % already has a service record', p_engagement_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_performing_ws
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(
    r.property_id,
    (select a.property_id from property.assets a where a.id = r.asset_id),
    (select l.property_id from property.locations l where l.id = r.location_id)
  ), r.asset_id, r.location_id
    into v_property_id, v_asset_id, v_location_id
  from work.requests r
  where r.id = v_request_id;

  if v_property_id is null then
    raise exception
      'work.create_service_record_for_caller: request % has no property/asset/location — nowhere for a service record to attach', v_request_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform work.create_service_record(
    p_service_record_id => p_service_record_id, p_property_id => v_property_id,
    p_asset_id => v_asset_id, p_location_id => v_location_id,
    p_performing_workspace_id => v_performing_ws, p_performed_at => p_performed_at,
    p_work_performed => p_work_performed, p_agreed_price => p_agreed_price,
    p_price_currency => p_price_currency, p_warranty_until => p_warranty_until,
    p_ai_summary => p_ai_summary, p_recommendations => p_recommendations, p_content => p_content,
    p_event_id => p_event_id, p_warranty_event_id => p_warranty_event_id,
    p_correlation_id => p_correlation_id, p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );

  update work.engagements set service_record_id = p_service_record_id where id = p_engagement_id;

  return p_service_record_id;
end;
$$;

comment on function work.create_service_record_for_caller(uuid, uuid, timestamptz, text, numeric, text, date, text, text, jsonb, uuid, uuid, uuid, platform.actor_type, text) is
  'Resolves property/asset/location and performing_workspace_id from the engagement itself (0162''s own coalesce shape) rather than trusting a caller-supplied triple — closes 0087''s own named gap by setting work.engagements.service_record_id in the same transaction. Refuses, not skips, when the request has no physical subject at all (property_id is NOT NULL on work.service_records, unlike WP 2.4''s own scoped grant).';

create or replace function work.record_service_record_approval_for_caller(
  p_service_record_id  uuid,
  p_event_id             uuid,
  p_correlation_id        uuid,
  p_actor_type             platform.actor_type,
  p_actor_ref               text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_steward uuid;
begin
  select p.steward_workspace_id into v_steward
  from work.service_records sr
  join property.properties p on p.id = sr.property_id
  where sr.id = p_service_record_id;

  if v_steward is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_steward
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.record_service_record_approval(
    p_service_record_id => p_service_record_id, p_event_id => p_event_id,
    p_correlation_id => p_correlation_id, p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

comment on function work.record_service_record_approval_for_caller(uuid, uuid, uuid, platform.actor_type, text) is
  'Approval is the property''s own current steward''s decision (§17) — checked live against property.properties.steward_workspace_id, the same "current, not frozen" rule 0083''s own RLS policy already enforces for reads.';

create or replace function work.write_performing_annex_for_caller(
  p_annex_id            uuid,
  p_service_record_id   uuid,
  p_internal_cost       numeric,
  p_margin              numeric,
  p_supplier_used       text,
  p_supplier_price      numeric,
  p_scheduling_notes    text,
  p_internal_commentary text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_performing_ws uuid;
begin
  select sr.performing_workspace_id into v_performing_ws
  from work.service_records sr where sr.id = p_service_record_id;

  if v_performing_ws is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_performing_ws
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.write_performing_annex(
    p_annex_id => p_annex_id, p_service_record_id => p_service_record_id,
    p_internal_cost => p_internal_cost, p_margin => p_margin, p_supplier_used => p_supplier_used,
    p_supplier_price => p_supplier_price, p_scheduling_notes => p_scheduling_notes,
    p_internal_commentary => p_internal_commentary
  );
end;
$$;

comment on function work.write_performing_annex_for_caller(uuid, uuid, numeric, numeric, text, numeric, text, text) is
  'Performing-workspace membership only — "a business''s cost base is its own information" (§13.2), the identical rule 0083''s own RLS policy on this annex already enforces for reads, checked again here because this is a write with no policy to lean on.';

create or replace function work.write_property_annex_for_caller(
  p_annex_id           uuid,
  p_service_record_id  uuid,
  p_annotations        text,
  p_internal_approvals text,
  p_budget_context     text,
  p_private_assessment text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_steward uuid;
begin
  select p.steward_workspace_id into v_steward
  from work.service_records sr
  join property.properties p on p.id = sr.property_id
  where sr.id = p_service_record_id;

  if v_steward is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_steward
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.write_property_annex(
    p_annex_id => p_annex_id, p_service_record_id => p_service_record_id,
    p_annotations => p_annotations, p_internal_approvals => p_internal_approvals,
    p_budget_context => p_budget_context, p_private_assessment => p_private_assessment
  );
end;
$$;

comment on function work.write_property_annex_for_caller(uuid, uuid, text, text, text, text) is
  'Current stewardship, checked live, same as the approval wrapper above — work.write_property_annex() itself separately freezes owning_workspace_id on first write (0084''s own comment); this check is the caller-side gate, that freeze is the row''s own permanent record.';

create or replace function work.amend_service_record_for_caller(
  p_amendment_id             uuid,
  p_service_record_id        uuid,
  p_authored_by_workspace_id uuid,
  p_field_key                text,
  p_previous_value           text,
  p_corrected_value          text,
  p_reason                   text,
  p_event_id                 uuid,
  p_correlation_id           uuid,
  p_actor_type               platform.actor_type,
  p_actor_ref                text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_performing_ws uuid;
  v_steward        uuid;
begin
  select sr.performing_workspace_id, p.steward_workspace_id
    into v_performing_ws, v_steward
  from work.service_records sr
  join property.properties p on p.id = sr.property_id
  where sr.id = p_service_record_id;

  if v_performing_ws is null then
    raise exception
      'work.amend_service_record_for_caller: service record % does not exist', p_service_record_id
      using errcode = 'invalid_parameter_value';
  end if;

  -- Visible to whoever can see the parent core (0083's own combined predicate) may amend
  -- it — but only AS a workspace the caller genuinely belongs to, never an arbitrary
  -- claimed p_authored_by_workspace_id. Both checks, not one: the caller must hold real
  -- membership in the workspace they claim authored this, and that workspace must be one
  -- of the two the record is actually visible to.
  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = p_authored_by_workspace_id
  ) or p_authored_by_workspace_id not in (v_performing_ws, v_steward) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.amend_service_record(
    p_amendment_id => p_amendment_id, p_service_record_id => p_service_record_id,
    p_authored_by_workspace_id => p_authored_by_workspace_id, p_field_key => p_field_key,
    p_previous_value => p_previous_value, p_corrected_value => p_corrected_value, p_reason => p_reason,
    p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

comment on function work.amend_service_record_for_caller(uuid, uuid, uuid, text, text, text, text, uuid, uuid, platform.actor_type, text) is
  'Two checks, not one: the caller must hold real, active membership in the workspace they claim as author, AND that workspace must be one of the two the record''s own combined visibility predicate (0083) already names. Refuses a real member of an unrelated workspace claiming authorship exactly as it refuses a stranger.';

revoke all on function work.create_service_record_for_caller(uuid, uuid, timestamptz, text, numeric, text, date, text, text, jsonb, uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function work.record_service_record_approval_for_caller(uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function work.write_performing_annex_for_caller(uuid, uuid, numeric, numeric, text, numeric, text, text) from public, anon, authenticated, service_role;
revoke all on function work.write_property_annex_for_caller(uuid, uuid, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function work.amend_service_record_for_caller(uuid, uuid, uuid, text, text, text, text, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;

-- =========================================================================
-- 2 · api.* DELEGATES — thin SECURITY DEFINER pass-throughs. Writes call the *_for_caller
-- functions above, never the raw work.* functions directly (Marketplace's own precedent,
-- 0146). Reads call the raw 0084 functions directly — they carry no logic of their own to
-- delegate around, matching every read switch since Epic 07.

create or replace function api.create_service_record(
  p_service_record_id  uuid,
  p_engagement_id       uuid,
  p_performed_at         timestamptz,
  p_work_performed        text,
  p_agreed_price           numeric,
  p_price_currency          text,
  p_warranty_until           date,
  p_ai_summary                 text,
  p_recommendations             text,
  p_content                      jsonb,
  p_event_id                      uuid,
  p_warranty_event_id               uuid,
  p_correlation_id                   uuid,
  p_actor_type                        platform.actor_type,
  p_actor_ref                          text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select work.create_service_record_for_caller(
    p_service_record_id, p_engagement_id, p_performed_at, p_work_performed, p_agreed_price,
    p_price_currency, p_warranty_until, p_ai_summary, p_recommendations, p_content,
    p_event_id, p_warranty_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

create or replace function api.record_service_record_approval(
  p_service_record_id  uuid, p_event_id uuid, p_correlation_id uuid,
  p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.record_service_record_approval_for_caller(p_service_record_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

create or replace function api.write_performing_annex(
  p_annex_id uuid, p_service_record_id uuid, p_internal_cost numeric, p_margin numeric,
  p_supplier_used text, p_supplier_price numeric, p_scheduling_notes text, p_internal_commentary text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.write_performing_annex_for_caller(
    p_annex_id, p_service_record_id, p_internal_cost, p_margin, p_supplier_used,
    p_supplier_price, p_scheduling_notes, p_internal_commentary
  );
$$;

create or replace function api.write_property_annex(
  p_annex_id uuid, p_service_record_id uuid, p_annotations text,
  p_internal_approvals text, p_budget_context text, p_private_assessment text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.write_property_annex_for_caller(
    p_annex_id, p_service_record_id, p_annotations, p_internal_approvals, p_budget_context, p_private_assessment
  );
$$;

create or replace function api.amend_service_record(
  p_amendment_id uuid, p_service_record_id uuid, p_authored_by_workspace_id uuid,
  p_field_key text, p_previous_value text, p_corrected_value text, p_reason text,
  p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.amend_service_record_for_caller(
    p_amendment_id, p_service_record_id, p_authored_by_workspace_id, p_field_key,
    p_previous_value, p_corrected_value, p_reason, p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

create or replace function api.resolve_service_record(p_service_record_id uuid)
returns table (
  id uuid, property_id uuid, asset_id uuid, location_id uuid, performing_workspace_id uuid,
  performed_at timestamptz, work_performed text, agreed_price numeric, price_currency text,
  warranty_until date, customer_approved boolean, customer_approved_at timestamptz,
  ai_summary text, recommendations text, content jsonb, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.resolve_service_record(p_service_record_id);
$$;

create or replace function api.my_service_records(p_workspace_id uuid)
returns table (id uuid, property_id uuid, performing_workspace_id uuid, performed_at timestamptz, work_performed text)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.my_service_records(p_workspace_id);
$$;

create or replace function api.my_performing_annex(p_service_record_id uuid)
returns table (internal_cost numeric, margin numeric, supplier_used text, supplier_price numeric, scheduling_notes text, internal_commentary text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.my_performing_annex(p_service_record_id);
$$;

create or replace function api.my_property_annex(p_service_record_id uuid)
returns table (annotations text, internal_approvals text, budget_context text, private_assessment text, owning_workspace_id uuid, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.my_property_annex(p_service_record_id);
$$;

create or replace function api.service_record_history(p_service_record_id uuid)
returns table (id uuid, authored_by_workspace_id uuid, field_key text, previous_value text, corrected_value text, reason text, amended_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.service_record_history(p_service_record_id);
$$;

comment on function api.create_service_record(uuid, uuid, timestamptz, text, numeric, text, date, text, text, jsonb, uuid, uuid, uuid, platform.actor_type, text) is
  'The Service Record engine''s client-facing delegate for authoring a record (WP 3.0). Delegates entirely to work.create_service_record_for_caller(), which holds all the logic.';
comment on function api.resolve_service_record(uuid) is
  'The Service Record engine''s client-facing delegate for one record''s shared core (WP 3.0). Delegates entirely to work.resolve_service_record(), which holds all the logic. RLS (0083) is what actually narrows this to callers who may see it — this function adds no predicate of its own.';
comment on function api.my_service_records(uuid) is
  'The Service Record engine''s client-facing delegate for a workspace''s own records, either path (WP 3.0). Delegates entirely to work.my_service_records(), which restates 0083''s own combined predicate directly rather than relying on RLS (that function''s own comment).';

revoke all on function api.create_service_record(uuid, uuid, timestamptz, text, numeric, text, date, text, text, jsonb, uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.record_service_record_approval(uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.write_performing_annex(uuid, uuid, numeric, numeric, text, numeric, text, text) from public, anon, service_role;
revoke all on function api.write_property_annex(uuid, uuid, text, text, text, text) from public, anon, service_role;
revoke all on function api.amend_service_record(uuid, uuid, uuid, text, text, text, text, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.resolve_service_record(uuid) from public, anon, service_role;
revoke all on function api.my_service_records(uuid) from public, anon, service_role;
revoke all on function api.my_performing_annex(uuid) from public, anon, service_role;
revoke all on function api.my_property_annex(uuid) from public, anon, service_role;
revoke all on function api.service_record_history(uuid) from public, anon, service_role;

grant execute on function api.create_service_record(uuid, uuid, timestamptz, text, numeric, text, date, text, text, jsonb, uuid, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.record_service_record_approval(uuid, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.write_performing_annex(uuid, uuid, numeric, numeric, text, numeric, text, text) to authenticated;
grant execute on function api.write_property_annex(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function api.amend_service_record(uuid, uuid, uuid, text, text, text, text, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.resolve_service_record(uuid) to authenticated;
grant execute on function api.my_service_records(uuid) to authenticated;
grant execute on function api.my_performing_annex(uuid) to authenticated;
grant execute on function api.my_property_annex(uuid) to authenticated;
grant execute on function api.service_record_history(uuid) to authenticated;

-- =========================================================================
-- 3 · work.engagements_reject_terminal_mutation() (0087) BLOCKED THE ONE WRITE 0087's OWN
-- HEADER PREDICTED — A REAL, PRE-EXISTING BUG FOUND LIVE BY THIS MIGRATION'S OWN
-- DIAGNOSTIC, NOT ANTICIPATED
--
-- 0087's own header: "work.engagements.service_record_id... Set on completion, by
-- whichever future work package wires EngagementCompleted -> a real Service Record."
-- That is precisely what work.create_service_record_for_caller() (§1 above) does — and it
-- failed live, on the first real attempt, with "engagement % is completed and immutable":
-- the guard trigger 0087 built in the SAME migration refuses every update to a terminal
-- engagement unconditionally, including the one write its own header said a future work
-- package would need to make. Neither half of 0087 is wrong on its own; the two were never
-- checked against each other, because nothing exercised the write path until this
-- migration's own diagnostic did.
--
-- Fixed with the identical shape 0081's own work.service_records_guard_mutation() already
-- established for customer_approved: every column stays frozen once terminal EXCEPT one,
-- and that one may only move null -> a real value, never change again, never reset. Not a
-- weakening of §19's own immutability rule — service_record_id was always meant to be
-- settable after completion; the trigger's own past self simply never carved out the one
-- column its neighbour's own header already promised would need it.

create or replace function work.engagements_reject_terminal_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('completed', 'cancelled') then
    -- Every column except service_record_id stays frozen, unconditionally — one check,
    -- not a list duplicated per branch.
    if new.id is distinct from old.id
       or new.request_id is distinct from old.request_id
       or new.quote_id is distinct from old.quote_id
       or new.requesting_workspace_id is distinct from old.requesting_workspace_id
       or new.performing_workspace_id is distinct from old.performing_workspace_id
       or new.agreed_price is distinct from old.agreed_price
       or new.status is distinct from old.status
       or new.completed_at is distinct from old.completed_at
       or new.cancelled_at is distinct from old.cancelled_at
       or new.cancellation_reason is distinct from old.cancellation_reason
       or new.maintenance_obligation_id is distinct from old.maintenance_obligation_id
       or new.created_at is distinct from old.created_at
    then
      raise exception
        'work.engagements: engagement % is % and immutable', old.id, old.status
        using
          hint = 'A completed or cancelled engagement, and its financial consequences, are permanent (§19). service_record_id may still move null -> a real value (WP 3.0); nothing else may change.',
          errcode = 'restrict_violation';
    end if;

    -- service_record_id itself: null -> a real value, exactly once, never reassigned. The
    -- null -> value transition itself is not blocked by either check above or below.
    if new.service_record_id is distinct from old.service_record_id and old.service_record_id is not null then
      raise exception
        'work.engagements: engagement %''s service_record_id is already set and permanent', old.id
        using
          hint = 'One record per engagement — set once, on the null -> value transition, never reassigned.',
          errcode = 'restrict_violation';
    end if;
  end if;
  return new;
end;
$$;

comment on function work.engagements_reject_terminal_mutation() is
  'Identical in shape to work.maintenance_obligations_reject_terminal_mutation() (migration 0072) and to work.service_records_guard_mutation()''s own customer_approved carve-out (0081) — guards the row once status is terminal, EXCEPT service_record_id, which may move null -> a real value exactly once (WP 3.0), never reassigned. Found live: 0087''s own header predicted this write; this trigger, built in the same migration, refused it until now.';

drop trigger if exists engagements_guard_terminal on work.engagements;
create trigger engagements_guard_terminal
  before update on work.engagements
  for each row execute function work.engagements_reject_terminal_mutation();

-- =========================================================================
-- 4 · authenticated GAINS USAGE ON SCHEMA work + SELECT ON THE FOUR RLS-GATED TABLES —
-- THE SAME BASE-GRANT GAP FOUND A FOURTH TIME, NOT ASSUMED
--
-- 0159 already granted authenticated USAGE on schema work and SELECT on six work.*
-- tables for Realtime; work.service_records and its three sibling tables were not among
-- them (0159 was scoped to what WP 2.6's own client cutover subscribed to, not every
-- work.* table that would ever need it). 0083's own RLS policies have existed since Epic
-- 11 with no base grant to make them reachable — the identical class of gap 0102
-- (platform.events), 0158 (platform schema), 0159 (work schema, first instance), and
-- 0161 (property schema) already each found once. Grant, not assumption.

grant select on
  work.service_records,
  work.service_record_performing_annexes,
  work.service_record_property_annexes,
  work.service_record_amendments
to authenticated;
