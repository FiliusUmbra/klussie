-- Verifies 0132_operations_workspace.sql (Platform Activation Slice 0, WP 0.3;
-- ADR-0030): exactly one workspace holds platform_operations, it is never referenced by
-- any customer-facing preset or plan, and workspace.workspace_has_capability() —
-- WP 0.4's own audit-read function composes this directly — resolves it correctly.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_OPERATIONS_WORKSPACE.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_count        integer;
  v_workspace_id uuid;
begin
  -- =========================================================================
  -- 1 · Exactly one workspace holds platform_operations, and it is type='business'
  -- (ADR-0030: the closest existing preset, not a new check-constraint value)

  select count(*) into v_count
  from workspace.capability_grants g
  where g.capability_key = 'platform_operations' and g.withdrawn_at is null;

  if v_count <> 1 then
    raise exception '1a · expected exactly one live grant of platform_operations, found %', v_count;
  end if;

  select g.workspace_id into v_workspace_id
  from workspace.capability_grants g
  where g.capability_key = 'platform_operations' and g.withdrawn_at is null;

  if not exists (
    select 1 from workspace.workspaces w where w.id = v_workspace_id and w.type = 'business'
  ) then
    raise exception '1b · the workspace holding platform_operations is not type=business';
  end if;
  raise notice '1 · exactly one workspace holds platform_operations, and it is type=business';

  -- =========================================================================
  -- 2 · workspace.workspace_has_capability() — the composed check WP 0.4 will use —
  -- resolves it correctly, both directions

  if not workspace.workspace_has_capability(v_workspace_id, 'platform_operations') then
    raise exception '2a · workspace_has_capability() returns false for the workspace that actually holds it';
  end if;
  if workspace.workspace_has_capability(gen_random_uuid(), 'platform_operations') then
    raise exception '2b · workspace_has_capability() returned true for a workspace id that cannot hold anything';
  end if;
  raise notice '2 · workspace_has_capability() resolves platform_operations correctly in both directions';

  -- =========================================================================
  -- 3 · platform_operations is never referenced by any customer-facing preset or plan —
  -- ADR-0030's own stated invariant ("never granted to any customer-facing plan or
  -- preset"), checked directly rather than trusted

  if exists (
    select 1 from platform.capability_preset_grants where capability_key = 'platform_operations'
  ) then
    raise exception '3a · platform_operations appears in a workspace preset — it must never be sellable';
  end if;

  if exists (
    select 1 from platform.plans where capability_keys @> '["platform_operations"]'::jsonb
  ) then
    raise exception '3b · platform_operations appears in a subscription plan — it must never be sellable';
  end if;
  raise notice '3 · platform_operations is held only by the Operations Workspace, never sold';

  -- =========================================================================
  -- 4 · No membership exists yet — WP 0.3 deliberately seeds no founding membership row
  -- (this migration's own header); a real membership is a separate, per-environment step

  select count(*) into v_count
  from workspace.memberships where workspace_id = v_workspace_id;

  if v_count <> 0 then
    raise notice '4 · % membership row(s) already present — the per-environment operator seed step has run; not a defect', v_count;
  else
    raise notice '4 · no membership yet — expected until the per-environment operator seed step runs';
  end if;

  raise notice 'VERIFY_OPERATIONS_WORKSPACE: all checks passed';
end;
$$;

rollback;
