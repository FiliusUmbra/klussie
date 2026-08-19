-- Platform Activation Slice 2, WP 2.2 + WP 2.3 — directed booking's shape, decided and
-- built together, and the request/quote/engagement write contracts.
--
-- WP 2.2's OWN DECISION: NEW COLUMNS ON work.requests, NOT WORKFLOW-DEFINITION
-- CONFIGURATION
--
-- SLICE_2_MARKETPLACE_TRANSACTION_ACTIVATION.md §1.4/§2 named two real options for
-- one-tap booking (ADR-0012): new columns mirroring legacy's three, or expressing it as
-- workflow-definition configuration per 0085's own suggestion. Workflow-definition
-- configuration means attaching a real work.workflow_instances row and driving
-- work.requests.status from booking_request_lifecycle (0070) — which is §1.5's own
-- "step 3," explicitly named in this document as NOT addressed here: "It is named here
-- because Epic 09/12 both flag it as real, deliberately deferred work, not because this
-- slice resolves it." Choosing workflow-definition configuration for directed booking
-- would silently fold step 3's own deferred decision into this work package — exactly
-- the scope creep §1.5 warns against. New columns, mirroring legacy's shape, is the
-- option that does not require deciding something this slice's own scoping document
-- explicitly left open. This is a decision, not a scoping document of its own, per this
-- programme's own §1.3 ("Review first... document only when architecture changes") —
-- recorded here, where the implementation it governs lives.
--
-- directed_workspace_id, NOT directed_pro_id — THE ONE DELIBERATE NAMING DIVERGENCE FROM
-- LEGACY
--
-- Every cross-workspace reference in this schema already uses the `_workspace_id`
-- vocabulary (requesting_workspace_id, offering_workspace_id, performing_workspace_id) —
-- "the one professional this request is addressed to" is, in this schema, a workspace,
-- not a `pro_profiles.profile_id` row. Matching that vocabulary here rather than
-- reproducing legacy's own column name literally.
--
-- NO COLUMN DEFAULT ON directed_until — A REAL BUG FOUND IN LEGACY WHILE DESIGNING THIS,
-- DELIBERATELY NOT REPRODUCED
--
-- Checked directly against both real Supabase projects while designing this (read-only
-- on production; a rolled-back write attempt on staging) before writing a single line
-- below: public.service_requests.directed_until carries a table-level DEFAULT (0014,
-- `now() + interval '24 hours'`) that applies to EVERY insert omitting the column —
-- including an ordinary, non-directed request, which never sets it. Reproduced directly
-- against staging: an ordinary insert (no directed_pro_id, no auto_accept_max, omitting
-- directed_until) violates service_requests_directed_complete, because the default fires
-- regardless — directed_until ends up non-null while the other two stay null. Production
-- shows no evidence of this (all 10 real rows checked have directed_until null), which
-- means either production has not had 0014 applied, or its actually-deployed client
-- differs from what this repository's HEAD contains — a real, separate finding, flagged
-- to the user rather than silently worked around, and NOT something this migration
-- attempts to fix (it touches work.requests only, never public.service_requests). What
-- this migration DOES do is not reproduce the same trap: directed_until here has NO
-- column default at all. work.create_request_for_caller() (below) computes it explicitly,
-- and only when a directed_workspace_id is actually given — so an ordinary request's
-- three directed columns stay genuinely, structurally null, the same way work.requests'
-- design already avoids several of legacy's other rough edges.
--
-- THE FUNCTION SHAPE — NEW CALLER-CHECKED WRAPPERS, NOT REDEFINED IN PLACE
--
-- Unlike WP 2.1's five reads (redefined in place, since zero other callers existed to
-- protect), this work package follows the shape SLICE_2_MARKETPLACE_TRANSACTION_
-- ACTIVATION.md §2's own WP 2.3 text names explicitly: "the same 'new caller-checked
-- wrapper around the existing, unmodified work.* function' shape WP 1.7 and WP 1.10 both
-- already established." A write function carries real side effects and a more plausible
-- future trusted-internal caller than a read ever would (the exact reason WP 1.7's
-- maintenance delegate exists) — the document's own explicit choice for writes is
-- followed here rather than the read-side precedent used one work package ago.
--
-- create_request_for_caller() DOES NOT REWRITE work.create_request()'S OWN INSERT — IT
-- CALLS IT, THEN PATCHES THE THREE DIRECTED COLUMNS IN ONE FOLLOW-UP UPDATE, ATOMICALLY
--
-- Both statements run inside this one function's own transaction — there is no window in
-- which a directed request exists without its directed columns, or in which the base
-- insert's own event-emission logic is duplicated or diverges from work.create_request()'s
-- real, unchanged behaviour.
--
-- submit_quote_for_caller() IMPLEMENTS THE AUTO-ACCEPT CASCADE AS A DIRECT NESTED CALL,
-- NOT A RECURSIVE TRIGGER
--
-- Legacy's handle_quote_sent() (0013) recurses through a second UPDATE that itself fires
-- handle_quote_accepted() as a nested trigger invocation — this schema has no triggers to
-- recurse through. The equivalent here is a direct, explicit call from
-- submit_quote_for_caller() to the raw, unmodified work.accept_quote() once the three
-- legacy conditions all hold (same professional, inside the window, at or under the
-- ceiling) — attributed to actor_type = 'system', matching platform.actor_type's own
-- vocabulary (0021) for an automated consequence of a pre-authorization the customer
-- already gave, not a fresh human decision.
--
-- AUTHORIZATION SHAPES, DECIDED PER FUNCTION, NOT ASSUMED UNIFORM
--
-- withdraw/decline/accept/complete/mark_reviewed each check real membership in exactly
-- one workspace, resolved from the row itself where the caller does not supply it
-- directly — the same "resolve the real target before checking" discipline WP 1.5's own
-- location write contract established. accept_quote_for_caller() and
-- complete_engagement_for_caller() and mark_request_reviewed_for_caller() all check the
-- REQUESTING workspace specifically — accepting a quote, confirming completion and
-- reviewing are all customer-side decisions, matching markComplete()'s and
-- mark_request_reviewed()'s own simplicity in the legacy/0090 code they mirror.
-- cancel_engagement_for_caller() is the one deliberately two-sided write: either the
-- requesting or the performing workspace may cancel a live booking (a customer changing
-- their mind, or a professional becoming unavailable, are both real reasons), decided
-- here rather than left to assumption.

-- =========================================================================
-- 1 · SCHEMA — directed booking, ADR-0012, ported per this migration's own header

alter table work.requests
  add column if not exists directed_workspace_id uuid references workspace.workspaces (id),
  add column if not exists directed_until timestamptz,
  add column if not exists auto_accept_max numeric(10, 2);

alter table work.requests drop constraint if exists requests_directed_complete;
alter table work.requests add constraint requests_directed_complete check (
  (directed_workspace_id is null and directed_until is null and auto_accept_max is null)
  or (directed_workspace_id is not null and directed_until is not null and auto_accept_max is not null)
);

alter table work.requests drop constraint if exists requests_auto_accept_max_check;
alter table work.requests add constraint requests_auto_accept_max_check
  check (auto_accept_max is null or auto_accept_max > 0);

create index if not exists requests_directed_workspace_idx
  on work.requests (directed_workspace_id) where directed_workspace_id is not null;

comment on column work.requests.directed_workspace_id is
  'ADR-0012: the one workspace this request is addressed to. Null for ordinary open requests. Named _workspace_id, not _pro_id like legacy''s directed_pro_id — this schema''s own cross-workspace vocabulary.';
comment on column work.requests.directed_until is
  'ADR-0012: end of the addressed workspace''s exclusive window. No column default (see this migration''s own header) — work.create_request_for_caller() computes it explicitly, only when directed_workspace_id is given.';
comment on column work.requests.auto_accept_max is
  'ADR-0012: ceiling the customer pre-authorized. A quote from directed_workspace_id at or below this, inside directed_until, is accepted automatically by work.submit_quote_for_caller()''s own cascade.';

-- =========================================================================
-- 2 · WRITE CONTRACTS

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

  if p_directed_workspace_id is not null then
    update work.requests
    set directed_workspace_id = p_directed_workspace_id,
        directed_until = now() + interval '24 hours',
        auto_accept_max = p_auto_accept_max
    where id = p_request_id;
  end if;
end;
$$;

comment on function work.create_request_for_caller(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, numeric, uuid, uuid, platform.actor_type, text) is
  'Creates a request for a caller with a real, active membership in the requesting workspace. Delegates entirely to the unmodified work.create_request() for the base row and event, then patches the three directed-booking columns in one follow-up UPDATE when p_directed_workspace_id is given — see this migration''s own header for why not one INSERT.';

create or replace function work.withdraw_request_for_caller(
  p_request_id      uuid,
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
  v_requesting_ws uuid;
begin
  select r.requesting_workspace_id into v_requesting_ws from work.requests r where r.id = p_request_id;

  if v_requesting_ws is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_requesting_ws
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.withdraw_request(
    p_request_id => p_request_id, p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

comment on function work.withdraw_request_for_caller(uuid, uuid, uuid, platform.actor_type, text) is
  'Withdraws a request for a caller with a real, active membership in its requesting workspace, resolved from the row before checking — never trusting a co-supplied id. Delegates entirely to the unmodified work.withdraw_request().';

create or replace function work.submit_quote_for_caller(
  p_quote_id                uuid,
  p_request_id              uuid,
  p_offering_workspace_id   uuid,
  p_price                   numeric,
  p_message                 text,
  p_event_id                uuid,
  p_correlation_id          uuid,
  p_auto_accept_engagement_id       uuid,
  p_auto_accept_event_id            uuid,
  p_auto_accept_engagement_event_id uuid,
  p_actor_type              platform.actor_type,
  p_actor_ref               text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_directed_ws     uuid;
  v_directed_until  timestamptz;
  v_auto_accept_max numeric;
begin
  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = p_offering_workspace_id
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.submit_quote(
    p_quote_id => p_quote_id, p_request_id => p_request_id, p_offering_workspace_id => p_offering_workspace_id,
    p_price => p_price, p_message => p_message,
    p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );

  -- The auto-accept cascade — see this migration's own header. Every condition mirrors
  -- legacy's handle_quote_sent() exactly: the same workspace the request was directed
  -- at, inside the window, at or under the ceiling.
  select r.directed_workspace_id, r.directed_until, r.auto_accept_max
    into v_directed_ws, v_directed_until, v_auto_accept_max
  from work.requests r where r.id = p_request_id;

  if v_directed_ws is not null
     and v_directed_ws = p_offering_workspace_id
     and v_directed_until > now()
     and p_price <= v_auto_accept_max
  then
    perform work.accept_quote(
      p_quote_id => p_quote_id, p_engagement_id => p_auto_accept_engagement_id,
      p_event_id => p_auto_accept_event_id, p_engagement_event_id => p_auto_accept_engagement_event_id,
      p_declined_event_id => null,
      p_correlation_id => p_correlation_id, p_actor_type => 'system', p_actor_ref => 'directed_booking_auto_accept'
    );
  end if;
end;
$$;

comment on function work.submit_quote_for_caller(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Submits a quote for a caller with a real, active membership in the offering workspace. Delegates entirely to the unmodified work.submit_quote(), then runs the ADR-0012 auto-accept cascade (see this migration''s own header) via a direct call to the unmodified work.accept_quote() when every legacy condition holds. The three p_auto_accept_* ids are only actually used when the cascade fires; always required, matching this codebase''s own established "conditional, always-required id" idiom (0090''s own p_declined_event_id and three prior epics before it).';

create or replace function work.decline_quote_for_caller(
  p_quote_id        uuid,
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
  v_offering_ws uuid;
begin
  select q.offering_workspace_id into v_offering_ws from work.quotes q where q.id = p_quote_id;

  if v_offering_ws is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_offering_ws
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.decline_quote(
    p_quote_id => p_quote_id, p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

comment on function work.decline_quote_for_caller(uuid, uuid, uuid, platform.actor_type, text) is
  'Declines a quote for a caller with a real, active membership in the offering workspace that sent it, resolved from the row before checking. Delegates entirely to the unmodified work.decline_quote().';

create or replace function work.accept_quote_for_caller(
  p_quote_id            uuid,
  p_engagement_id        uuid,
  p_event_id             uuid,
  p_engagement_event_id  uuid,
  p_declined_event_id    uuid,
  p_correlation_id       uuid,
  p_actor_type           platform.actor_type,
  p_actor_ref            text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_requesting_ws uuid;
begin
  select r.requesting_workspace_id into v_requesting_ws
  from work.quotes q join work.requests r on r.id = q.request_id
  where q.id = p_quote_id;

  if v_requesting_ws is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_requesting_ws
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.accept_quote(
    p_quote_id => p_quote_id, p_engagement_id => p_engagement_id,
    p_event_id => p_event_id, p_engagement_event_id => p_engagement_event_id, p_declined_event_id => p_declined_event_id,
    p_correlation_id => p_correlation_id, p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

comment on function work.accept_quote_for_caller(uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Accepts a quote for a caller with a real, active membership in the requesting workspace of the quote''s own request, resolved before checking — accepting is the customer''s own decision, matching the legacy client''s own shape. Delegates entirely to the unmodified work.accept_quote().';

create or replace function work.complete_engagement_for_caller(
  p_engagement_id   uuid,
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
  v_requesting_ws uuid;
begin
  select e.requesting_workspace_id into v_requesting_ws from work.engagements e where e.id = p_engagement_id;

  if v_requesting_ws is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_requesting_ws
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.complete_engagement(
    p_engagement_id => p_engagement_id, p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

comment on function work.complete_engagement_for_caller(uuid, uuid, uuid, platform.actor_type, text) is
  'Completes an engagement for a caller with a real, active membership in its requesting workspace, resolved before checking — confirming completion is the customer''s own decision, matching markComplete()''s own shape (src/lib/requests.js). Delegates entirely to the unmodified work.complete_engagement().';

create or replace function work.cancel_engagement_for_caller(
  p_engagement_id   uuid,
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
  v_requesting_ws uuid;
  v_performing_ws uuid;
begin
  select e.requesting_workspace_id, e.performing_workspace_id into v_requesting_ws, v_performing_ws
  from work.engagements e where e.id = p_engagement_id;

  if v_requesting_ws is null or not exists (
    select 1 from workspace.current_memberships() m
    where m.workspace_id in (v_requesting_ws, v_performing_ws)
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.cancel_engagement(
    p_engagement_id => p_engagement_id, p_reason => p_reason,
    p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

comment on function work.cancel_engagement_for_caller(uuid, text, uuid, uuid, platform.actor_type, text) is
  'Cancels an engagement for a caller with a real, active membership in EITHER its requesting or performing workspace, resolved before checking — deliberately two-sided, this migration''s own header explains why (either party has a real reason to cancel). Delegates entirely to the unmodified work.cancel_engagement().';

create or replace function work.mark_request_reviewed_for_caller(
  p_request_id      uuid,
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
  v_requesting_ws uuid;
begin
  select r.requesting_workspace_id into v_requesting_ws from work.requests r where r.id = p_request_id;

  if v_requesting_ws is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_requesting_ws
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.mark_request_reviewed(
    p_request_id => p_request_id, p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

comment on function work.mark_request_reviewed_for_caller(uuid, uuid, uuid, platform.actor_type, text) is
  'Marks a request reviewed for a caller with a real, active membership in its requesting workspace, resolved before checking — reviewing is the customer''s own decision. Delegates entirely to the unmodified work.mark_request_reviewed().';

-- =========================================================================
-- 3 · API DELEGATES — thin SECURITY DEFINER pass-throughs, calling the *_for_caller
-- functions above, never the raw work.* functions directly.

create or replace function api.create_request(
  p_request_id uuid, p_requesting_workspace_id uuid, p_property_id uuid, p_asset_id uuid, p_location_id uuid,
  p_category_id text, p_service_id uuid, p_details text, p_when_pref text, p_budget numeric,
  p_directed_workspace_id uuid, p_auto_accept_max numeric,
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
    p_directed_workspace_id, p_auto_accept_max,
    p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

create or replace function api.withdraw_request(
  p_request_id uuid, p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.withdraw_request_for_caller(p_request_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

create or replace function api.submit_quote(
  p_quote_id uuid, p_request_id uuid, p_offering_workspace_id uuid, p_price numeric, p_message text,
  p_event_id uuid, p_correlation_id uuid,
  p_auto_accept_engagement_id uuid, p_auto_accept_event_id uuid, p_auto_accept_engagement_event_id uuid,
  p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.submit_quote_for_caller(
    p_quote_id, p_request_id, p_offering_workspace_id, p_price, p_message,
    p_event_id, p_correlation_id,
    p_auto_accept_engagement_id, p_auto_accept_event_id, p_auto_accept_engagement_event_id,
    p_actor_type, p_actor_ref
  );
$$;

create or replace function api.decline_quote(
  p_quote_id uuid, p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.decline_quote_for_caller(p_quote_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

create or replace function api.accept_quote(
  p_quote_id uuid, p_engagement_id uuid, p_event_id uuid, p_engagement_event_id uuid, p_declined_event_id uuid,
  p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.accept_quote_for_caller(
    p_quote_id, p_engagement_id, p_event_id, p_engagement_event_id, p_declined_event_id,
    p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

create or replace function api.complete_engagement(
  p_engagement_id uuid, p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.complete_engagement_for_caller(p_engagement_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

create or replace function api.cancel_engagement(
  p_engagement_id uuid, p_reason text, p_event_id uuid, p_correlation_id uuid,
  p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.cancel_engagement_for_caller(p_engagement_id, p_reason, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

create or replace function api.mark_request_reviewed(
  p_request_id uuid, p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.mark_request_reviewed_for_caller(p_request_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

-- =========================================================================
-- ACCESS

revoke all on function work.create_request_for_caller(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, numeric, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function work.withdraw_request_for_caller(uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function work.submit_quote_for_caller(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function work.decline_quote_for_caller(uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function work.accept_quote_for_caller(uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function work.complete_engagement_for_caller(uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function work.cancel_engagement_for_caller(uuid, text, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function work.mark_request_reviewed_for_caller(uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;

revoke all on function api.create_request(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, numeric, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.withdraw_request(uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.submit_quote(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.decline_quote(uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.accept_quote(uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.complete_engagement(uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.cancel_engagement(uuid, text, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.mark_request_reviewed(uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;

grant execute on function api.create_request(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, numeric, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.withdraw_request(uuid, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.submit_quote(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.decline_quote(uuid, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.accept_quote(uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.complete_engagement(uuid, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.cancel_engagement(uuid, text, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.mark_request_reviewed(uuid, uuid, uuid, platform.actor_type, text) to authenticated;
