-- Pro Workspace remarks, 2026-09-12 (Theme C of that scoping pass): "Option to join an
-- existing/registered business, confirmed by its owner or admin." The one piece of
-- ADR-0027's own permission vocabulary that was named ahead of its feature and never
-- built: membership.join.approve (0036) has existed since Epic 03 WP08 with nothing to
-- approve. This migration is that missing piece.
--
-- SCOPE, DELIBERATELY: JOINING AN EXISTING professional WORKSPACE, NOT A NEW `business`
-- WORKSPACE TYPE
--
-- ADR-0027's own three preset tables include a `business` workspace type with a real
-- Administrator/Manager/Team member/Auditor-Viewer/External-provider role set -- a closer
-- surface match to "join a company" than `professional`'s bare Owner/Manager/Employee/
-- Contractor. It was NOT used here. Nothing has ever provisioned a `business`-type
-- workspace (confirmed: every real workspace this platform creates is `personal` or
-- `professional`, `api.become_pro()` included, regardless of pro_type). Introducing a
-- second, real pro-workspace type in the same slice that first exercises the join-request
-- mechanism would mean deciding, untested, how every existing pro-facing surface
-- (ProApp.jsx's own routing, pro_matches_request, submit_quote, the workspace switcher)
-- behaves for a type they have never once seen a real row of -- exactly the kind of
-- speculative, untested surface ADR-0010 already warns against. A real business pro
-- today already has a real `professional` workspace (the account they run their business
-- through); "join an existing business" reads correctly as "join that same workspace as
-- staff," which this migration builds on the type and role vocabulary already proven
-- live. Whether `become_pro()` should instead provision a distinct `business` workspace
-- for pro_type = 'business' is a real, separate, larger question (Theme A of the same
-- scoping pass) -- named here, not answered here.
--
-- THE NEW ROLE: 'employee', ADR-0027's OWN professional/Employee, CASE-FIXED (0219)
--
-- ADR-0027's professional-type table names Owner/Manager/Employee/Contractor. Owner is
-- the only one any real membership has ever held; Employee is the natural fit for someone
-- who asked to join an existing business and was approved onto it (membership.own.view
-- only -- everything else stays the owner's). 0219 is the load-bearing prerequisite this
-- migration depends on: without it, decide_permission() would deny 'owner' its own
-- membership.join.approve, and the write contract below would refuse every approval.
--
-- NO NOTIFICATION PRODUCER YET -- NAMED, NOT BUILT
--
-- workspace.join.requested/approved/declined are emitted (ADR-0019, same as every other
-- canonical event this session has built) so a future notification producer
-- (0169_conversation_message_notification_producer.sql's own shape) can pick them up --
-- that producer, and any push/email delivery, is real, separate infrastructure this
-- migration does not build. Today, a pending request is reachable the same way every
-- other real, un-pushed state in this platform already is: visible in the owner's own
-- "My Business" the next time they open it. §14.4's own "automation beyond ordinary
-- matching requires the customer's own explicit opt-in, never a silent platform default"
-- applies here too -- nothing about this fires on its own.
--
-- SEARCH IS A PLAIN ILIKE, NOT THE GENERIC SEARCH ENGINE
--
-- 0123_search_contract.sql's own derived.search()/search_index machinery is a real,
-- indexed, scope-aware full-text engine — onboarding workspace names onto it means
-- deciding a new search domain, its own scope predicate, and its own index-maintenance
-- triggers, none of which this one narrow "find a business by its name" lookup needs.
-- A direct ilike over workspace.workspaces.name, capped and scoped to real, active
-- `professional` workspaces the caller does not already belong to, is the honest, minimal
-- shape for what is actually being asked here.

-- =========================================================================
-- 1 · workspace.join_requests — one row per request, immutable once decided

create table if not exists workspace.join_requests (
  id             uuid        not null,
  workspace_id   uuid        not null
                 references workspace.workspaces (id),

  -- Same durability argument as workspace.memberships.person_ref (0030's own comment,
  -- verbatim): a request survives the requester's own identity being erased later.
  person_ref     uuid        not null,

  message        text,

  status         text        not null default 'pending'
                 check (status in ('pending', 'approved', 'declined')),

  requested_at   timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     uuid,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint join_requests_pkey primary key (id),
  constraint join_requests_decided_fields_consistent check (
    (status = 'pending' and decided_at is null and decided_by is null)
    or (status <> 'pending' and decided_at is not null and decided_by is not null)
  )
);

-- At most one real, pending ask per (workspace, person) -- a second tap sees the request
-- it already made, never a silent duplicate. Partial: an approved or declined row from a
-- past request must never block asking again (a declined applicant reconsidering, a
-- former employee re-applying).
create unique index if not exists join_requests_one_pending_per_person_idx
  on workspace.join_requests (workspace_id, person_ref)
  where status = 'pending';

create index if not exists join_requests_workspace_id_idx
  on workspace.join_requests (workspace_id);

comment on table workspace.join_requests is
  'A person asking to join an existing professional workspace as staff (Pro Workspace remarks, 2026-09-12, Theme C) -- the write side of ADR-0027''s own membership.join.approve, named at Epic 03 WP08 with nothing to approve until now. Rows are never deleted or mutated after a decision (the decided_fields_consistent check) -- a declined or approved request stays, the honest record of what was asked and how it was answered.';
comment on column workspace.join_requests.person_ref is
  'The identity asking to join. No foreign key to identity.identities, matching workspace.memberships.person_ref (0030) -- survives that identity''s own erasure.';
comment on column workspace.join_requests.message is
  'An optional note from the requester ("I work here", "we spoke on the phone") shown to whoever decides the request. Never required.';

alter table workspace.join_requests enable row level security;
revoke all on workspace.join_requests from anon, authenticated, service_role;

-- =========================================================================
-- 2 · workspace.search_professional_workspaces_for_caller() — find a business by name

create or replace function workspace.search_professional_workspaces_for_caller(p_query text)
returns table (
  workspace_id  uuid,
  name          text
)
language sql
stable
set search_path = ''
as $$
  select w.id, w.name
  from workspace.workspaces w
  where w.type = 'professional'
    and w.name ilike '%' || p_query || '%'
    -- Never surface a workspace the caller already belongs to -- nothing to request.
    and not exists (
      select 1
      from workspace.current_memberships() m
      where m.workspace_id = w.id
    )
  order by w.name
  limit 10;
$$;

comment on function workspace.search_professional_workspaces_for_caller(text) is
  'Finds real, active professional workspaces by name for someone about to request to join one -- a plain ilike, not the generic search engine (this migration''s own header explains why). Excludes any workspace the caller already belongs to. Capped at 10. Not SECURITY DEFINER, granted to nobody, reachable only from api.search_professional_workspaces().';

revoke all on function workspace.search_professional_workspaces_for_caller(text)
  from public, anon, authenticated, service_role;

-- =========================================================================
-- 3 · workspace.request_to_join_for_caller() — the ask

create or replace function workspace.request_to_join_for_caller(
  p_request_id      uuid,
  p_workspace_id    uuid,
  p_message         text,
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
  v_person_ref uuid;
begin
  select i.person_ref into v_person_ref
  from identity.identities i
  where i.auth_user_id = auth.uid()
    and i.erased_at is null;

  if v_person_ref is null then
    raise exception
      'workspace.request_to_join_for_caller: no real identity for the caller'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from workspace.workspaces where id = p_workspace_id and type = 'professional') then
    raise exception 'workspace.request_to_join_for_caller: % is not a real professional workspace', p_workspace_id
      using errcode = 'invalid_parameter_value';
  end if;

  if exists (
    select 1 from workspace.memberships m
    where m.workspace_id = p_workspace_id and m.person_ref = v_person_ref and m.state = 'active'
  ) then
    raise exception 'workspace.request_to_join_for_caller: % is already a member of %', v_person_ref, p_workspace_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- The partial unique index (join_requests_one_pending_per_person_idx) is the real
  -- guard against a duplicate pending ask; this existence check exists only to raise a
  -- specific, honest error instead of a bare unique-violation reaching the client.
  if exists (
    select 1 from workspace.join_requests
    where workspace_id = p_workspace_id and person_ref = v_person_ref and status = 'pending'
  ) then
    raise exception 'workspace.request_to_join_for_caller: % already has a pending request for %', v_person_ref, p_workspace_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  insert into workspace.join_requests (id, workspace_id, person_ref, message)
  values (p_request_id, p_workspace_id, v_person_ref, nullif(trim(p_message), ''));

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'workspace.join.requested',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'join_request',
    p_subject_id     => p_request_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('personRef', v_person_ref)
  );
end;
$$;

comment on function workspace.request_to_join_for_caller(uuid, uuid, text, uuid, uuid, platform.actor_type, text) is
  'Records a real request to join an existing professional workspace as staff. Resolves person_ref from auth.uid() itself, never a parameter. Refuses a workspace that is not a real professional one, a caller already a member, or a caller with an existing pending request. Emits workspace.join.requested. Not SECURITY DEFINER, granted to nobody, reachable only from api.request_to_join().';

revoke all on function workspace.request_to_join_for_caller(uuid, uuid, text, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;

-- =========================================================================
-- 4 · workspace.list_join_requests_for_caller() — what the owner sees

create or replace function workspace.list_join_requests_for_caller(p_workspace_id uuid)
returns table (
  request_id    uuid,
  person_ref    uuid,
  full_name     text,
  avatar_url    text,
  message       text,
  requested_at  timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not (select granted from workspace.decide_permission(p_workspace_id, 'membership.join.approve')) then
    raise exception 'workspace.list_join_requests_for_caller: caller may not view join requests for %', p_workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select jr.id, jr.person_ref, i.full_name, i.avatar_url, jr.message, jr.requested_at
    from workspace.join_requests jr
    left join identity.identities i on i.person_ref = jr.person_ref and i.erased_at is null
    where jr.workspace_id = p_workspace_id
      and jr.status = 'pending'
    order by jr.requested_at asc;
end;
$$;

comment on function workspace.list_join_requests_for_caller(uuid) is
  'The pending join requests for one workspace, real display name/avatar resolved alongside (never a bare person_ref) -- refuses a caller without membership.join.approve on that workspace (ADR-0027, case-fixed 0219). Not SECURITY DEFINER, granted to nobody, reachable only from api.list_join_requests().';

revoke all on function workspace.list_join_requests_for_caller(uuid)
  from public, anon, authenticated, service_role;

-- =========================================================================
-- 5 · workspace.decide_join_request_for_caller() — approve or decline

create or replace function workspace.decide_join_request_for_caller(
  p_request_id           uuid,
  p_decision             text,
  p_membership_id        uuid,
  p_event_id             uuid,
  p_membership_event_id  uuid,
  p_correlation_id       uuid,
  p_actor_type           platform.actor_type,
  p_actor_ref            text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_decider_person_ref uuid;
  v_request            workspace.join_requests;
begin
  if p_decision not in ('approved', 'declined') then
    raise exception 'workspace.decide_join_request_for_caller: % is not a real decision', p_decision
      using errcode = 'invalid_parameter_value';
  end if;

  select i.person_ref into v_decider_person_ref
  from identity.identities i
  where i.auth_user_id = auth.uid()
    and i.erased_at is null;

  if v_decider_person_ref is null then
    raise exception
      'workspace.decide_join_request_for_caller: no real identity for the caller'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_request from workspace.join_requests where id = p_request_id for update;

  if v_request is null then
    raise exception 'workspace.decide_join_request_for_caller: % is not a real request', p_request_id
      using errcode = 'invalid_parameter_value';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'workspace.decide_join_request_for_caller: % was already decided', p_request_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if not (select granted from workspace.decide_permission(v_request.workspace_id, 'membership.join.approve')) then
    raise exception 'workspace.decide_join_request_for_caller: caller may not decide requests for %', v_request.workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  update workspace.join_requests
  set status = p_decision, decided_at = now(), decided_by = v_decider_person_ref, updated_at = now()
  where id = p_request_id;

  if p_decision = 'approved' then
    -- 'employee', ADR-0027's own professional/Employee, case-fixed (0219) -- the same
    -- table this exact person_ref would already resolve into via workspace.current_
    -- memberships() the moment this transaction commits, no different from any other
    -- real membership this platform creates.
    insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
    values (p_membership_id, v_request.workspace_id, v_request.person_ref, 'employee', 'active', now(), now());

    perform platform.emit_event(
      p_event_id       => p_membership_event_id,
      p_event_type     => 'workspace.membership.joined',
      p_workspace_id   => v_request.workspace_id,
      p_actor_type     => p_actor_type,
      p_actor_ref      => p_actor_ref,
      p_subject_type   => 'membership',
      p_subject_id     => p_membership_id,
      p_correlation_id => p_correlation_id,
      p_payload        => jsonb_build_object('role', 'employee', 'personRef', v_request.person_ref)
    );
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => case p_decision when 'approved' then 'workspace.join.approved' else 'workspace.join.declined' end,
    p_workspace_id   => v_request.workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'join_request',
    p_subject_id     => p_request_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('personRef', v_request.person_ref, 'decidedBy', v_decider_person_ref)
  );
end;
$$;

comment on function workspace.decide_join_request_for_caller(uuid, text, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Approves or declines a pending join request. Refuses a caller without membership.join.approve on the request''s own workspace (ADR-0027, case-fixed 0219), or a request already decided. On approval, creates a real ''employee'' membership in the same transaction and emits workspace.membership.joined alongside workspace.join.approved/declined. Not SECURITY DEFINER, granted to nobody, reachable only from api.decide_join_request().';

revoke all on function workspace.decide_join_request_for_caller(uuid, text, uuid, uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;

-- =========================================================================
-- 6 · api.* delegates — the same two-layer shape every write contract in this codebase
-- uses (0180's own activation_ratios_for_caller()/api.activation_ratios(), most recently
-- 0216's own record_sourced_leads_for_caller()/api.record_sourced_leads()).

create or replace function api.search_professional_workspaces(p_query text)
returns table (workspace_id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select * from workspace.search_professional_workspaces_for_caller(p_query);
$$;

comment on function api.search_professional_workspaces(text) is
  'Delegate for workspace.search_professional_workspaces_for_caller() (ADR-0026''s split).';

create or replace function api.request_to_join(
  p_request_id      uuid,
  p_workspace_id    uuid,
  p_message         text,
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
  select workspace.request_to_join_for_caller(
    p_request_id, p_workspace_id, p_message, p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

comment on function api.request_to_join(uuid, uuid, text, uuid, uuid, platform.actor_type, text) is
  'Delegate for workspace.request_to_join_for_caller() (ADR-0026''s split).';

create or replace function api.list_join_requests(p_workspace_id uuid)
returns table (
  request_id    uuid,
  person_ref    uuid,
  full_name     text,
  avatar_url    text,
  message       text,
  requested_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from workspace.list_join_requests_for_caller(p_workspace_id);
$$;

comment on function api.list_join_requests(uuid) is
  'Delegate for workspace.list_join_requests_for_caller() (ADR-0026''s split).';

create or replace function api.decide_join_request(
  p_request_id           uuid,
  p_decision             text,
  p_membership_id        uuid,
  p_event_id             uuid,
  p_membership_event_id  uuid,
  p_correlation_id       uuid,
  p_actor_type           platform.actor_type,
  p_actor_ref            text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select workspace.decide_join_request_for_caller(
    p_request_id, p_decision, p_membership_id, p_event_id, p_membership_event_id,
    p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

comment on function api.decide_join_request(uuid, text, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Delegate for workspace.decide_join_request_for_caller() (ADR-0026''s split).';

revoke all on function api.search_professional_workspaces(text) from public, anon, service_role;
revoke all on function api.request_to_join(uuid, uuid, text, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.list_join_requests(uuid) from public, anon, service_role;
revoke all on function api.decide_join_request(uuid, text, uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;

grant execute on function api.search_professional_workspaces(text) to authenticated;
grant execute on function api.request_to_join(uuid, uuid, text, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.list_join_requests(uuid) to authenticated;
grant execute on function api.decide_join_request(uuid, text, uuid, uuid, uuid, uuid, platform.actor_type, text) to authenticated;
