-- Verifies erasure by redaction (0029_identity_erasure.sql, Epic 02 WP07).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_IDENTITY_ERASURE.sql
--
-- Every check erases a real seeded person and rolls back. Nothing persists — which is the
-- only safe way to test an operation whose entire purpose is to be irreversible.
--
-- ⚠ STAGING ONLY. It erases people. A failed rollback here would be a real erasure.

\set ON_ERROR_STOP on

-- =========================================================================
-- 0 · There is somebody to erase

do $$
declare
  v_live bigint;
begin
  select count(*) into v_live from identity.identities where erased_at is null;
  if v_live = 0 then
    raise exception
      'NOT A TEST: no live identity to erase. Seed the environment (supabase/seed/staging_test_accounts.sql).';
  end if;
  raise notice '0 · % live identity row(s) available', v_live;
end;
$$;

-- =========================================================================
-- 1 · Personal data is gone, everywhere it lived
--
-- The first of the roadmap's three acceptance claims. "Gone" means gone from all three
-- tables that hold it, not only from the identity row — ADR-0023 leaves the two legacy
-- tables in place through this epic, so redacting one of three would be a statement
-- rather than an erasure.

begin;

do $$
declare
  v_ref uuid;
  v_auth uuid;
  v_erased boolean;
  v_leftovers text[] := '{}';
begin
  select person_ref, auth_user_id into v_ref, v_auth
  from identity.identities where erased_at is null and full_name is not null limit 1;

  v_erased := identity.erase_person(v_ref, 'person', 'verify-erasure', 'data subject request');
  if not v_erased then
    raise exception 'erase_person reported nothing to do for a live identity';
  end if;

  if exists (select 1 from identity.identities
             where person_ref = v_ref
               and (full_name is not null or avatar_url is not null or city is not null
                    or email is not null or phone is not null)) then
    v_leftovers := v_leftovers || 'identity.identities'::text;
  end if;

  if exists (select 1 from public.profiles
             where id = v_auth
               and (full_name is not null or avatar_url is not null or city is not null)) then
    v_leftovers := v_leftovers || 'public.profiles'::text;
  end if;

  if exists (select 1 from public.profile_contacts
             where profile_id = v_auth and (email is not null or phone is not null)) then
    v_leftovers := v_leftovers || 'public.profile_contacts'::text;
  end if;

  if array_length(v_leftovers, 1) is not null then
    raise exception 'Personal data survived erasure in: %',
      pg_catalog.array_to_string(v_leftovers, ', ');
  end if;

  raise notice '1 · personal data is gone from all three tables that held it';
end;
$$;

rollback;

-- =========================================================================
-- 2 · The person reference still resolves as a key, and to nothing as a person
--
-- §11.4's exact wording, as two assertions. The row must still be there — anything holding
-- the reference must still find something — and it must yield no display information.

begin;

do $$
declare
  v_ref uuid;
  v_auth uuid;
begin
  select person_ref, auth_user_id into v_ref, v_auth
  from identity.identities where erased_at is null and full_name is not null limit 1;

  perform identity.erase_person(v_ref, 'system', 'verify-erasure', 'retention policy');

  -- Still a key.
  if not exists (select 1 from identity.identities where person_ref = v_ref) then
    raise exception 'The identity row was deleted — the reference no longer resolves as a key';
  end if;
  if (select erased_at from identity.identities where person_ref = v_ref) is null then
    raise exception 'The row was redacted without being marked erased';
  end if;

  -- No longer a person. WP 02.06's resolvers are how every display surface asks.
  if (select count(*) from public.resolve_identity_display(array[v_auth])) <> 0 then
    raise exception 'An erased person still resolves to display information';
  end if;

  raise notice '2 · the reference resolves as a key and to nothing as a person';
end;
$$;

rollback;

-- =========================================================================
-- 3 · Referencing rows are unchanged, and no cascade occurred
--
-- The third claim, and the one the schema makes dangerous: public.profiles is the parent
-- of nine ON DELETE CASCADE foreign keys. An erasure implemented as a delete would take a
-- person's requests, reviews, conversations and both sides of every message with it.

begin;

do $$
declare
  v_ref uuid;
  v_auth uuid;
  v_before jsonb;
  v_after jsonb;
begin
  select person_ref, auth_user_id into v_ref, v_auth
  from identity.identities where erased_at is null and full_name is not null limit 1;

  select jsonb_build_object(
    'profiles', (select count(*) from public.profiles),
    'profile_contacts', (select count(*) from public.profile_contacts),
    'pro_profiles', (select count(*) from public.pro_profiles),
    'pro_services', (select count(*) from public.pro_services),
    'service_requests', (select count(*) from public.service_requests),
    'messages', (select count(*) from public.messages),
    'reviews', (select count(*) from public.reviews),
    'conversations', (select count(*) from public.conversations),
    'household_items', (select count(*) from public.household_items),
    'identities', (select count(*) from identity.identities),
    'auth_users', (select count(*) from auth.users)
  ) into v_before;

  perform identity.erase_person(v_ref, 'person', 'verify-erasure', 'data subject request');

  select jsonb_build_object(
    'profiles', (select count(*) from public.profiles),
    'profile_contacts', (select count(*) from public.profile_contacts),
    'pro_profiles', (select count(*) from public.pro_profiles),
    'pro_services', (select count(*) from public.pro_services),
    'service_requests', (select count(*) from public.service_requests),
    'messages', (select count(*) from public.messages),
    'reviews', (select count(*) from public.reviews),
    'conversations', (select count(*) from public.conversations),
    'household_items', (select count(*) from public.household_items),
    'identities', (select count(*) from identity.identities),
    'auth_users', (select count(*) from auth.users)
  ) into v_after;

  if v_before is distinct from v_after then
    raise exception E'A row disappeared during erasure — a cascade occurred.\n  before: %\n  after:  %',
      v_before, v_after;
  end if;

  raise notice '3 · every row count is unchanged — nothing cascaded, nothing was deleted';
end;
$$;

rollback;

-- =========================================================================
-- 4 · The erasure is audited, and the audit record does not contain the person
--
-- §33 requires an audit record for every erasure. It must not undo the erasure by
-- recording the name it just removed.

begin;

do $$
declare
  v_ref uuid;
  v_name text;
  v_audit platform.audit_records;
begin
  select person_ref, full_name into v_ref, v_name
  from identity.identities where erased_at is null and full_name is not null limit 1;

  perform identity.erase_person(v_ref, 'person', 'operator-42', 'data subject request');

  select * into v_audit from platform.audit_records
  where subject_id = v_ref and action = 'identity.person_erased';

  if v_audit.audit_id is null then
    raise exception 'The erasure was not audited (§33)';
  end if;
  if v_audit.workspace_id is not null then
    raise exception 'The erasure audit is workspace-scoped; erasure is a platform action';
  end if;
  if v_audit.outcome <> 'permitted' or v_audit.authority <> 'data subject request' then
    raise exception 'The audit record lost its outcome or its authority';
  end if;

  -- The record names the reference, never the person.
  if v_audit::text like '%' || v_name || '%' then
    raise exception 'The audit record contains the erased name — erasure undone by its own audit trail';
  end if;

  raise notice '4 · the erasure is audited, platform-scoped, and names nobody';
end;
$$;

rollback;

-- =========================================================================
-- 5 · Erasing twice is a no-op, and refuses to be unattributable
--
-- Erasure is requested under stress and retried by systems under load. The second attempt
-- must not fail and must not claim a second erasure happened.

begin;

do $$
declare
  v_ref uuid;
  v_second boolean;
  v_audits bigint;
  v_refused boolean;
begin
  select person_ref into v_ref
  from identity.identities where erased_at is null and full_name is not null limit 1;

  perform identity.erase_person(v_ref, 'person', 'verify-erasure', 'data subject request');
  v_second := identity.erase_person(v_ref, 'person', 'verify-erasure', 'data subject request');

  if v_second then
    raise exception 'A second erasure reported that it erased something';
  end if;

  select count(*) into v_audits from platform.audit_records
  where subject_id = v_ref and action = 'identity.person_erased';
  if v_audits <> 1 then
    raise exception 'Erasing twice wrote % audit records', v_audits;
  end if;

  -- An erasure nobody is accountable for is not auditable, so it is refused.
  v_refused := false;
  begin
    perform identity.erase_person(v_ref, 'person', '  ', 'data subject request');
  exception when others then v_refused := true;
  end;
  if not v_refused then
    raise exception 'An erasure with no actor was accepted';
  end if;

  raise notice '5 · a repeat erasure is a no-op with no second audit record, and an unattributed one is refused';
end;
$$;

rollback;

-- =========================================================================
-- 6 · Nobody can call it
--
-- Erasure is not exposed to users and has no request flow. The only caller is a database
-- owner acting deliberately.

do $$
declare
  signature text := 'identity.erase_person(uuid, platform.actor_type, text, text)';
  problems text[] := '{}';
  r text;
begin
  foreach r in array array['public', 'anon', 'authenticated', 'service_role',
                           'klussie_engine_identity', 'klussie_operator'] loop
    if pg_catalog.has_function_privilege(r, signature, 'EXECUTE') then
      problems := problems || pg_catalog.format('%s can erase people', r);
    end if;
  end loop;

  if array_length(problems, 1) is not null then
    raise exception 'Erasure is reachable: %', pg_catalog.array_to_string(problems, '; ');
  end if;

  raise notice '6 · no role can execute erase_person';
end;
$$;

-- =========================================================================
-- 7 · Nothing was erased for real

do $$
declare
  v_erased bigint;
begin
  select count(*) into v_erased from identity.identities where erased_at is not null;
  if v_erased > 0 then
    raise exception 'This verification left % person(s) erased', v_erased;
  end if;
  raise notice '7 · no one is erased; every transaction rolled back';
end;
$$;

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_IDENTITY_ERASURE: all checks passed';
end;
$$;
