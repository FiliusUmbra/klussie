-- Corrective migration — closes a real gap in 0234's own backfill, found live
-- immediately after applying it to production, 2026-09-30.
--
-- WHAT 0234 MISSED
--
-- 0234's loop only considered an auth.users row with NO public.profiles row at all
-- (`where p.id is null`) — correct for the 13 accounts orphaned by the September
-- reconciliation, but not the only way an account can be short a Personal Workspace.
-- public.handle_new_user() creates profiles/profile_contacts UNCONDITIONALLY, at the top
-- of the function, outside its own exception handler — only the workspace+property block
-- further down is wrapped in `exception when others then null`. So an account that signed
-- up AFTER 0225 shipped (the migration that made property.create_property() ambiguous,
-- fixed in 0234's own "Fix 1") but BEFORE 0234 dropped the ambiguous overloads got a real
-- profile and identity at signup — the trigger never raised past that point — and then
-- silently lost only its workspace and property when the ambiguity error hit, exactly the
-- failure mode 0234's own header already described. 0234's `where p.id is null` filter
-- skips this account entirely, since it already has a profile.
--
-- THE FIX — CHECK FOR A MISSING PERSONAL WORKSPACE, NOT A MISSING PROFILE
--
-- This migration loops over every auth.users row and, independently:
--   1. Backfills public.profiles/public.profile_contacts if somehow still missing (the
--      same guard 0234 used, kept here so this migration is also correct standalone).
--   2. Backfills identity.identities if somehow still missing (on conflict do nothing,
--      same as handle_new_user() itself).
--   3. Backfills a Personal Workspace + "My Home" property if the resolved person_ref has
--      none yet — the actual gap this migration exists to close, using the SAME
--      workspace.create_personal_workspace()/property.create_property() contracts as
--      0234 and the trigger itself.
--
-- Every step is guarded by its own existence check, so this is a safe superset of 0234's
-- own backfill — running it after 0234, or standalone, or twice, changes nothing for an
-- account that already has all four rows.

do $$
declare
  r record;
  v_person_ref           uuid;
  v_workspace_id         uuid;
  v_membership_id        uuid;
  v_property_id          uuid;
  v_workspace_event_id   uuid;
  v_membership_event_id  uuid;
  v_property_event_id    uuid;
begin
  for r in select u.id, u.email, u.raw_user_meta_data from auth.users u
  loop
    if not exists (select 1 from public.profiles p where p.id = r.id) then
      insert into public.profiles (id, full_name, avatar_url)
      values (r.id, r.raw_user_meta_data ->> 'full_name', r.raw_user_meta_data ->> 'avatar_url');

      insert into public.profile_contacts (profile_id, email)
      values (r.id, r.email);
    end if;

    select i.person_ref into v_person_ref from identity.identities i where i.auth_user_id = r.id;

    if v_person_ref is null then
      v_person_ref := platform.uuid_v7_at(now());

      insert into identity.identities (
        person_ref, auth_user_id, full_name, avatar_url, email, created_at, updated_at
      ) values (
        v_person_ref,
        r.id,
        r.raw_user_meta_data ->> 'full_name',
        r.raw_user_meta_data ->> 'avatar_url',
        r.email,
        now(),
        now()
      )
      on conflict (auth_user_id) do nothing;

      -- A concurrent insert could have won the race between the select above and this
      -- one; re-resolve rather than trust the value this session minted but never wrote.
      select i.person_ref into v_person_ref from identity.identities i where i.auth_user_id = r.id;
    end if;

    if not exists (
      select 1
      from workspace.memberships m
      join workspace.workspaces w on w.id = m.workspace_id
      where m.person_ref = v_person_ref
        and w.type = 'personal'
        and m.role = 'owner'
    ) then
      v_workspace_id := platform.uuid_v7_at(now());
      v_membership_id := platform.uuid_v7_at(now());
      v_property_id := platform.uuid_v7_at(now());
      v_workspace_event_id := platform.uuid_v7_at(now());
      v_membership_event_id := platform.uuid_v7_at(now());
      v_property_event_id := platform.uuid_v7_at(now());

      perform workspace.create_personal_workspace(
        p_workspace_id        => v_workspace_id,
        p_membership_id       => v_membership_id,
        p_person_ref          => v_person_ref,
        p_workspace_event_id  => v_workspace_event_id,
        p_membership_event_id => v_membership_event_id,
        p_correlation_id      => v_workspace_id,
        p_actor_type          => 'person',
        p_actor_ref           => r.id::text
      );

      perform property.create_property(
        p_property_id          => v_property_id,
        p_steward_workspace_id => v_workspace_id,
        p_name                 => 'My Home',
        p_event_id             => v_property_event_id,
        p_correlation_id       => v_workspace_id,
        p_actor_type           => 'person',
        p_actor_ref            => r.id::text
      );
    end if;
  end loop;
end;
$$;
