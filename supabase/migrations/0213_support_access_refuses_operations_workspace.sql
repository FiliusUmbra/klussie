-- Fix: workspace.grant_support_access_for_caller() (0172, guarded further by 0179) never
-- refused the operations workspace itself as a grant TARGET.
--
-- 0179 closed the loop where a support grant on the operations workspace could be used to
-- pass the "is this caller an operator" check on the three sensitive write functions
-- (grant/end support access, record a Trust & Safety decision) -- by excluding role =
-- 'support' from that check. That closes the write-side escalation. It does not close a
-- narrower, read-only gap in the same mechanism, found live 2026-09-08 checking the
-- Operator surface as a real operator (Workspace Lookup's own "Request access" button is
-- still offered for the operations workspace's own row, and the grant still succeeds):
--
-- platform.list_audit_records() (0133), safety.trust_safety_queue_for_caller() and
-- safety.case_detail_for_caller() (0171) all gate on workspace.workspace_has_capability(
-- m.workspace_id, 'platform_operations') -- unscoped to which workspace the caller's own
-- membership is ON, and deliberately NOT given the role <> 'support' exclusion 0179 added
-- to the write functions (0179's own header: "a support-access grant on the operations
-- workspace being able to read the audit trail or the Trust & Safety queue is the
-- intended shape of 'read-only by default'"). That reasoning holds only if a support
-- grant can never itself satisfy workspace_has_capability(m.workspace_id,
-- 'platform_operations') -- true for a grant on an ordinary customer/pro workspace (none
-- of those hold platform_operations), false for a grant on the operations workspace
-- itself, which trivially does. A support-role membership minted there passes the same
-- unscoped read gate every real operator does -- platform-wide read access to the entire
-- audit trail and every open Trust & Safety case, through a mechanism designed to be a
-- time-boxed, scoped, read-only support session into ONE customer's workspace.
--
-- THE FIX IS AT THE ONE PLACE THAT CAN ACTUALLY CREATE THIS GRANT, NOT AT EACH READER
--
-- Refusing p_workspace_id up front, the moment anyone (support-role or not) tries to
-- target a platform_operations-holding workspace, closes the read gap the same way 0179
-- closed the write one: at its own single source, not by re-auditing every read function
-- that (correctly, per 0179's own reasoning) trusts "no support grant ever reaches a
-- platform_operations-holding workspace" as an invariant this migration is what makes true.
--
-- LIVE-VERIFIED, NOT ASSUMED: reproduced as a real operator on staging (a genuine
-- platform_operations membership, not a support-role one) -- "Request access" against the
-- Operations Workspace's own row succeeded and was ended immediately afterward; no data
-- was read through it.
create or replace function workspace.grant_support_access_for_caller(
  p_membership_id    uuid,
  p_workspace_id     uuid,
  p_purpose          text,
  p_duration_hours   integer,
  p_audit_id         uuid,
  p_event_id         uuid,
  p_correlation_id   uuid,
  p_actor_type       platform.actor_type,
  p_actor_ref        text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_operator_person_ref  uuid;
  v_expires_at           timestamptz;
begin
  select i.person_ref into v_operator_person_ref
  from identity.identities i
  where i.auth_user_id = auth.uid() and i.erased_at is null;

  if v_operator_person_ref is null then
    raise exception
      'workspace.grant_support_access_for_caller: caller has no resolvable identity'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from workspace.current_memberships() m
    where workspace.workspace_has_capability(m.workspace_id, 'platform_operations') and m.role <> 'support'
  ) then
    raise exception
      'workspace.grant_support_access_for_caller: caller does not hold platform_operations'
      using errcode = 'insufficient_privilege';
  end if;

  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception
      'workspace.grant_support_access_for_caller: a real stated purpose is required'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Bounded: an active support session, not a standing relationship — the same
  -- "safety-net, not the business rule" framing WP 2.4's own 90-day contractor expiry
  -- uses, scaled down because this grant is deliberately short-lived by design, not
  -- merely capped as a backstop.
  if p_duration_hours is null or p_duration_hours <= 0 or p_duration_hours > 72 then
    raise exception
      'workspace.grant_support_access_for_caller: duration must be between 1 and 72 hours'
      using errcode = 'invalid_parameter_value';
  end if;

  if not exists (select 1 from workspace.workspaces where id = p_workspace_id) then
    raise exception
      'workspace.grant_support_access_for_caller: workspace % does not exist', p_workspace_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- 0213: the target itself must never hold platform_operations. Support access is a
  -- scoped, read-only session into one ordinary customer/pro workspace -- never into
  -- Platform Operations' own control plane, where the identical grant becomes real,
  -- unscoped, platform-wide read access to the audit trail and Trust & Safety queue (see
  -- this migration's own header).
  if workspace.workspace_has_capability(p_workspace_id, 'platform_operations') then
    raise exception
      'workspace.grant_support_access_for_caller: cannot grant support access on a workspace holding platform_operations'
      using errcode = 'invalid_parameter_value';
  end if;

  v_expires_at := now() + make_interval(hours => p_duration_hours);

  insert into workspace.memberships (
    id, workspace_id, person_ref, role, scope, state, expires_at, created_at, updated_at
  ) values (
    p_membership_id, p_workspace_id, v_operator_person_ref, 'support', null, 'active', v_expires_at, now(), now()
  );

  insert into workspace.support_access_grants (membership_id, purpose, created_at)
  values (p_membership_id, p_purpose, now());

  -- The real, client-reachable first write to platform.audit_records — see this
  -- migration's own header.
  perform platform.write_audit_record(
    p_audit_id       => p_audit_id,
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_action         => 'workspace.support_access_granted',
    p_subject_type   => 'membership',
    p_subject_id     => p_membership_id,
    p_outcome        => 'permitted',
    p_authority      => 'platform_operations',
    p_correlation_id => p_correlation_id,
    p_detail         => jsonb_build_object('purpose', p_purpose, 'expiresAt', to_jsonb(v_expires_at))
  );

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'workspace.support_access.granted',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'membership',
    p_subject_id     => p_membership_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('purpose', p_purpose, 'expiresAt', to_jsonb(v_expires_at))
  );
end;
$$;

comment on function workspace.grant_support_access_for_caller(uuid, uuid, text, integer, uuid, uuid, uuid, platform.actor_type, text) is
  'Real caller check: the operator''s own identity must resolve from auth.uid(), and their own active, non-support membership must hold platform_operations (0179 — closes the loop where a support grant on the operations workspace itself could mint further support grants anywhere). Requires a real, non-blank purpose and a bounded duration (1-72 hours). Refuses a target workspace that itself holds platform_operations (0213 — closes the read-side gap 0179 left: such a grant would otherwise pass every read function''s own unscoped platform_operations check). Mints a real workspace.memberships row (role=''support'', scope=null — unscoped within that one workspace, matching the operator-facing profile ROADMAP_C §3.2 describes), writes the stated purpose, and writes both a real audit record (platform.write_audit_record(), this table''s first genuinely real caller) and a real event. Not SECURITY DEFINER, granted to nobody, reachable only from api.grant_support_access().';

-- No grant/revoke changes — this function's own access posture is untouched by this fix.
