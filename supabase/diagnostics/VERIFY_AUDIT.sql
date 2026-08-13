-- Verifies platform.audit_records after 0022_audit.sql.
--
-- Run with psql and ON_ERROR_STOP; each check raises an exception naming what is wrong:
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_AUDIT.sql
--
-- Checks 4 and 5 write rows and roll them back. Nothing here persists.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · The record shape, and the one nullable column that is deliberate
--
-- ADR-0021 makes workspace_id nullable so that platform-scoped actions have a home —
-- DATABASE_ARCHITECTURE.md §23 pushed workspace-less facts out of platform.events and
-- into audit on purpose. Every other identifying column stays NOT NULL, because a null
-- there would be an omission rather than a scope.

do $$
declare
  expected text[] := array[
    'audit_id', 'occurred_at', 'workspace_id', 'actor_type', 'actor_ref', 'action',
    'subject_type', 'subject_id', 'outcome', 'authority', 'correlation_id', 'detail'
  ];
  actual text[];
  missing text[];
  extra text[];
begin
  select array_agg(attname order by attnum) into actual
  from pg_attribute
  where attrelid = 'platform.audit_records'::regclass and attnum > 0 and not attisdropped;

  select array_agg(e) into missing from unnest(expected) e where not e = any(actual);
  select array_agg(a) into extra from unnest(actual) a where not a = any(expected);

  if missing is not null or extra is not null then
    raise exception 'Audit record shape mismatch. Missing: %. Unexpected: %', missing, extra;
  end if;

  if exists (
    select 1 from pg_attribute
    where attrelid = 'platform.audit_records'::regclass
      and attname in ('audit_id', 'occurred_at', 'actor_type', 'actor_ref', 'action', 'outcome')
      and not attnotnull
  ) then
    raise exception 'A column that must be NOT NULL is nullable';
  end if;

  if (select attnotnull from pg_attribute
      where attrelid = 'platform.audit_records'::regclass and attname = 'workspace_id') then
    raise exception 'workspace_id is NOT NULL — platform-scoped actions have nowhere to go (ADR-0021)';
  end if;

  raise notice '1 · twelve columns, workspace_id nullable by decision, the rest not';
end;
$$;

-- =========================================================================
-- 2 · Range-partitioned by time, and not by anything else
--
-- §19 gives audit range-by-time only. Hash-partitioning by a nullable workspace would
-- gather every platform-scoped record into a single partition.

do $$
declare
  strategy "char";
  leaves integer;
begin
  select partstrat into strategy
  from pg_partitioned_table where partrelid = 'platform.audit_records'::regclass;

  if strategy is null then
    raise exception 'platform.audit_records is not partitioned';
  end if;
  if strategy <> 'r' then
    raise exception 'platform.audit_records is partitioned by strategy %, expected range', strategy;
  end if;

  select count(*) into leaves
  from pg_inherits where inhparent = 'platform.audit_records'::regclass;

  if leaves < 3 then
    raise exception 'Expected at least 3 partitions (2026, 2027, default), found %', leaves;
  end if;

  raise notice '2 · range-partitioned by time, % partitions', leaves;
end;
$$;

-- =========================================================================
-- 3 · Writable by no application role; readable by the operator
--
-- §8, the sentence this table exists to satisfy: "writable by no application role at
-- all." That includes the engine that owns the schema — 0019's default privileges would
-- have granted it INSERT, and 0022 takes it back.

do $$
declare
  problems text[] := '{}';
  r text;
begin
  foreach r in array array[
    'anon', 'authenticated', 'service_role', 'klussie_engine_platform',
    'klussie_operator', 'klussie_consumer_delivery', 'klussie_consumer_projection'
  ] loop
    if has_table_privilege(r, 'platform.audit_records', 'INSERT') then
      problems := problems || format('%s can write the audit trail', r);
    end if;
    if has_table_privilege(r, 'platform.audit_records', 'UPDATE') then
      problems := problems || format('%s can UPDATE the audit trail', r);
    end if;
    if has_table_privilege(r, 'platform.audit_records', 'DELETE') then
      problems := problems || format('%s can DELETE from the audit trail', r);
    end if;
  end loop;

  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(r, 'platform.audit_records', 'SELECT') then
      problems := problems || format('%s can read the audit trail', r);
    end if;
  end loop;

  if not has_table_privilege('klussie_operator', 'platform.audit_records', 'SELECT') then
    problems := problems || 'the operator cannot read the audit trail';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'platform.audit_records'::regclass) then
    problems := problems || 'row level security is not enabled';
  end if;

  -- Unlike platform.events, this table must HAVE a policy: events are not client-readable
  -- at all (§12); audit is readable by administrators (§8).
  if not exists (
    select 1 from pg_policies
    where schemaname = 'platform' and tablename = 'audit_records'
      and policyname = 'audit_records_operator_read'
  ) then
    problems := problems || 'the operator read policy is missing';
  end if;

  if array_length(problems, 1) is not null then
    raise exception 'Audit access posture wrong: %', array_to_string(problems, '; ');
  end if;

  raise notice '3 · writable by nobody, readable by the operator, RLS on with its policy';
end;
$$;

-- =========================================================================
-- 4 · Both scopes are accepted, and neither can then be changed
--
-- The behaviour ADR-0021 decided, exercised rather than inferred: a workspace-scoped
-- record and a platform-scoped one land in the same table, and both resist mutation.

begin;

insert into platform.audit_records (
  audit_id, occurred_at, workspace_id, actor_type, actor_ref, action,
  subject_type, subject_id, outcome, authority, correlation_id, detail
) values
  ('01920000-0000-7000-8000-00000000a001', '2026-06-15 12:00:00+00',
   '01920000-0000-7000-8000-00000000a0ff', 'person', 'probe-person', 'workspace.membership_granted',
   'membership', '01920000-0000-7000-8000-00000000a0aa', 'permitted', 'owner',
   '01920000-0000-7000-8000-00000000a0cc', '{"probe": true}'::jsonb),
  -- Platform-scoped: no workspace. This is the row that has nowhere to live under the
  -- rejected two-table reading of §33.
  ('01920000-0000-7000-8000-00000000a002', '2026-06-15 12:00:01+00',
   null, 'system', 'probe-system', 'platform.catalogue_changed',
   'catalogue', null, 'permitted', 'operator',
   '01920000-0000-7000-8000-00000000a0cc', '{"probe": true}'::jsonb),
  -- A refusal. No domain event exists for this, which is why audit is not derived.
  ('01920000-0000-7000-8000-00000000a003', '2026-06-15 12:00:02+00',
   '01920000-0000-7000-8000-00000000a0ff', 'intelligence', 'probe-ai', 'property.access_attempted',
   'property', '01920000-0000-7000-8000-00000000a0bb', 'denied', 'none',
   '01920000-0000-7000-8000-00000000a0cc', '{"probe": true}'::jsonb);

do $$
declare
  landed_in text;
  scoped bigint;
  platform_scoped bigint;
  denied bigint;
  mutation_allowed boolean := false;
begin
  select c.relname into landed_in
  from platform.audit_records a
  join pg_class c on c.oid = a.tableoid
  where a.audit_id = '01920000-0000-7000-8000-00000000a001';

  if landed_in <> 'audit_records_2026' then
    raise exception 'Audit record landed in %, not the 2026 range partition', landed_in;
  end if;

  -- The query ADR-0021 exists to keep as one query: everything one actor did, across both
  -- scopes, without a union.
  select count(*) filter (where workspace_id is not null),
         count(*) filter (where workspace_id is null),
         count(*) filter (where outcome = 'denied')
    into scoped, platform_scoped, denied
  from platform.audit_records
  where correlation_id = '01920000-0000-7000-8000-00000000a0cc';

  if scoped <> 2 or platform_scoped <> 1 or denied <> 1 then
    raise exception
      'One correlated trace should hold 2 workspace-scoped, 1 platform-scoped, 1 denied; got %, %, %',
      scoped, platform_scoped, denied;
  end if;

  begin
    update platform.audit_records set outcome = 'permitted'
    where audit_id = '01920000-0000-7000-8000-00000000a003';
    mutation_allowed := true;
  exception when others then null;
  end;
  if mutation_allowed then
    raise exception 'A denied attempt was rewritten as permitted — the guard did not fire';
  end if;

  mutation_allowed := false;
  begin
    delete from platform.audit_records where audit_id = '01920000-0000-7000-8000-00000000a003';
    mutation_allowed := true;
  exception when others then null;
  end;
  if mutation_allowed then
    raise exception 'An audit record was deleted — the guard did not fire';
  end if;

  raise notice '4 · both scopes land in %, a denied attempt is recorded, neither can be changed', landed_in;
end;
$$;

rollback;

-- =========================================================================
-- 5 · The constraints refuse what they are meant to refuse

begin;

do $$
declare
  accepted text[] := '{}';
begin
  -- A malformed action. Audit is read by people and by export tooling; an unstructured
  -- action string makes both guess.
  begin
    insert into platform.audit_records (
      audit_id, occurred_at, actor_type, actor_ref, action, subject_type, outcome
    ) values (
      gen_random_uuid(), now(), 'system', 'probe', 'NotAValidAction', 'probe', 'permitted'
    );
    accepted := accepted || 'a malformed action';
  exception when check_violation then null;
  end;

  -- An anonymous audit record. "Who did what" is not answerable without the who.
  begin
    insert into platform.audit_records (
      audit_id, occurred_at, actor_type, actor_ref, action, subject_type, outcome
    ) values (
      gen_random_uuid(), now(), 'system', '   ', 'platform.probed', 'probe', 'permitted'
    );
    accepted := accepted || 'a blank actor_ref';
  exception when check_violation then null;
  end;

  -- An outcome outside the enum. The set is closed so that "was it denied" is answerable
  -- without interpretation.
  begin
    insert into platform.audit_records (
      audit_id, occurred_at, actor_type, actor_ref, action, subject_type, outcome
    ) values (
      gen_random_uuid(), now(), 'system', 'probe', 'platform.probed', 'probe', 'maybe'
    );
    accepted := accepted || 'an outcome outside the enum';
  exception when invalid_text_representation then null;
  end;

  -- No outcome at all. A record that does not say whether the action succeeded is not an
  -- audit record.
  begin
    insert into platform.audit_records (
      audit_id, occurred_at, actor_type, actor_ref, action, subject_type, outcome
    ) values (
      gen_random_uuid(), now(), 'system', 'probe', 'platform.probed', 'probe', null
    );
    accepted := accepted || 'a record with no outcome';
  exception when not_null_violation then null;
  end;

  if array_length(accepted, 1) is not null then
    raise exception 'The audit trail accepted: %', array_to_string(accepted, '; ');
  end if;

  raise notice '5 · malformed actions, anonymous actors and unknown outcomes are all refused';
end;
$$;

rollback;

-- =========================================================================
-- 6 · The default partition is empty, and this year and next have ranges
--
-- Ongoing operational checks, same as VERIFY_EVENTS.sql: a populated default means a
-- range was missing when the record was written.

do $$
declare
  n bigint;
  y integer := extract(year from now())::integer;
  gaps text[] := '{}';
  target integer;
begin
  select count(*) into n from platform.audit_records_default;
  if n > 0 then
    raise exception
      'Audit records landed in the default partition — a time range was missing: % row(s)', n;
  end if;

  foreach target in array array[y, y + 1] loop
    if not exists (
      select 1 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
      where ns.nspname = 'platform' and c.relname = format('audit_records_%s', target)
    ) then
      gaps := gaps || target::text;
    end if;
  end loop;

  if array_length(gaps, 1) is not null then
    raise exception 'No audit range partition for: %', array_to_string(gaps, ', ');
  end if;

  raise notice '6 · default partition empty; % and % both have ranges', y, y + 1;
end;
$$;

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_AUDIT: all checks passed';
end;
$$;
