-- Verifies the read path created by 0028_identity_read_path.sql (Epic 02 WP06).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_IDENTITY_READ_PATH.sql
--
-- Step 5 is the only step that changes behaviour, and the standard it is held to is that a
-- user cannot tell. So check 1 compares the two sources value by value: if they ever
-- disagree, somebody's name is about to change on screen.
--
-- Checks 2 to 5 are the permission boundary ADR-0023 exists to hold. They are the reason
-- the switch went through resolvers instead of a policy on the table.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · The two sources agree, for every person
--
-- Not a sample. If this passes, moving the read cannot change what anyone sees.

do $$
declare
  v_disagree bigint;
  v_detail text;
begin
  select count(*), pg_catalog.string_agg(id::text, ', ')
  into v_disagree, v_detail
  from (
    select p.id
    from public.profiles p
    join identity.identities i on i.auth_user_id = p.id
    where i.erased_at is null
      and (p.full_name is distinct from i.full_name
        or p.avatar_url is distinct from i.avatar_url
        or p.city is distinct from i.city
        or p.locale is distinct from i.locale)
    limit 10
  ) d;

  if v_disagree > 0 then
    raise exception
      'READ SWITCH UNSAFE: % person(s) would render differently from the new source: %',
      v_disagree, v_detail;
  end if;

  raise notice '1 · every person renders identically from either source';
end;
$$;

-- =========================================================================
-- 2 · The display resolver cannot return a contact channel
--
-- The return type is the security boundary, not a policy and not a convention. A future
-- contributor widening this signature is making a privacy decision.

do $$
declare
  v_columns text[];
begin
  -- A `returns table (...)` function has `record` as its return type; the output columns
  -- live in proargnames/proargmodes, where mode 't' is a TABLE column. Reading them off a
  -- composite type finds nothing, which is a silent pass rather than a failure — the first
  -- version of this check did exactly that.
  select pg_catalog.array_agg(arg.name order by arg.ord) into v_columns
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join lateral unnest(p.proargnames, p.proargmodes) with ordinality as arg(name, mode, ord)
  where n.nspname = 'public'
    and p.proname = 'resolve_identity_display'
    and arg.mode = 't';

  if v_columns is distinct from array['auth_user_id', 'full_name', 'avatar_url'] then
    raise exception
      'The display resolver returns %, which is not exactly (auth_user_id, full_name, avatar_url)',
      v_columns;
  end if;

  raise notice '2 · the display resolver returns name and avatar and nothing else';
end;
$$;

-- =========================================================================
-- 3 · Anonymous callers reach neither resolver
--
-- Supabase ships default privileges in `public` granting EXECUTE on new functions to
-- `anon` BY NAME, so `revoke ... from public` leaves that grant in place. Both of these
-- were callable by anonymous visitors until the explicit revokes were added, and this is
-- the check that keeps it that way.

do $$
declare
  problems text[] := '{}';
  r text;
  f text;
begin
  foreach r in array array['anon', 'public', 'service_role'] loop
    foreach f in array array[
      'public.current_identity()',
      'public.resolve_identity_display(uuid[])'
    ] loop
      if pg_catalog.has_function_privilege(r, f, 'EXECUTE') then
        problems := problems || pg_catalog.format('%s can execute %s', r, f);
      end if;
    end loop;
  end loop;

  foreach f in array array[
    'public.current_identity()',
    'public.resolve_identity_display(uuid[])'
  ] loop
    if not pg_catalog.has_function_privilege('authenticated', f, 'EXECUTE') then
      problems := problems || pg_catalog.format('authenticated cannot execute %s', f);
    end if;
  end loop;

  if array_length(problems, 1) is not null then
    raise exception 'Read-path access wrong: %', pg_catalog.array_to_string(problems, '; ');
  end if;

  raise notice '3 · only authenticated reaches the resolvers';
end;
$$;

-- =========================================================================
-- 4 · The identity table itself stays off the client API surface
--
-- ADR-0023 expected to pay for this with an own-row policy; using resolvers meant it did
-- not have to. `identity` is as unreachable from a client as `platform` is.

do $$
declare
  problems text[] := '{}';
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if pg_catalog.has_schema_privilege(r, 'identity', 'USAGE') then
      problems := problems || pg_catalog.format('%s has USAGE on schema identity', r);
    end if;
    if pg_catalog.has_table_privilege(r, 'identity.identities', 'SELECT') then
      problems := problems || pg_catalog.format('%s can select identity.identities', r);
    end if;
  end loop;

  if array_length(problems, 1) is not null then
    raise exception 'The identity schema is exposed to clients: %',
      pg_catalog.array_to_string(problems, '; ');
  end if;

  raise notice '4 · no client role can reach identity.identities directly';
end;
$$;

-- =========================================================================
-- 5 · An erased person resolves to nothing
--
-- §11.4: the reference "remains valid as a key and resolves to nothing". Written and
-- rolled back, so no real row is erased.

begin;

do $$
declare
  v_target uuid;
  v_rows bigint;
begin
  select auth_user_id into v_target from identity.identities
  where erased_at is null and auth_user_id is not null limit 1;

  if v_target is null then
    raise notice '5 · skipped — no live identity to erase in this environment';
    return;
  end if;

  update identity.identities
  set full_name = null, avatar_url = null, city = null, email = null, phone = null,
      erased_at = now()
  where auth_user_id = v_target;

  select count(*) into v_rows from public.resolve_identity_display(array[v_target]);
  if v_rows <> 0 then
    raise exception 'An erased person still resolves to display information';
  end if;

  select count(*) into v_rows from public.current_identity();
  raise notice '5 · an erased person resolves to nothing';
end;
$$;

rollback;

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_IDENTITY_READ_PATH: all checks passed';
end;
$$;
