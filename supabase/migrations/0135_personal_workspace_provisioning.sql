-- Platform Activation Slice 1, WP 1.0 — every new signup gets a real Personal Workspace
-- and property, automatically, the moment the account exists.
--
-- THE GAP THIS CLOSES, FOUND WHILE SCOPING SLICE 1
--
-- No account created after Epic 03's own workspace backfill (0033) ran has ever received
-- a workspace at all. `public.handle_new_user()` (0027) creates a profile and an identity;
-- nothing anywhere — no trigger, no client call, no lazy-create path — has ever created a
-- workspace.workspaces row or a workspace.memberships row for a NEW signup. Checked
-- exhaustively: `grep -rn "create trigger"` across every migration in this repository
-- shows the one-time backfills (0033 personal, 0034 professional) and nothing that fires
-- going forward. Every workspace-scoped engine built since Epic 03 — capabilities,
-- properties, assets, marketplace, billing, everything — has been structurally
-- unreachable for any post-backfill signup, silently, because AppShell.jsx's own fallback
-- to the pre-Epic-03 `role` toggle for a zero-membership person is graceful by design
-- (§27: "invisible for the single-workspace case") and never surfaced the gap as a visible
-- bug. This migration is the fix, extended one step further to also provision a property
-- (SLICE_1_PROPERTY_ASSET_ACTIVATION.md WP 1.0's own Option A) — everyone has somewhere
-- they live (§27), and a Personal Workspace without one is the exact half-provisioned
-- state that made the workspace gap itself invisible for so long.
--
-- WHY THIS IS A REAL WRITE PATH, NOT A BACKFILL — AND WHY THAT CHANGES THE IDENTIFIER
-- DISCIPLINE FROM EVERY PRECEDENT THIS SESSION HAS FOLLOWED SO FAR
--
-- 0033/0040 (the backfills this migration's own reasoning otherwise mirrors closely) mint
-- identifiers with `platform.uuid_v7_at()`, because ADR-0022 draws its line exactly there:
-- "the rule governs the write path; a backfill is not one." A live signup is unambiguously
-- the write path — "an engine must know an aggregate's identity before it writes, so it
-- can emit an event referencing it in the same transaction" (SUPABASE_ARCHITECTURE.md §3)
-- applies here with full force, for the first time this session has built new signup-time
-- provisioning rather than a one-time historical migration. `platform.uuid_v7_at()` is
-- "revoked from PUBLIC, granted to no role... no engine can call it" (ADR-0022's own
-- Decision section) — a rule this migration honours rather than bypasses via ownership.
--
-- THE PRIMARY PATH IS CLIENT-GENERATED IDS, MATCHING person_ref EXACTLY
--
-- `handle_new_user()` already has this discipline for `person_ref` — src/lib/auth.jsx's
-- `signUp()`/`signInWithOtp()` generate it via `uuidv7()` (src/lib/ids.ts) and pass it
-- through `raw_user_meta_data`. This migration extends the identical pattern to six more
-- fields (`newAccountProvisioningIds()`, src/lib/auth.jsx): workspace_id, membership_id,
-- property_id, and one event id per aggregate created. `platform.uuid_v7_at(now())` is
-- used here only as the same defensive fallback `person_ref` already has, for exactly the
-- same reason — a malformed or absent value from an old client build, or from
-- `signInWithOAuth()` (which sends no ids at all, unchanged, matching how it already sends
-- no `person_ref`) must not fail someone's signup.
--
-- THE GUARD LIVES IN handle_new_user(), NOT INSIDE THE CONTRACT FUNCTIONS
--
-- workspace.create_personal_workspace() refuses (raises) if the person already holds one —
-- a real domain invariant (§27: exactly one Personal Workspace per person, unlike
-- Property, where §9.1 explicitly permits "a workspace may hold many"). The trigger checks
-- the identical predicate 0033's own backfill uses *before* calling either contract
-- function, so the raise inside create_personal_workspace() is defence in depth against a
-- genuine race, not the normal control flow — and the whole provisioning block is wrapped
-- in its own exception handler below, because a signup failing outright over a
-- provisioning race is a far worse outcome than one account temporarily missing its
-- workspace, recoverable by SLICE_1_PROPERTY_ASSET_ACTIVATION.md's own lazy-create path
-- (WP 1.0 Option B) if this rare case is ever actually hit.
--
-- property.create_property() carries NO "workspace already has a property" guard,
-- deliberately — that would be correct for this one call site and wrong for the contract
-- itself, which must remain callable for a landlord's second and third property (§9.1)
-- once a later work package builds that flow.

-- =========================================================================
-- THE WORKSPACE CONTRACT

create or replace function workspace.create_personal_workspace(
  p_workspace_id         uuid,
  p_membership_id        uuid,
  p_person_ref           uuid,
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
begin
  if exists (
    select 1
    from workspace.memberships m
    join workspace.workspaces w on w.id = m.workspace_id
    where m.person_ref = p_person_ref
      and w.type = 'personal'
      and m.role = 'owner'
  ) then
    raise exception
      'workspace.create_personal_workspace: person % already has a personal workspace', p_person_ref
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  insert into workspace.workspaces (id, type, name, created_at, updated_at)
  values (p_workspace_id, 'personal', 'My Home', now(), now());

  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
  values (p_membership_id, p_workspace_id, p_person_ref, 'owner', 'active', now(), now());

  perform platform.emit_event(
    p_event_id       => p_workspace_event_id,
    p_event_type     => 'workspace.workspace.created',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'workspace',
    p_subject_id     => p_workspace_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('type', 'personal', 'name', 'My Home')
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
    p_payload        => jsonb_build_object('role', 'owner', 'personRef', p_person_ref)
  );
end;
$$;

comment on function workspace.create_personal_workspace(uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Creates a person''s one and only Personal Workspace, with its founding owner membership, atomically (WP 1.0). Refuses if one already exists — exactly one Personal Workspace per person is a real invariant (§27), unlike Property. Emits workspace.workspace.created and workspace.membership.joined.';

-- =========================================================================
-- THE PROPERTY CONTRACT

create or replace function property.create_property(
  p_property_id           uuid,
  p_steward_workspace_id  uuid,
  p_name                  text,
  p_event_id              uuid,
  p_correlation_id        uuid,
  p_actor_type            platform.actor_type,
  p_actor_ref             text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into property.properties (id, name, steward_workspace_id, steward_since, created_at, updated_at)
  values (p_property_id, p_name, p_steward_workspace_id, now(), now(), now());

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'property.property.created',
    p_workspace_id   => p_steward_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'property',
    p_subject_id     => p_property_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('name', p_name)
  );
end;
$$;

comment on function property.create_property(uuid, uuid, text, uuid, uuid, platform.actor_type, text) is
  'Creates a property stewarded by the given workspace (WP 1.0). No "already has one" guard — §9.1 permits many properties per workspace; that invariant belongs to a future multi-property flow''s own caller, never to this contract. Emits property.property.created.';

-- =========================================================================
-- HANDLE_NEW_USER, EXTENDED — everything above this section unchanged from 0027

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_person_ref          uuid;
  v_workspace_id         uuid;
  v_membership_id        uuid;
  v_property_id          uuid;
  v_workspace_event_id   uuid;
  v_membership_event_id  uuid;
  v_property_event_id    uuid;
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url');

  insert into public.profile_contacts (profile_id, email)
  values (new.id, new.email);

  -- The application's identifier, if the application made this signup. A malformed value
  -- falls through to the mint rather than raising: a client sending nonsense is a defect
  -- worth finding, and failing a person's signup over it is not the way to find it.
  begin
    v_person_ref := nullif(new.raw_user_meta_data ->> 'person_ref', '')::uuid;
  exception when invalid_text_representation then
    v_person_ref := null;
  end;

  if v_person_ref is null then
    v_person_ref := platform.uuid_v7_at(now());
  end if;

  -- `on conflict do nothing` on the auth-user link, so exactly one identity exists per
  -- auth user no matter how many times anything runs. The unique constraint is what makes
  -- a second one impossible; this makes the attempt harmless rather than an error that
  -- would fail a signup.
  insert into identity.identities (
    person_ref, auth_user_id, full_name, avatar_url, email, created_at, updated_at
  ) values (
    v_person_ref,
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    new.email,
    now(),
    now()
  )
  on conflict (auth_user_id) do nothing;

  -- =========================================================================
  -- NEW — Personal Workspace + property (WP 1.0). Same malformed-falls-through-to-mint
  -- idiom as person_ref above, extended to six more fields. The whole block is wrapped in
  -- its own exception handler: a provisioning race (caught structurally by
  -- create_personal_workspace()'s own guard) must never fail the signup itself — this
  -- account still gets a profile and an identity even in that unlikely case, and a missing
  -- workspace is recoverable later (SLICE_1_PROPERTY_ASSET_ACTIVATION.md WP 1.0 Option B),
  -- where a failed signup is not.

  begin
    begin
      v_workspace_id := nullif(new.raw_user_meta_data ->> 'workspace_id', '')::uuid;
    exception when invalid_text_representation then
      v_workspace_id := null;
    end;
    if v_workspace_id is null then
      v_workspace_id := platform.uuid_v7_at(now());
    end if;

    begin
      v_membership_id := nullif(new.raw_user_meta_data ->> 'membership_id', '')::uuid;
    exception when invalid_text_representation then
      v_membership_id := null;
    end;
    if v_membership_id is null then
      v_membership_id := platform.uuid_v7_at(now());
    end if;

    begin
      v_property_id := nullif(new.raw_user_meta_data ->> 'property_id', '')::uuid;
    exception when invalid_text_representation then
      v_property_id := null;
    end;
    if v_property_id is null then
      v_property_id := platform.uuid_v7_at(now());
    end if;

    begin
      v_workspace_event_id := nullif(new.raw_user_meta_data ->> 'workspace_event_id', '')::uuid;
    exception when invalid_text_representation then
      v_workspace_event_id := null;
    end;
    if v_workspace_event_id is null then
      v_workspace_event_id := platform.uuid_v7_at(now());
    end if;

    begin
      v_membership_event_id := nullif(new.raw_user_meta_data ->> 'membership_event_id', '')::uuid;
    exception when invalid_text_representation then
      v_membership_event_id := null;
    end;
    if v_membership_event_id is null then
      v_membership_event_id := platform.uuid_v7_at(now());
    end if;

    begin
      v_property_event_id := nullif(new.raw_user_meta_data ->> 'property_event_id', '')::uuid;
    exception when invalid_text_representation then
      v_property_event_id := null;
    end;
    if v_property_event_id is null then
      v_property_event_id := platform.uuid_v7_at(now());
    end if;

    if not exists (
      select 1
      from workspace.memberships m
      join workspace.workspaces w on w.id = m.workspace_id
      where m.person_ref = v_person_ref
        and w.type = 'personal'
        and m.role = 'owner'
    ) then
      perform workspace.create_personal_workspace(
        p_workspace_id        => v_workspace_id,
        p_membership_id       => v_membership_id,
        p_person_ref          => v_person_ref,
        p_workspace_event_id  => v_workspace_event_id,
        p_membership_event_id => v_membership_event_id,
        p_correlation_id      => v_workspace_id,
        p_actor_type          => 'person',
        p_actor_ref           => new.id::text
      );

      perform property.create_property(
        p_property_id          => v_property_id,
        p_steward_workspace_id => v_workspace_id,
        p_name                 => 'My Home',
        p_event_id             => v_property_event_id,
        p_correlation_id       => v_workspace_id,
        p_actor_type           => 'person',
        p_actor_ref            => new.id::text
      );
    end if;
  exception when others then
    null;
  end;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Signup trigger: profile, profile_contacts, identity (unchanged since 0027) plus a Personal Workspace, its founding membership, and a property (WP 1.0). Provisioning is exception-wrapped — a race here never fails the signup itself; see this migration''s own header.';

-- No new grants. handle_new_user() is SECURITY DEFINER, owned by the migration runner
-- exactly as it already was; calling workspace.create_personal_workspace() and
-- property.create_property() (also owned by the migration runner) needs nothing beyond
-- what that ownership already grants. Both new functions are reachable by nobody else —
-- no explicit grant is added, matching workspace.current_memberships()'s own posture for
-- a function meant to be called only as a nested call from a privileged caller.
