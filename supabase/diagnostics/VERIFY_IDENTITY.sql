-- Verifies identity.identities after 0025_identity.sql.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_IDENTITY.sql
--
-- Checks 3 and 4 write rows and roll them back. Nothing here persists.
--
-- Check 2 is the one that matters most and the one that will keep mattering: it asserts
-- that nothing anywhere foreign-keys to this table. That is a whole-database check rather
-- than a check on this migration, because the rule it enforces is broken by some *other*
-- table's migration, months from now, by someone adding a reference that looks perfectly
-- ordinary.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · The table exists, holds personal data, and links to auth without a cascade
--
-- §11.4: "Deleting an auth user must never cascade. The auth record and the identity row
-- are separable, and losing authentication is not losing identity."

do $$
declare
  expected text[] := array[
    'person_ref', 'auth_user_id', 'full_name', 'avatar_url', 'city', 'email', 'phone',
    'locale', 'created_at', 'updated_at', 'erased_at'
  ];
  actual text[];
  missing text[];
  extra text[];
  problems text[] := '{}';
begin
  select array_agg(attname order by attnum) into actual
  from pg_catalog.pg_attribute
  where attrelid = 'identity.identities'::regclass and attnum > 0 and not attisdropped;

  select array_agg(e) into missing from unnest(expected) e where not e = any(actual);
  select array_agg(a) into extra from unnest(actual) a where not a = any(expected);

  if missing is not null or extra is not null then
    raise exception 'Identity shape mismatch. Missing: %. Unexpected: %', missing, extra;
  end if;

  -- No foreign key OUT of this table into auth either. The link is a plain column.
  if exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'identity.identities'::regclass and contype = 'f'
  ) then
    problems := problems || 'identity.identities declares a foreign key'::text;
  end if;

  -- person_ref must have no default: identifiers are application-generated (§3), and a
  -- default would quietly become the way rows are made.
  if exists (
    select 1 from pg_catalog.pg_attribute a
    join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = 'identity.identities'::regclass and a.attname = 'person_ref'
  ) then
    problems := problems || 'person_ref has a database default — identifiers are application-generated'::text;
  end if;

  if array_length(problems, 1) is not null then
    raise exception '%', pg_catalog.array_to_string(problems, '; ');
  end if;

  raise notice '1 · eleven columns, no foreign key, no generated identifier';
end;
$$;

-- =========================================================================
-- 2 · Nothing in the database foreign-keys to identity
--
-- §5, stated as a rule with a consequence: "The person reference must survive erasure of
-- the identity row. A foreign key would make erasure impossible or cascade destruction
-- into history." §11.4 repeats it as one of "two rules this imposes on every migration".
--
-- Checked across every schema, because the migration that breaks this will not be this one.

do $$
declare
  offenders text[];
begin
  select array_agg(
    pg_catalog.format('%s.%s.%s', n.nspname, c.relname, con.conname)
  ) into offenders
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where con.contype = 'f'
    and con.confrelid = 'identity.identities'::regclass;

  if offenders is not null then
    raise exception
      'A table foreign-keys to identity, which makes erasure impossible or destructive (SUPABASE_ARCHITECTURE.md §5): %',
      pg_catalog.array_to_string(offenders, '; ');
  end if;

  raise notice '2 · no table anywhere references identity.identities';
end;
$$;

-- =========================================================================
-- 3 · An identity can be written and changed, and cannot be removed
--
-- §8: an identity is "ended only by erasure, never by inactivity", and §11.4 makes erasure
-- a redaction. No role is given DELETE, so there is no correct way for a row to leave.

begin;

do $$
declare
  problems text[] := '{}';
  r text;
begin
  insert into identity.identities (person_ref, auth_user_id, full_name, locale)
  values ('01920000-0000-7000-8000-00000000d001', '01920000-0000-7000-8000-00000000d0ff',
          'Probe Person', 'nl');

  update identity.identities set city = 'Brussels', updated_at = now()
  where person_ref = '01920000-0000-7000-8000-00000000d001';

  if not exists (
    select 1 from identity.identities
    where person_ref = '01920000-0000-7000-8000-00000000d001' and city = 'Brussels'
  ) then
    problems := problems || 'an identity attribute could not be changed'::text;
  end if;

  -- Mutable, per §8 and ROLES.md §3 rule 2 — the exception to this platform's
  -- append-only default, opted into by name.
  if not pg_catalog.has_table_privilege('klussie_engine_identity', 'identity.identities', 'UPDATE') then
    problems := problems || 'the identity engine cannot change an attribute'::text;
  end if;

  foreach r in array array[
    'klussie_engine_identity', 'klussie_engine_workspace', 'klussie_operator',
    'anon', 'authenticated', 'service_role'
  ] loop
    if pg_catalog.has_table_privilege(r, 'identity.identities', 'DELETE') then
      problems := problems || pg_catalog.format('%s can DELETE an identity', r);
    end if;
  end loop;

  -- No client role reaches this table yet; the read path is WP 02.06's decision.
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if pg_catalog.has_table_privilege(r, 'identity.identities', 'SELECT') then
      problems := problems || pg_catalog.format('%s can read identities', r);
    end if;
  end loop;

  -- Another engine has no business here. §5: cross-schema references are one-directional,
  -- and identity is the root everything else sits above.
  if pg_catalog.has_table_privilege('klussie_engine_work', 'identity.identities', 'SELECT') then
    problems := problems || 'the work engine can read identities directly'::text;
  end if;

  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'identity.identities'::regclass) then
    problems := problems || 'row level security is not enabled'::text;
  end if;

  if array_length(problems, 1) is not null then
    raise exception 'Identity access wrong: %', pg_catalog.array_to_string(problems, '; ');
  end if;

  raise notice '3 · writable and updatable by its engine, deletable by nobody, unreadable by clients';
end;
$$;

rollback;

-- =========================================================================
-- 4 · The constraints refuse what they are meant to refuse
--
-- The erasure constraint is the one worth having. An erasure that left a field behind is
-- unlawful rather than merely wrong, and nothing about the row would look unusual.

begin;

do $$
declare
  accepted text[] := '{}';
begin
  -- An erased identity that still holds personal data.
  begin
    insert into identity.identities (person_ref, full_name, erased_at)
    values ('01920000-0000-7000-8000-00000000d002', 'Still Here', now());
    accepted := accepted || 'an erased identity that kept its name'::text;
  exception when check_violation then null;
  end;

  begin
    insert into identity.identities (person_ref, email, erased_at)
    values ('01920000-0000-7000-8000-00000000d003', 'still@here.example', now());
    accepted := accepted || 'an erased identity that kept its email'::text;
  exception when check_violation then null;
  end;

  -- A locale the application cannot render.
  begin
    insert into identity.identities (person_ref, locale)
    values ('01920000-0000-7000-8000-00000000d004', 'xx');
    accepted := accepted || 'an unsupported locale'::text;
  exception when check_violation then null;
  end;

  -- Two identities sharing one auth user: "who is signed in" would have two answers.
  insert into identity.identities (person_ref, auth_user_id)
  values ('01920000-0000-7000-8000-00000000d005', '01920000-0000-7000-8000-00000000d0aa');
  begin
    insert into identity.identities (person_ref, auth_user_id)
    values ('01920000-0000-7000-8000-00000000d006', '01920000-0000-7000-8000-00000000d0aa');
    accepted := accepted || 'two identities sharing one auth user'::text;
  exception when unique_violation then null;
  end;

  -- An identity with no reference at all.
  begin
    insert into identity.identities (person_ref) values (null);
    accepted := accepted || 'an identity with no person reference'::text;
  exception when not_null_violation then null;
  end;

  if array_length(accepted, 1) is not null then
    raise exception 'identity.identities accepted: %', pg_catalog.array_to_string(accepted, '; ');
  end if;

  raise notice '4 · incomplete erasures, bad locales, shared auth users and missing references are all refused';
end;
$$;

rollback;

-- =========================================================================
-- 5 · An identity with no auth user is legal
--
-- Not a formality. §11.4 makes the auth record and the identity row separable, and §6.1's
-- direction of travel is federated identity and provider migration. A NOT NULL here would
-- mean losing authentication is losing identity, which is the thing the design refuses.

begin;

do $$
begin
  insert into identity.identities (person_ref, full_name)
  values ('01920000-0000-7000-8000-00000000d007', 'No Auth Record');

  raise notice '5 · an identity without an auth user is accepted — losing authentication is not losing identity';
end;
$$;

rollback;

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_IDENTITY: all checks passed';
end;
$$;
