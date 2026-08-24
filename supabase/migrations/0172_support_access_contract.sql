-- Support access, WP S.0 — the grant/end/read contract. See SUPPORT_ACCESS_DESIGN.md for
-- the product reasoning this migration implements: ROADMAP_C_PLATFORM_OPERATIONS.md §3.2's
-- own second half of Phase C2 ("a button that starts the same time-boxed, scoped,
-- consent-governed membership flow a contractor uses"), never actually built despite
-- Phase C2 being marked Complete for its read-only search half alone.
--
-- THE MECHANISM IS workspace.memberships, NOT A PARALLEL ONE — PLATFORM_DOMAIN_MODEL.md
-- §8 AND SYSTEM_ARCHITECTURE.md §12.3 BOTH ALREADY DECIDE THIS
--
-- "Support access to a customer workspace is a time-bounded, audited, consent-governed
-- membership — the same mechanism as contractor access, not a parallel one"
-- (SYSTEM_ARCHITECTURE.md §12.3). Follows workspace.grant_engagement_access()'s own
-- reference shape (WP 2.4, 0162) closely: a real, scoped, expiring membership row, minted
-- by a narrow SECURITY-DEFINER-reached delegate, emitting a real event.
--
-- role = 'support' IS THE FIRST MEMBERSHIP ROLE THIS CODEBASE HAS EVER NEEDED TO BE
-- READ-ONLY — AND ALMOST NOTHING CHECKS ROLE TODAY (SUPPORT_ACCESS_DESIGN.md §1.3)
--
-- Checked directly before writing this migration: every real caller of
-- workspace.current_memberships() found in this codebase (0036, 0038, 0041, 0051, 0054,
-- 0059, 0062, and more) treats "has a live membership in this workspace" as sufficient,
-- full stop — none filters by role, because no role before this one has ever needed to
-- be excluded from write access. Consequence: the read function below is deliberately
-- NOT built by joining against a support operator's own membership the way an ordinary
-- read would (property.resolve_property() and its own siblings all do exactly that,
-- correctly, for a real member) — doing so here would let a support session ride every
-- *existing* write path's own membership check, silently granting write access
-- ROADMAP_C §3.2's own "read-only by default" promise forbids. This migration's own two
-- new read functions check platform_operations directly (the same composed EXISTS shape
-- list_audit_records()/search_workspaces()/Trust & Safety's own reads already use), never
-- "does the caller merely hold a membership here." The membership row itself still exists
-- — it is what makes the grant real, auditable, and revocable in one place — it is simply
-- never what any *new* read in this migration trusts for authorization. The
-- pre-existing, codebase-wide gap this finding names (no write path anywhere excludes
-- role = 'support' yet) is real, separate future work, not fixed here — see
-- SUPPORT_ACCESS_DESIGN.md §1.3(b) and §3's own "not scoped here" list.
--
-- CONSENT IS DELIBERATELY NOT BUILT — NO SETTING EXISTS YET TO GATE IT ON
--
-- ROADMAP_C §3.2: "a stated purpose, an expiry, and (where the workspace's own settings
-- require it) the customer's own consent." workspace.workspaces has no approval-mode
-- column at all (checked directly) — PLATFORM_DOMAIN_MODEL.md §8's own three approval
-- modes are described, never built. This migration builds the two conditions §3.2 names
-- unconditionally (a real stated purpose, a real bounded expiry) and does not build the
-- conditional third — SUPPORT_ACCESS_DESIGN.md §1.4's own named, deferred gap.
--
-- THIS IS platform.audit_records' FIRST GENUINELY REAL, CLIENT-REACHABLE CALLER
--
-- Slice 0's own known gap: "platform.audit_records holds zero rows on staging, because
-- no engine's live code path calls platform.write_audit_record() today." The two
-- existing callers (0111, 0126) both belong to engines with no real client entry point
-- yet (Knowledge, Analytics). A support-access grant is exactly the "authority exercised"
-- fact 0022's own header says this table exists for — distinct from an ordinary domain
-- event, which is why Trust & Safety's own decisions (Slice 5) correctly did not write
-- here and this migration does.

-- =========================================================================
-- 1 · workspace.support_access_grants — THE ONE NEW FACT workspace.memberships ITSELF
-- HAS NO COLUMN FOR: WHY. Everything else (who, which workspace, whether it is still
-- live, when it expires) already lives on the membership row, exactly as it does for
-- every other membership type — this table is not a second source of truth for state,
-- only the stated purpose, keyed 1:1 by the membership it belongs to.

create table if not exists workspace.support_access_grants (
  membership_id  uuid        not null
                 references workspace.memberships (id),
  purpose        text        not null,
  created_at     timestamptz not null default now(),

  constraint support_access_grants_pkey primary key (membership_id)
);

comment on table workspace.support_access_grants is
  'The stated purpose for a support-access membership grant (WP S.0) — one row per role=''support'' workspace.memberships row, keyed by its own id. Whether the grant is still live, suspended or ended lives on workspace.memberships itself, the same as for every other membership type; this table never duplicates that state. Immutable once written.';

alter table workspace.support_access_grants enable row level security;
revoke all on workspace.support_access_grants from anon, authenticated, service_role;

-- =========================================================================
-- 2 · WRITE CONTRACT

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
    where workspace.workspace_has_capability(m.workspace_id, 'platform_operations')
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
  'Real caller check: the operator''s own identity must resolve from auth.uid(), and their own active workspace must hold platform_operations. Requires a real, non-blank purpose and a bounded duration (1-72 hours). Mints a real workspace.memberships row (role=''support'', scope=null — unscoped within that one workspace, matching the operator-facing profile ROADMAP_C §3.2 describes), writes the stated purpose, and writes both a real audit record (platform.write_audit_record(), this table''s first genuinely real caller) and a real event. Not SECURITY DEFINER, granted to nobody, reachable only from api.grant_support_access().';

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
  -- specifically being the one to do it.
  if not exists (
    select 1 from workspace.current_memberships() m
    where workspace.workspace_has_capability(m.workspace_id, 'platform_operations')
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
  'Ends an active support-access grant early (state -> ''ended''), before its own expires_at. Any caller holding platform_operations may end any active grant, not only the one they created — see this function''s own comment. Refuses a membership id that is not a currently-active role=''support'' row. Writes a real audit record and event, same shape as the grant itself. Not SECURITY DEFINER, granted to nobody, reachable only from api.end_support_access().';

revoke all on function workspace.grant_support_access_for_caller(uuid, uuid, text, integer, uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function workspace.end_support_access_for_caller(uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;

-- =========================================================================
-- 3 · READ CONTRACT — operator-only, the same composed EXISTS check
-- list_audit_records()/search_workspaces()/Trust & Safety's own reads already use.
-- Deliberately does NOT reuse workspace.current_memberships() as its own authorization
-- check — see this migration's own header for why.

create or replace function workspace.support_access_grants_for_caller(p_workspace_id uuid)
returns table (
  membership_id  uuid,
  operator_name  text,
  purpose        text,
  granted_at     timestamptz,
  expires_at     timestamptz,
  status         text
)
language sql
stable
set search_path = ''
as $$
  select
    m.id,
    operator.full_name,
    g.purpose,
    m.created_at,
    m.expires_at,
    case
      when m.state = 'ended' then 'ended'
      when m.expires_at is not null and m.expires_at <= now() then 'expired'
      else 'active'
    end
  from workspace.memberships m
  join workspace.support_access_grants g on g.membership_id = m.id
  left join identity.identities operator
    on operator.person_ref = m.person_ref and operator.erased_at is null
  where m.role = 'support'
    and m.workspace_id = p_workspace_id
    and exists (
      select 1 from workspace.current_memberships() cm
      where workspace.workspace_has_capability(cm.workspace_id, 'platform_operations')
    )
  order by m.created_at desc;
$$;

comment on function workspace.support_access_grants_for_caller(uuid) is
  'Every support-access grant ever made for one workspace, most recent first — active, expired and ended alike, so an operator can see who has had access, not only who has it now. Restricted to callers holding platform_operations. No SECURITY DEFINER of its own; reached only through api.support_access_grants().';

revoke all on function workspace.support_access_grants_for_caller(uuid) from public, anon, authenticated, service_role;

-- =========================================================================
-- 4 · api.* DELEGATES

create or replace function api.grant_support_access(
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
language sql
security definer
set search_path = ''
as $$
  select workspace.grant_support_access_for_caller(
    p_membership_id, p_workspace_id, p_purpose, p_duration_hours,
    p_audit_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

comment on function api.grant_support_access(uuid, uuid, text, integer, uuid, uuid, uuid, platform.actor_type, text) is
  'Delegate for workspace.grant_support_access_for_caller() (WP S.0). The "Request access" button on WorkspaceLookup.jsx (WP S.1).';

create or replace function api.end_support_access(
  p_membership_id   uuid,
  p_audit_id        uuid,
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
  select workspace.end_support_access_for_caller(p_membership_id, p_audit_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

comment on function api.end_support_access(uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Delegate for workspace.end_support_access_for_caller() (WP S.0).';

create or replace function api.support_access_grants(p_workspace_id uuid)
returns table (
  membership_id  uuid,
  operator_name  text,
  purpose        text,
  granted_at     timestamptz,
  expires_at     timestamptz,
  status         text
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from workspace.support_access_grants_for_caller(p_workspace_id);
$$;

comment on function api.support_access_grants(uuid) is
  'Delegate for workspace.support_access_grants_for_caller() (WP S.0).';

revoke all on function api.grant_support_access(uuid, uuid, text, integer, uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.end_support_access(uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.support_access_grants(uuid) from public, anon, service_role;

grant execute on function api.grant_support_access(uuid, uuid, text, integer, uuid, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.end_support_access(uuid, uuid, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.support_access_grants(uuid) to authenticated;

-- =========================================================================
-- 5 · authenticated GAINS NO NEW TABLE GRANTS — workspace.support_access_grants keeps
-- RLS enabled, no policy, the same posture every engine schema in this codebase already
-- holds. Reachable only through this contract's own already-checked functions.
