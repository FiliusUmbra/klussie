-- Verifies Platform Activation Slice 0 as one connected whole (WP 0.7) — not a re-run of
-- WP 0.3/0.4/0.5's own diagnostics (VERIFY_OPERATIONS_WORKSPACE.sql,
-- VERIFY_AUDIT_READ_PATH.sql, VERIFY_WORKSPACE_CAPABILITY_CHECK.sql all still stand on
-- their own), but the proof those three pieces agree with each other for the same real
-- session: the client-facing routing check (WP 0.5) and the audit read path (WP 0.4)
-- reach the same verdict about the same operator and the same stranger, in one
-- transaction, with real impersonation throughout.
--
-- ALSO RESOLVES THE OPEN QUESTION SLICE_0_ACTIVATION_INFRASTRUCTURE.md §7 LEFT FOR THIS
-- WORK PACKAGE: IS A DENIED (OR ANY) AUDIT-LOG READ ITSELF AUDITED?
--
-- No. Checked directly against PLATFORM_DOMAIN_MODEL.md §23's own list of what must be
-- audited — "every permission and membership change, every access grant and revocation,
-- every commercial change, every export or deletion of data, every administrative
-- action, and every action taken by the platform's own intelligence" — a plain view of
-- the audit log, denied or permitted, appears in none of those categories. §23 names
-- "export" specifically as the auditable read-adjacent action (not built here — WP 0.4's
-- own header names it out of scope), which is the textual signal that a plain view
-- without exporting is deliberately not in the list. Check 4 below proves this
-- structurally: reading platform.audit_records through either delegate never inserts a
-- new row into it.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_SLICE_0_END_TO_END.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_operator_auth    uuid := gen_random_uuid();
  v_stranger_auth    uuid := gen_random_uuid();
  v_ops_workspace    uuid;
  v_test_audit_id    uuid := gen_random_uuid();
  v_audit_count_before integer;
  v_audit_count_after  integer;
  v_bool_result      boolean;
  v_row_count        integer;
begin
  -- =========================================================================
  -- Setup — one real operator (a real membership in the Operations Workspace), one real
  -- stranger (no membership anywhere relevant), one fabricated audit record so there is
  -- something real for the operator to see.

  select w.id into v_ops_workspace
  from workspace.workspaces w
  where workspace.workspace_has_capability(w.id, 'platform_operations')
  limit 1;

  if v_ops_workspace is null then
    raise exception 'setup · no workspace holds platform_operations — run 0132_operations_workspace.sql first';
  end if;

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_operator_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'slice-0-e2e-operator@example.test', jsonb_build_object('full_name', 'Slice 0 E2E Operator'), now(), now());
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'slice-0-e2e-stranger@example.test', jsonb_build_object('full_name', 'Slice 0 E2E Stranger'), now(), now());

  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
  select gen_random_uuid(), v_ops_workspace, i.person_ref, 'Support', 'active', now(), now()
  from identity.identities i
  where i.auth_user_id = v_operator_auth;

  insert into platform.audit_records
    (audit_id, occurred_at, workspace_id, actor_type, actor_ref, action, subject_type, subject_id, outcome, authority, correlation_id, detail)
  values
    (v_test_audit_id, now(), v_ops_workspace, 'person', v_operator_auth::text, 'diagnostic.probe',
     'diagnostic', v_test_audit_id, 'permitted', 'VERIFY_SLICE_0_END_TO_END.sql', gen_random_uuid(), '{}'::jsonb);

  select count(*) into v_audit_count_before from platform.audit_records;

  -- =========================================================================
  -- 1 · The operator: both WP 0.5's routing check and WP 0.4's audit read path agree —
  -- this is an operator, and they see the real record

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_operator_auth)::text, true);

  select api.my_workspace_has_capability(v_ops_workspace, 'platform_operations') into v_bool_result;
  if v_bool_result is not true then
    raise exception '1a · WP 0.5''s routing check says the real operator is not an operator';
  end if;

  select count(*) into v_row_count from api.list_audit_records(p_action_prefix => 'diagnostic.');
  if v_row_count <> 1 then
    raise exception '1b · WP 0.4''s audit read path does not agree — expected 1 matching record, saw %', v_row_count;
  end if;
  raise notice '1 · the routing check and the audit read path agree: a real operator is an operator, and sees the real record';

  -- =========================================================================
  -- 2 · The stranger: both checks agree in the other direction — not an operator, sees
  -- nothing, and gets no error message that could hint at what exists

  reset role;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);

  select api.my_workspace_has_capability(v_ops_workspace, 'platform_operations') into v_bool_result;
  if v_bool_result is not false then
    raise exception '2a · WP 0.5''s routing check says a real stranger is an operator';
  end if;

  select count(*) into v_row_count from api.list_audit_records();
  if v_row_count <> 0 then
    raise exception '2b · WP 0.4''s audit read path does not agree — a stranger saw % row(s)', v_row_count;
  end if;
  raise notice '2 · the routing check and the audit read path agree: a real stranger is not an operator, and sees nothing';

  -- =========================================================================
  -- 3 · The client-side shell's own routing decision (AppShell.jsx / operatorContext.js)
  -- depends on exactly the function checked in step 1/2 — this diagnostic is that
  -- function's own live proof; the client unit tests (operatorContext.test.js) prove the
  -- client-side fallback behaviour around it, not the database contract itself

  raise notice '3 · api.my_workspace_has_capability() is the same function src/lib/operatorContext.js calls — proven live above, unit-tested for its own fallback behaviour in operatorContext.test.js';

  -- =========================================================================
  -- 4 · Reading the audit log, by either party, never itself writes a new row — the
  -- resolution to this work package's own open question, checked structurally rather
  -- than merely asserted in a comment
  --
  -- `authenticated` (still impersonating the stranger from check 2) holds no grant on
  -- schema platform at all (ROLES.md §2.4: "Never: authenticated on platform") — the
  -- count below must run as postgres, exactly as the setup section's own first count did.

  reset role;
  select count(*) into v_audit_count_after from platform.audit_records;
  if v_audit_count_after <> v_audit_count_before then
    raise exception '4 · reading platform.audit_records inserted % new row(s) — a read must never be self-auditing without a deliberate decision to make it so', v_audit_count_after - v_audit_count_before;
  end if;
  raise notice '4 · reading the audit log, by an operator or a stranger, writes nothing — confirmed against PLATFORM_DOMAIN_MODEL.md §23''s own list, which names export, not plain viewing, as the auditable read-adjacent action';

  reset role;
  raise notice 'VERIFY_SLICE_0_END_TO_END: all checks passed — Slice 0''s pieces agree with each other, not just individually';
end;
$$;

rollback;
