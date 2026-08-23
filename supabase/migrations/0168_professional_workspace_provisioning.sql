-- Found while fixing "become a pro" discoverability (UNIFIED_PRODUCT_IA_REVIEW.md §5) —
-- becoming a pro is broken at the data layer, not just unreachable.
--
-- THE GAP, CONFIRMED LIVE, NOT ASSUMED FROM READING MIGRATIONS
--
-- src/lib/auth.jsx's becomePro() does exactly one write: `insert into pro_profiles`. The
-- only trigger on that table — on_pro_profile_created -> handle_new_pro_profile(),
-- confirmed via pg_get_functiondef() directly against staging — only initializes
-- pro_stats. The only place a Professional Workspace has ever been created is
-- 0034_backfill_professional_workspace.sql, a ONE-TIME migration that ran once when
-- Epic 03 shipped, covering only the pros that existed at that exact moment. Nothing has
-- created one since. This is the identical shape to the gap
-- 0135_personal_workspace_provisioning.sql already found and fixed for the Personal
-- Workspace side ("No account created after Epic 03's own workspace backfill has ever
-- received a workspace... every workspace-scoped engine has been structurally
-- unreachable... silently, because AppShell.jsx's own fallback... never surfaced the gap
-- as a visible bug") — the professional side of the identical bug, found four migrations
-- later.
--
-- CONSEQUENCE: anyone who becomes a pro today lands on ProApp with activeWorkspace
-- resolved to their PERSONAL workspace (their only real membership) — every marketplace
-- write requiring real performing_workspace_id membership (submit_quote,
-- accept_quote, create_service_record, all of it) is either checking the wrong
-- workspace or refusing outright. Every seeded test pro (Pierre included) has a real
-- professional workspace only because it was seeded directly, not because the live flow
-- produces one.
--
-- THE FIX MIRRORS 0135's OWN SHAPE EXACTLY, NOT A TRIGGER — SAME IDENTIFIER DISCIPLINE,
-- SAME REASONING
--
-- 0135's own header already settled this question for the identical situation: a live
-- write path (not a backfill) means ADR-0022 applies with full force — identifiers come
-- from the application, never minted by the database. Unlike handle_new_user() (a real
-- auth.users trigger, ids threaded through raw_user_meta_data because the client already
-- controls that insert), becoming a pro is an ordinary button press with no natural
-- trigger point — the established pattern for that shape, used for every other real
-- write this session has built, is a client-generated-id call to a dedicated api.*
-- function, not a trigger.
--
-- ONE FUNCTION PER ENGINE, COMPOSED — NOT ONE FUNCTION DOING BOTH ENGINES' INSERTS
--
-- workspace.create_professional_workspace_for_caller() owns exactly the workspace engine's
-- own two inserts (workspace + membership), mirroring workspace.create_personal_workspace()
-- (0135) field for field, including its own real caller check (resolves person_ref from
-- auth.uid() itself, never trusts a parameter) and its own "already has one" guard —
-- exactly the invariant 0135's own version already established for the personal case.
-- api.become_pro() composes it with the (unchanged) pro_profiles insert, the same way
-- handle_new_user() composes create_personal_workspace() with create_property() — one
-- transaction, two engines, two functions, not one function reaching into both.

-- =========================================================================
-- THE WORKSPACE CONTRACT

create or replace function workspace.create_professional_workspace_for_caller(
  p_workspace_id         uuid,
  p_membership_id        uuid,
  p_workspace_name       text,
  p_workspace_event_id   uuid,
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
  v_person_ref uuid;
begin
  select i.person_ref into v_person_ref
  from identity.identities i
  where i.auth_user_id = auth.uid()
    and i.erased_at is null;

  if v_person_ref is null then
    raise exception
      'workspace.create_professional_workspace_for_caller: no real identity for the caller'
      using errcode = 'insufficient_privilege';
  end if;

  if exists (
    select 1
    from workspace.memberships m
    join workspace.workspaces w on w.id = m.workspace_id
    where m.person_ref = v_person_ref
      and w.type = 'professional'
      and m.role = 'owner'
  ) then
    raise exception
      'workspace.create_professional_workspace_for_caller: % already has a professional workspace', v_person_ref
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  insert into workspace.workspaces (id, type, name, created_at, updated_at)
  values (p_workspace_id, 'professional', p_workspace_name, now(), now());

  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
  values (p_membership_id, p_workspace_id, v_person_ref, 'owner', 'active', now(), now());

  perform platform.emit_event(
    p_event_id       => p_workspace_event_id,
    p_event_type     => 'workspace.workspace.created',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'workspace',
    p_subject_id     => p_workspace_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('type', 'professional', 'name', p_workspace_name)
  );

  perform platform.emit_event(
    p_event_id       => p_membership_event_id,
    p_event_type     => 'workspace.membership.joined',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'membership',
    p_subject_id     => p_membership_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('role', 'owner', 'personRef', v_person_ref)
  );
end;
$$;

comment on function workspace.create_professional_workspace_for_caller(uuid, uuid, text, uuid, uuid, uuid, platform.actor_type, text) is
  'Creates the caller''s own Professional Workspace, with its founding owner membership, atomically — the live-write-path equivalent of workspace.create_personal_workspace() (0135), field for field. Resolves person_ref from auth.uid() itself, never a parameter. Refuses if the caller already has one. Emits workspace.workspace.created and workspace.membership.joined. Not SECURITY DEFINER, granted to nobody, reachable only from api.become_pro().';

revoke all on function workspace.create_professional_workspace_for_caller(uuid, uuid, text, uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;

-- =========================================================================
-- api.become_pro() — composes the (unchanged) pro_profiles insert with the workspace
-- contract above, in one transaction, the same shape handle_new_user() already uses to
-- compose create_personal_workspace() with create_property().

create or replace function api.become_pro(
  p_workspace_id         uuid,
  p_membership_id        uuid,
  p_pro_type             text,
  p_business_name        text,
  p_vat_number           text,
  p_bio                  text,
  p_workspace_event_id   uuid,
  p_membership_event_id  uuid,
  p_correlation_id       uuid,
  p_actor_type           platform.actor_type,
  p_actor_ref            text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text;
begin
  if exists (select 1 from public.pro_profiles where profile_id = auth.uid()) then
    raise exception 'api.become_pro: caller already has a pro profile'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- Unchanged from the client's own previous direct insert — same table, same columns,
  -- same check constraint (business_requires_details, 0001) doing the same validation
  -- it always did. Only the caller changes: this function now, not the browser directly.
  insert into public.pro_profiles (profile_id, pro_type, business_name, vat_number, bio)
  values (auth.uid(), p_pro_type, p_business_name, p_vat_number, p_bio);

  select i.full_name into v_full_name
  from identity.identities i
  where i.auth_user_id = auth.uid();

  -- Same coalesce order 0034's own backfill already established for this exact
  -- decision — a business's own name first, the person's own name second (ADR-0023,
  -- measured against real data: "business_name is frequently the person's own name"),
  -- a placeholder only for the identity with neither.
  perform workspace.create_professional_workspace_for_caller(
    p_workspace_id, p_membership_id,
    coalesce(p_business_name, v_full_name, 'My Business'),
    p_workspace_event_id, p_membership_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
end;
$$;

comment on function api.become_pro(uuid, uuid, text, text, text, text, uuid, uuid, uuid, platform.actor_type, text) is
  'Real, atomic "become a pro": pro_profiles + a real Professional Workspace + its founding membership, one transaction, closing the gap this migration''s own header names. Replaces src/lib/auth.jsx''s previous direct insert into pro_profiles.';

revoke all on function api.become_pro(uuid, uuid, text, text, text, text, uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, service_role;
grant execute on function api.become_pro(uuid, uuid, text, text, text, text, uuid, uuid, uuid, platform.actor_type, text)
  to authenticated;
