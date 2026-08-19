-- Platform Activation Programme — the Initial Platform Operator bootstrap, per the
-- Programme's own explicit instruction: "Design a bootstrap mechanism that allows
-- development environments to seed the first Platform Operator... Development may seed
-- [an email] through configuration or seed data. The production application must remain
-- environment independent."
--
-- WHAT PROBLEM THIS CLOSES
--
-- 0132's own header is explicit that it deliberately seeds no membership: "a specific
-- person's membership is per-environment operational data, not structure... deliberately
-- left to a separate, per-environment seed step." That step has never existed. As of
-- this migration, nobody, in any environment, has ever held a real membership in the
-- Operations Workspace — every operator tool built in Slice 0/WP 1.1a
-- (OperatorApp.jsx, AuditLog.jsx, WorkspaceLookup.jsx) is unreachable in practice, not
-- because of a bug, but because the one deliberately-deferred piece was never built.
-- This migration builds it.
--
-- WHY A FUNCTION, NOT A DIRECT INSERT LIKE 0033/0132 — THE FIRST BACKFILL THAT CANNOT BE
-- SHAPED LIKE ITS OWN PRECEDENTS
--
-- Every prior backfill in this roadmap (0033, 0034, 0089, 0132's own capability grant)
-- inserts unconditionally, for every qualifying row, in the migration itself, because the
-- data it acts on is either universal (every identity gets a Personal Workspace) or
-- singular and structural (there is exactly one Operations Workspace, ever). Granting
-- Operator access is neither: it must name exactly one specific person, and that person
-- differs, or is absent entirely, in every environment this migration runs in — staging
-- has one, a fresh local database has none yet, and a future production database must
-- get one without this file ever having named who. A migration's own body must produce
-- an identical structural result in every environment (0132's own words); a specific
-- person's grant is exactly the per-environment operational data 0132 already drew this
-- line around. So this migration ships the TOOL — a reusable, parameterised function —
-- and grants nobody anything. Who actually gets called through it is a separate,
-- per-environment step, exactly like supabase/seed/staging_test_accounts.sql already is.
--
-- WHY LOOKUP IS BY EMAIL AGAINST identity.identities, NOT auth.users
--
-- identity.identities.email (0025) is this platform's own identity layer, the one every
-- other operator-facing read already resolves through (workspace.current_memberships()
-- joins person_ref, never auth_user_id, per 0031's own header). Resolving here the same
-- way keeps this function honest about which layer owns "who is this person" — and
-- means it works unchanged even for the federated-identity future 0025's own header
-- names, where a person's auth_user_id may not be their only way to sign in.
--
-- WHY THE TARGET MUST ALREADY HAVE SIGNED UP — NO IDENTITY IS MINTED HERE
--
-- Granting operator access to an email nobody has ever signed up with would create a
-- membership with no real person able to reach it — the same reasoning 0033 excludes
-- erased identities for. The correct operational sequence is: the real person signs up
-- through the application normally, exactly like anyone else (getting their own Personal
-- Workspace, per 0033), and only then is this function run once against their now-real
-- identity. They end up with two real memberships — their own Personal Workspace and,
-- now, the Operations Workspace — which is not a special case; PLATFORM_DOMAIN_MODEL.md's
-- own membership model has always allowed a person to belong to more than one workspace.
-- They move between "being a customer" and "being an operator" the same way any person
-- with two memberships already does: by switching which workspace they act as.
--
-- WHY THIS IS NOT AN api.* CONTRACT — NO SELF-PROMOTION PATH, EVER
--
-- Every other write contract this Slice has built (0139-0143) exists specifically so an
-- authenticated caller can reach it, gated by a real membership check on the resource
-- they are already writing to. Operator access has no such caller-side check that means
-- anything: anyone who could satisfy "is already a member of the Operations Workspace"
-- already has operator access, so a self-service grant path would be a caller granting
-- access to themselves. This function is granted to no application role at all —
-- SECURITY INVOKER, revoked from public/anon/authenticated/service_role — matching
-- platform.uuid_v7_at()'s own posture (ADR-0022: "executable by no application role,
-- only the migration runner"). It is reachable only the way 0033's backfill logic is
-- reachable: direct execution against the database by whoever is already trusted to run
-- migrations and seeds, never through the application.
--
-- IDEMPOTENT, MATCHING EVERY BACKFILL IN THIS ROADMAP
--
-- Re-running with the same email, once the membership already exists, changes nothing —
-- reported, not silently swallowed, so a re-run's own output stays honest about what it
-- did.
--
-- NO membership_history ROW — 0033's OWN PRECEDENT, NOT 0132's
--
-- 0030's own header: "nothing writes to `memberships` yet, so there is nothing to
-- [backfill into history]" at the time membership_history was built, and 0033's own
-- backfill — the only other place workspace.memberships has ever been seeded outside the
-- live application — inserts the membership alone. This function is the same kind of
-- operation as 0033's, not 0132's capability-grant (which pairs with
-- capability_grant_history because that pairing already existed for the live write path
-- workspace.grant_capability() protects); memberships has no analogous live write path
-- yet for this function to mirror.

create or replace function platform.bootstrap_operator(p_email text)
returns void
language plpgsql
security invoker
as $$
declare
  v_person_ref uuid;
  v_operations_workspace_id uuid;
begin
  select i.person_ref into v_person_ref
  from identity.identities i
  where i.email = p_email
    and i.erased_at is null;

  if v_person_ref is null then
    raise exception
      'No active identity found for email %. The person must sign up through the '
      'application first — this function grants operator access to an existing '
      'identity, it does not create one.', p_email;
  end if;

  select w.id into v_operations_workspace_id
  from workspace.workspaces w
  join workspace.capability_grants g on g.workspace_id = w.id
  where g.capability_key = 'platform_operations'
    and g.withdrawn_at is null
  order by w.created_at
  limit 1;

  if v_operations_workspace_id is null then
    raise exception
      'No workspace holds the platform_operations capability. Has migration 0132 '
      'been applied to this database?';
  end if;

  if exists (
    select 1 from workspace.memberships m
    where m.workspace_id = v_operations_workspace_id
      and m.person_ref = v_person_ref
      and m.state = 'active'
  ) then
    raise notice
      '% already holds an active membership in the Operations Workspace — nothing to do.',
      p_email;
    return;
  end if;

  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
  values (platform.uuid_v7_at(now()), v_operations_workspace_id, v_person_ref, 'owner', 'active', now(), now());

  raise notice
    'Granted % (person_ref %) an active owner membership in the Operations Workspace.',
    p_email, v_person_ref;
end;
$$;

comment on function platform.bootstrap_operator(text) is
  'Grants Platform Operator access — an active membership in the one workspace holding platform_operations — to the existing identity matching the given email. Structural tool, no per-environment data of its own (see this migration''s own header). Executable by no application role; run directly, per environment, the same way supabase/seed/staging_test_accounts.sql already is.';

revoke all on function platform.bootstrap_operator(text) from public, anon, authenticated, service_role;
