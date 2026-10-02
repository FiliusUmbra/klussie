-- Corrective migration, two related fixes found together applying this migration to
-- staging, 2026-09-30.
--
-- =========================================================================
-- FIX 1 · property.create_property() HAS BEEN AMBIGUOUS SINCE 0225 — A LIVE REGRESSION
--
-- 0225 ("property_kind_and_multi_property") added a trailing `p_kind text default 'home'`
-- parameter to property.create_property()/property.create_property_for_caller()/
-- api.create_property() via `create or replace function`. That does NOT replace a
-- function whose parameter list differs — Postgres created a second, distinct overload
-- of each instead, leaving the original 7-parameter version in place alongside the new
-- 8-parameter one. Any caller that omits p_kind (a plain 7-argument call, which both
-- overloads can satisfy — the second via its own default) is therefore ambiguous:
-- `function property.create_property(...) is not unique` (SQLSTATE 42725).
--
-- public.handle_new_user() — the live signup trigger (on_auth_user_created, restored by
-- 0190) — calls property.create_property() with exactly 7 named arguments. Every real
-- signup on production since 0225 was applied has therefore been hitting this exact
-- error inside the trigger. It never surfaced as a visible failure because 0190's own
-- workspace/property block is deliberately wrapped in `exception when others then null`
-- (a provisioning race must never fail the signup itself, per that migration's own
-- header) — so the account still gets a profile and an identity, silently loses its
-- Personal Workspace and property, and nothing anywhere logs it. The quieter,
-- harder-to-notice failure mode 0190's own header already named, recurring for a new
-- reason.
--
-- Fixed here by dropping the three stale 7-parameter overloads outright, outermost first
-- (api.create_property, then create_property_for_caller, then create_property) so only
-- the p_kind-aware versions remain. No real caller is affected: the client
-- (homeInventory.js's createPropertyForCaller()) always passes p_kind explicitly, and
-- 0225's own new bodies thread p_kind between themselves already — the 7-parameter
-- overloads were never intentionally reachable, only an accidental side effect of an
-- additive `create or replace` that wasn't. handle_new_user() itself needs no change:
-- once only one candidate function exists, its existing 7-argument call resolves
-- cleanly and uses the new parameter's own default ('home'), exactly as 0225 intended.
drop function if exists api.create_property(uuid, uuid, text, uuid, uuid, platform.actor_type, text);
drop function if exists property.create_property_for_caller(uuid, uuid, text, uuid, uuid, platform.actor_type, text);
drop function if exists property.create_property(uuid, uuid, text, uuid, uuid, platform.actor_type, text);

-- =========================================================================
-- FIX 2 · re-provisions every auth.users row left without a profile, identity, personal
-- workspace, or property after the 2026-09-13/14 production reconciliation (that reset
-- every application schema and replayed 0001-0224; auth.users itself lives in Supabase's
-- own auth schema and was never touched, so 13 real accounts kept their login but lost
-- every row public.handle_new_user() would normally have given them at signup).
--
-- FOUND LIVE, 2026-09-30 — not a code defect, a data one
--
-- A customer on production hit "Couldn't save this property" and a raw foreign-key
-- error from /api/ai-intake ("Key is not present in table 'profiles'"). Read-only queries
-- against production (run by the account holder, in the Supabase SQL editor, never by
-- this migration) confirmed the scope: 13 auth.users rows, 0 rows in public.profiles,
-- identity.identities, workspace.memberships, or property.properties. The signup trigger
-- itself (on_auth_user_created, restored by 0190 after an earlier, similar incident) is
-- present and enabled on production right now — Fix 1 above is what actually lets it do
-- its job again for anyone new; this fix is only for the 13 rows that predate it.
--
-- NO BACKUP RESTORE WAS AVAILABLE, SO THIS IS NOT A DATA RECOVERY
--
-- The original workspace/property/item/request content these 13 people had, if any, is
-- gone — there was nothing left in any application schema to recover it from, and the
-- account holder confirmed no usable backup predates the reset. This migration gives each
-- affected auth.users row exactly what a brand-new signup gets today (0190's own
-- handle_new_user() body, applied retroactively, row by row) — a fresh profile, identity,
-- Personal Workspace and "My Home" property — not their old data back. `full_name`,
-- `avatar_url` and `email` are still pulled from auth.users itself (untouched by the
-- reset), so at least identity/display info survives exactly as it would have.
--
-- WHY A LOOP OVER auth.users, NOT A TRIGGER RE-FIRE
--
-- Postgres triggers only fire on the statement that touches the row; there is no
-- supported way to "replay" an AFTER INSERT trigger for rows that already exist. The loop
-- below calls the exact same three contracts handle_new_user() calls — insert profiles,
-- insert profile_contacts, insert identity.identities, then
-- workspace.create_personal_workspace()/property.create_property() guarded by the same
-- "no personal workspace yet" check that function already uses — so this is the same
-- provisioning, not a parallel reimplementation of it.
--
-- IDEMPOTENT, LIKE EVERY OTHER CORRECTIVE MIGRATION IN THIS REPOSITORY
--
-- The loop only ever considers an auth.users row with no public.profiles row yet, and the
-- workspace/property block keeps handle_new_user()'s own "already has one" guard. Running
-- this twice, or against a database where the trigger has been working correctly all
-- along, is a safe no-op.

do $$
declare
  r record;
  v_person_ref          uuid;
  v_workspace_id         uuid;
  v_membership_id        uuid;
  v_property_id          uuid;
  v_workspace_event_id   uuid;
  v_membership_event_id  uuid;
  v_property_event_id    uuid;
begin
  for r in
    select u.id, u.email, u.raw_user_meta_data
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
  loop
    insert into public.profiles (id, full_name, avatar_url)
    values (r.id, r.raw_user_meta_data ->> 'full_name', r.raw_user_meta_data ->> 'avatar_url');

    insert into public.profile_contacts (profile_id, email)
    values (r.id, r.email);

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
