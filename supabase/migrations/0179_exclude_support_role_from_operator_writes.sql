-- Fix: a real privilege-escalation loop within Platform Operations itself, found by
-- extending the write-path role audit (0173-0178) to the "does the caller hold
-- platform_operations" check pattern, not only the plainer "does the caller hold ANY
-- membership in workspace X" pattern every prior migration in this audit fixed.
--
-- THE LOOP, CONCRETELY
--
-- workspace.grant_support_access_for_caller() (0172) lets any real operator (someone
-- who already, legitimately, holds platform_operations) grant a role='support'
-- membership on ANY workspace — nothing in it refuses the operations workspace itself
-- as a target. Three functions then decide "is this caller allowed to act as an
-- operator" by checking `workspace.workspace_has_capability(m.workspace_id,
-- 'platform_operations')` against the caller's own current memberships — without
-- excluding role = 'support':
--
--   workspace.grant_support_access_for_caller()  (0172) — mint further support grants
--   workspace.end_support_access_for_caller()    (0172) — end any support grant
--   safety.record_decision_for_caller()          (0171) — resolve/escalate a Trust &
--     Safety case, including withdrawing a capability (suspending a business)
--
-- Put together: a real operator, or anyone who compromises one real operator's session,
-- can grant a role='support' membership on the operations workspace to a third party —
-- a membership ROADMAP_C §3.2 and this whole design describe as strictly read-only —
-- and that third party then passes all three checks above, becoming a full pseudo-
-- operator: able to make Trust & Safety decisions, suspend businesses, and mint or end
-- further support grants on any workspace, indefinitely renewable. This is a narrower,
-- more serious instance of the exact class 0173-0178 already fixed, inside Platform
-- Operations' own control plane rather than a single customer/professional workspace.
--
-- THE READ FUNCTIONS USING THE SAME CAPABILITY CHECK ARE UNCHANGED, DELIBERATELY
--
-- platform.list_audit_records() (0133), safety.trust_safety_queue_for_caller() and
-- safety.case_detail_for_caller() (0171) all use the identical composed EXISTS check
-- and are read-only — a support-access grant on the operations workspace being able to
-- read the audit trail or the Trust & Safety queue is the intended shape of "read-only
-- by default" (0172's own header), not a gap. Only the three WRITE functions above are
-- fixed here.
--
-- Fixes three functions, each redefined with its own body otherwise byte-for-byte
-- identical to its last shipped version — only the capability check gains one
-- additional guard clause.

create or replace function safety.record_decision_for_caller(
  p_decision_id            uuid,
  p_case_id                uuid,
  p_action                 text,
  p_reason                 text,
  p_capability_key         text,
  p_withdrawal_history_id  uuid,
  p_withdrawal_event_id    uuid,
  p_decided_event_id       uuid,
  p_correlation_id         uuid,
  p_actor_type             platform.actor_type,
  p_actor_ref              text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_operator_person_ref   uuid;
  v_reported_workspace_id uuid;
  v_status                text;
begin
  select i.person_ref into v_operator_person_ref
  from identity.identities i
  where i.auth_user_id = auth.uid() and i.erased_at is null;

  if v_operator_person_ref is null then
    raise exception
      'safety.record_decision_for_caller: caller has no resolvable identity'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from workspace.current_memberships() m
    where workspace.workspace_has_capability(m.workspace_id, 'platform_operations') and m.role <> 'support'
  ) then
    raise exception
      'safety.record_decision_for_caller: caller does not hold platform_operations'
      using errcode = 'insufficient_privilege';
  end if;

  select reported_workspace_id, status into v_reported_workspace_id, v_status
  from safety.cases
  where id = p_case_id;

  if v_reported_workspace_id is null then
    raise exception
      'safety.record_decision_for_caller: case % does not exist', p_case_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if v_status = 'resolved' then
    raise exception
      'safety.record_decision_for_caller: case % is already resolved', p_case_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  insert into safety.decisions (id, case_id, operator_person_ref, action, reason, capability_key, decided_at)
  values (p_decision_id, p_case_id, v_operator_person_ref, p_action, p_reason, p_capability_key, now());

  update safety.cases
  set status = case when p_action = 'escalate' then 'escalated' else 'resolved' end,
      updated_at = now()
  where id = p_case_id;

  -- The one privileged cross-engine write this function performs — see this migration's
  -- own header for why no new grant or wrapper is needed to reach it from here.
  if p_action = 'suspend' then
    perform workspace.withdraw_capability(
      p_workspace_id   => v_reported_workspace_id,
      p_capability_key => p_capability_key,
      p_history_id     => p_withdrawal_history_id,
      p_event_id       => p_withdrawal_event_id,
      p_correlation_id => p_correlation_id,
      p_actor_type     => p_actor_type,
      p_actor_ref      => p_actor_ref
    );
  end if;

  perform platform.emit_event(
    p_event_id       => p_decided_event_id,
    p_event_type     => 'safety.case.decided',
    p_workspace_id   => v_reported_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'case',
    p_subject_id     => p_case_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('action', p_action, 'capabilityKey', p_capability_key)
  );
end;
$$;

comment on function safety.record_decision_for_caller(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Real caller check: the operator''s own identity must resolve from auth.uid(), and their own active, non-support workspace membership must hold platform_operations (0179 — a support-access grant on the operations workspace itself, migration 0172, must never be sufficient to decide a Trust & Safety case). Refuses a case that does not exist or is already resolved. Calls workspace.withdraw_capability() directly when action = ''suspend'' — see this migration''s own header. Not SECURITY DEFINER, granted to nobody, reachable only from api.record_decision().';

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
  'Real caller check: the operator''s own identity must resolve from auth.uid(), and their own active, non-support membership must hold platform_operations (0179 — closes the loop where a support grant on the operations workspace itself could mint further support grants anywhere). Requires a real, non-blank purpose and a bounded duration (1-72 hours). Mints a real workspace.memberships row (role=''support'', scope=null — unscoped within that one workspace, matching the operator-facing profile ROADMAP_C §3.2 describes), writes the stated purpose, and writes both a real audit record (platform.write_audit_record(), this table''s first genuinely real caller) and a real event. Not SECURITY DEFINER, granted to nobody, reachable only from api.grant_support_access().';

create or replace function workspace.end_support_access_for_caller(
  p_membership_id   uuid,
  p_audit_id        uuid,
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
  v_workspace_id  uuid;
begin
  if not exists (
    select 1
    from identity.identities i
    where i.auth_user_id = auth.uid() and i.erased_at is null
  ) then
    raise exception
      'workspace.end_support_access_for_caller: caller has no resolvable identity'
      using errcode = 'insufficient_privilege';
  end if;

  -- Any operator holding platform_operations may end any active support-access grant,
  -- not only the one they themselves created — "operator roles, plural" does not exist
  -- yet (ROADMAP_C §6, the same open question SUPPORT_ACCESS_DESIGN.md and the Trust &
  -- Safety contract both already carry forward rather than silently assume either way),
  -- and access that needs cutting short should not depend on the granting operator
  -- specifically being the one to do it. role <> 'support' (0179): a support grant on
  -- the operations workspace itself must never count as that operator authority.
  if not exists (
    select 1 from workspace.current_memberships() m
    where workspace.workspace_has_capability(m.workspace_id, 'platform_operations') and m.role <> 'support'
  ) then
    raise exception
      'workspace.end_support_access_for_caller: caller does not hold platform_operations'
      using errcode = 'insufficient_privilege';
  end if;

  select workspace_id into v_workspace_id
  from workspace.memberships
  where id = p_membership_id and role = 'support' and state = 'active';

  if v_workspace_id is null then
    raise exception
      'workspace.end_support_access_for_caller: membership % is not an active support-access grant', p_membership_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  update workspace.memberships
  set state = 'ended', updated_at = now()
  where id = p_membership_id;

  perform platform.write_audit_record(
    p_audit_id       => p_audit_id,
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_action         => 'workspace.support_access_ended',
    p_subject_type   => 'membership',
    p_subject_id     => p_membership_id,
    p_outcome        => 'permitted',
    p_authority      => 'platform_operations',
    p_correlation_id => p_correlation_id,
    p_detail         => '{}'::jsonb
  );

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'workspace.support_access.ended',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'membership',
    p_subject_id     => p_membership_id,
    p_correlation_id => p_correlation_id,
    p_payload        => '{}'::jsonb
  );
end;
$$;

comment on function workspace.end_support_access_for_caller(uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Ends an active support-access grant early (state -> ''ended''), before its own expires_at. Any caller holding platform_operations through a real, non-support membership (0179) may end any active grant, not only the one they created — see this function''s own comment. Refuses a membership id that is not a currently-active role=''support'' row. Writes a real audit record and event, same shape as the grant itself. Not SECURITY DEFINER, granted to nobody, reachable only from api.end_support_access().';

-- No grant/revoke changes — every function's own access posture is untouched. The read
-- functions sharing this same capability-check shape (platform.list_audit_records(),
-- safety.trust_safety_queue_for_caller(), safety.case_detail_for_caller()) are
-- deliberately NOT touched here — see this migration's own header.
