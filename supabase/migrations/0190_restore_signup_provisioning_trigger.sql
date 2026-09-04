-- Corrective migration — restores signup-time provisioning, closed after being confirmed
-- broken by a systematic read-only authorization audit and its own follow-up checkpoint,
-- 2026-08-31.
--
-- THE FAILURE, CONFIRMED READ-ONLY BEFORE ANYTHING HERE WAS WRITTEN
--
-- auth.users had zero enabled triggers on staging (pg_trigger, excluding internal) --
-- on_auth_user_created did not exist at all, not merely disabled. public.handle_new_user()
-- did exist, correctly owned (postgres), correctly SECURITY DEFINER, correctly a fixed
-- search_path -- but its deployed body was stale: it stopped after creating
-- public.profiles/public.profile_contacts/identity.identities, exactly the pre-0135 shape.
-- It was missing 0135's entire "NEW -- Personal Workspace + property (WP 1.0)" block
-- wholesale -- the workspace.create_personal_workspace() + property.create_property() call,
-- and everything that resolves the six extra identifiers it needs. Confirmed 0135 is
-- genuinely the latest intended definition -- migrations 0168 and 0178 only reference
-- handle_new_user() in prose; neither redefines it.
--
-- Existing accounts were unaffected (6 auth.users, 6 identity.identities, 6 personal
-- workspaces, 6 properties -- exactly 1:1, checked by count only, no content read): every
-- one of them was provisioned before whatever dropped the trigger and reverted the function,
-- almost certainly the same disaster-recovery restore drill this session already found and
-- fixed several other casualties of (missing schema grants, missing default privileges,
-- missing storage bucket policies, a duplicated-membership read leak). A cross-schema
-- trigger on auth.users, defined by a migration but attached to a table Supabase itself
-- owns, sits exactly on the seam a schema-by-schema restore is most likely to lose --
-- outside the twelve application schemas the backup's own schema list was built around, and
-- dependent on a public-schema function whose own extended body a restore reconstructed
-- from an earlier migration state could plausibly revert to. The practical effect: every
-- real signup since has silently received a profile and an identity but no personal
-- workspace and no property -- no error, no signal, the exact "quieter, harder-to-notice"
-- version of the bug a completely missing trigger would have been loud about.
--
-- WHAT THIS MIGRATION DOES, AND WHY IT REDEFINES THE FUNCTION TOO
--
-- The prior checkpoint stopped deliberately at "the function is stale, not just the
-- trigger" -- wiring a fresh trigger to the stale function would have made new signups
-- worse, not better: still no error, still missing a workspace, now silently un-noticed
-- again behind a trigger that looks correct. Restoring 0135's own definition first is the
-- only repair that closes the real gap. The function body below is copied verbatim from
-- 0135_personal_workspace_provisioning.sql lines 171-323 -- unedited, not re-derived, to
-- remove any risk of transcription drift from the one migration that already got this
-- exactly right. 0135 itself is not touched; this is a new, corrective CREATE OR REPLACE,
-- the same pattern this session has already used for 0189/0188 rather than editing a
-- shipped migration.
--
-- on_auth_user_created is then (re)created with DROP TRIGGER IF EXISTS first, so this
-- migration is replayable exactly like every other corrective migration in this
-- repository, and matches 0001_init.sql's own original trigger shape precisely: AFTER
-- INSERT ON auth.users, FOR EACH ROW, EXECUTE FUNCTION public.handle_new_user() -- no
-- WHEN clause, no additional events, nothing 0001 did not already establish.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--
-- No existing row is altered. No backfill runs for the 6 accounts already provisioned
-- before this trigger existed again -- they are already correct, and this function's own
-- guard (`if not exists (... where m.person_ref = v_person_ref and w.type = 'personal' and
-- m.role = 'owner')`) means even a future, deliberate re-invocation for one of them would
-- be a safe no-op, not a duplicate. No production system is touched, linked, or connected
-- to. Ownership, ``SECURITY DEFINER``, and the fixed `search_path` are preserved exactly as
-- 0135 left them -- this migration changes what the function does for the *next* signup,
-- not who it runs as or how it resolves its own schema references.

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
  'Signup trigger: profile, profile_contacts, identity (unchanged since 0027) plus a Personal Workspace, its founding membership, and a property (WP 1.0). Provisioning is exception-wrapped — a race here never fails the signup itself; see 0135''s own header. Restored 2026-08-31 (0190) after a disaster-recovery restore drill reverted this deployed body to its pre-0135 shape while leaving 0135''s own migration marked applied — see that migration''s own header for the full account.';

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
