-- Verifies the backfill in 0026_identity_backfill.sql.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_IDENTITY_BACKFILL.sql
--
-- WHY THIS FILE CREATES ITS OWN DATA.
--
-- Staging holds **no profiles** — the test accounts ENVIRONMENTS.md §4.4 calls for were
-- never seeded. Against an empty table "every profile has an identity" is true and proves
-- nothing, and a backfill is the one kind of package where that gap matters most: roadmap
-- §3 makes it the step whose failure mode is data rather than a revertable read path.
--
-- So checks 3 to 6 build a representative population inside a transaction, run the real
-- backfill statement against it, assert the outcome, and roll the whole thing back. That
-- is strictly stronger than counting zero against zero, and it leaves nothing behind.
--
-- Foreign-key triggers are suspended for those checks because `public.profiles` references
-- `auth.users`, and creating synthetic auth users to test a mapping would be testing
-- Supabase rather than the migration.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · Every real profile has an identity
--
-- The acceptance criterion, against whatever this environment actually holds. It is also
-- the check that will catch a profile created between the backfill running and the
-- dual-write landing in WP 02.04.

do $$
declare
  v_profiles bigint;
  v_identities bigint;
  v_unbackfilled bigint;
begin
  select count(*) into v_profiles from public.profiles;
  select count(*) into v_identities from identity.identities;

  select count(*) into v_unbackfilled
  from public.profiles p
  where not exists (select 1 from identity.identities i where i.auth_user_id = p.id);

  if v_unbackfilled > 0 then
    raise exception '% profile(s) have no identity row', v_unbackfilled;
  end if;

  if v_profiles = 0 then
    raise notice
      '1 · every profile has an identity (% profiles, % identities) — NOTE: this environment has no profiles, so checks 3-6 carry the real proof',
      v_profiles, v_identities;
  else
    raise notice '1 · every profile has an identity (% profiles, % identities)', v_profiles, v_identities;
  end if;
end;
$$;

-- =========================================================================
-- 2 · The minter exists and no application role can call it
--
-- ADR-0022: §3 keeps runtime identifier generation in the application, and the grant is
-- what keeps that true rather than advisory. PostgreSQL grants EXECUTE on a new function
-- to PUBLIC; if that were left in place, any engine could mint identifiers in the database.

do $$
declare
  signature text := 'platform.uuid_v7_at(timestamptz)';
  problems text[] := '{}';
  r text;
begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'platform' and p.proname = 'uuid_v7_at'
  ) then
    raise exception 'platform.uuid_v7_at is missing';
  end if;

  foreach r in array array[
    'public', 'anon', 'authenticated', 'service_role',
    'klussie_engine_identity', 'klussie_engine_workspace', 'klussie_operator'
  ] loop
    if pg_catalog.has_function_privilege(r, signature, 'EXECUTE') then
      problems := problems || pg_catalog.format('%s can mint identifiers in the database', r);
    end if;
  end loop;

  -- No no-argument form: a runtime caller would have to write uuid_v7_at(now()), which
  -- reads as the mistake it would be.
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'platform' and p.proname = 'uuid_v7_at' and p.pronargs = 0
  ) then
    problems := problems || 'a no-argument uuid_v7_at() exists'::text;
  end if;

  if array_length(problems, 1) is not null then
    raise exception 'Minter access wrong: %', pg_catalog.array_to_string(problems, '; ');
  end if;

  raise notice '2 · the minter exists, takes a timestamp, and is executable by no application role';
end;
$$;

-- =========================================================================
-- 3 · The minter produces real UUIDv7s that encode the time they were given
--
-- The property ADR-0022 chose `created_at` for: a backfilled reference sorts where it
-- would have sorted had it been generated when the row was created.

do $$
declare
  v_old uuid := platform.uuid_v7_at('2024-03-01 10:00:00+00');
  v_new uuid := platform.uuid_v7_at('2026-08-13 12:00:00+00');
  v_decoded timestamptz;
begin
  if pg_catalog.substr(v_old::text, 15, 1) <> '7' then
    raise exception 'Version nibble is %, expected 7', pg_catalog.substr(v_old::text, 15, 1);
  end if;

  if pg_catalog.substr(v_old::text, 20, 1) not in ('8', '9', 'a', 'b') then
    raise exception 'Variant nibble is %, expected 8-b', pg_catalog.substr(v_old::text, 20, 1);
  end if;

  v_decoded := pg_catalog.to_timestamp(
    ('x' || pg_catalog.replace(pg_catalog.substr(v_old::text, 1, 13), '-', ''))::bit(48)::bigint / 1000.0
  );
  if v_decoded <> '2024-03-01 10:00:00+00'::timestamptz then
    raise exception 'Embedded timestamp decoded to %, expected the value passed in', v_decoded;
  end if;

  if not (v_old < v_new) then
    raise exception 'Identifiers are not time-ordered — the index locality §3 chose v7 for is lost';
  end if;

  raise notice '3 · version 7, correct variant, timestamp decodes exactly, and ordering follows time';
end;
$$;

-- =========================================================================
-- 4 · The backfill maps a real population correctly
--
-- Synthetic profiles, the real backfill statement, then assertions — all rolled back.

begin;

set local session_replication_role = replica;

insert into public.profiles (id, full_name, avatar_url, city, locale, created_at) values
  ('01920000-0000-4000-8000-00000000b001', 'Cathy Customer', 'https://example/a.png', 'Brussels', 'nl', '2024-03-01 10:00:00+00'),
  ('01920000-0000-4000-8000-00000000b002', 'Pierre Pro',     null,                    'Liège',    'fr', '2025-06-15 09:30:00+00'),
  -- No contact row, no name, no city: an ordinary sparse profile, not a reason to skip it.
  ('01920000-0000-4000-8000-00000000b003', null,             null,                    null,       'ar', '2026-01-20 18:45:00+00');

insert into public.profile_contacts (profile_id, email, phone) values
  ('01920000-0000-4000-8000-00000000b001', 'cathy@example.test', '+32470000001'),
  ('01920000-0000-4000-8000-00000000b002', 'pierre@example.test', null);

insert into identity.identities (
  person_ref, auth_user_id, full_name, avatar_url, city, email, phone, locale,
  created_at, updated_at
)
select
  platform.uuid_v7_at(p.created_at), p.id, p.full_name, p.avatar_url, p.city,
  c.email, c.phone, p.locale, p.created_at, now()
from public.profiles p
left join public.profile_contacts c on c.profile_id = p.id
where not exists (select 1 from identity.identities i where i.auth_user_id = p.id);

do $$
declare
  v_row identity.identities;
  v_sparse identity.identities;
  v_count bigint;
begin
  select count(*) into v_count from identity.identities;
  if v_count <> 3 then
    raise exception 'Expected 3 identities after backfilling 3 profiles, found %', v_count;
  end if;

  select * into v_row from identity.identities
  where auth_user_id = '01920000-0000-4000-8000-00000000b001';

  if v_row.full_name <> 'Cathy Customer'
     or v_row.city <> 'Brussels'
     or v_row.locale <> 'nl'
     or v_row.avatar_url <> 'https://example/a.png' then
    raise exception 'Personal attributes did not carry across correctly';
  end if;

  -- Contact details move onto the identity row: §11.4 makes it the only identity-scoped
  -- aggregate holding personal data, and §8 counts contact channels among its attributes.
  if v_row.email <> 'cathy@example.test' or v_row.phone <> '+32470000001' then
    raise exception 'Contact details from profile_contacts did not carry across';
  end if;

  -- Real creation time, not the moment the migration ran.
  if v_row.created_at <> '2024-03-01 10:00:00+00'::timestamptz then
    raise exception 'created_at was defaulted rather than preserved: %', v_row.created_at;
  end if;

  -- The person reference is NEW, not the auth user id. Reusing that id would derive the
  -- platform's permanent identity from a replaceable authentication adapter (ADR-0022).
  if v_row.person_ref = v_row.auth_user_id then
    raise exception 'The person reference is the auth user id — identity is coupled to authentication';
  end if;
  if pg_catalog.substr(v_row.person_ref::text, 15, 1) <> '7' then
    raise exception 'A backfilled person reference is not a UUIDv7';
  end if;

  -- A profile with nothing but a locale still gets an identity.
  select * into v_sparse from identity.identities
  where auth_user_id = '01920000-0000-4000-8000-00000000b003';
  if v_sparse.person_ref is null then
    raise exception 'A sparse profile was skipped';
  end if;
  if v_sparse.email is not null or v_sparse.full_name is not null then
    raise exception 'A profile with no contact row invented one';
  end if;

  -- Backfilled references sort by the profile's age, which is the whole reason ADR-0022
  -- passes created_at rather than now().
  if not (
    (select person_ref from identity.identities where auth_user_id = '01920000-0000-4000-8000-00000000b001')
    < (select person_ref from identity.identities where auth_user_id = '01920000-0000-4000-8000-00000000b003')
  ) then
    raise exception 'Backfilled references are not ordered by the profile creation time they encode';
  end if;

  raise notice '4 · three profiles mapped: attributes, contacts, real created_at, fresh v7 references, sparse rows included';
end;
$$;

-- =========================================================================
-- 5 · Re-running the backfill is a no-op
--
-- Roadmap §3: "a backfill that can only be run once is a backfill that cannot be trusted."
-- Re-running must insert nothing AND must not re-mint the references already issued —
-- those are permanent (§8) and anything that stored one would be left pointing at nothing.

do $$
declare
  v_before uuid[];
  v_after uuid[];
  v_count_before bigint;
  v_count_after bigint;
begin
  select count(*), array_agg(person_ref order by created_at)
    into v_count_before, v_before from identity.identities;

  insert into identity.identities (
    person_ref, auth_user_id, full_name, avatar_url, city, email, phone, locale,
    created_at, updated_at
  )
  select
    platform.uuid_v7_at(p.created_at), p.id, p.full_name, p.avatar_url, p.city,
    c.email, c.phone, p.locale, p.created_at, now()
  from public.profiles p
  left join public.profile_contacts c on c.profile_id = p.id
  where not exists (select 1 from identity.identities i where i.auth_user_id = p.id);

  select count(*), array_agg(person_ref order by created_at)
    into v_count_after, v_after from identity.identities;

  if v_count_after <> v_count_before then
    raise exception 'Re-running inserted % extra row(s)', v_count_after - v_count_before;
  end if;
  if v_before is distinct from v_after then
    raise exception 'Re-running re-minted person references — anything holding one now points at nothing';
  end if;

  raise notice '5 · re-running inserted nothing and re-minted nothing';
end;
$$;

-- =========================================================================
-- 6 · A profile added after the backfill is picked up by a re-run
--
-- The gap between this package and the dual-write in WP 02.04: until that lands, a new
-- signup has no identity until someone re-runs the backfill. Proving the re-run catches it
-- is what makes that gap survivable rather than permanent.

do $$
declare
  v_count bigint;
begin
  insert into public.profiles (id, full_name, locale, created_at)
  values ('01920000-0000-4000-8000-00000000b004', 'Later Signup', 'en', now());

  insert into identity.identities (
    person_ref, auth_user_id, full_name, avatar_url, city, email, phone, locale,
    created_at, updated_at
  )
  select
    platform.uuid_v7_at(p.created_at), p.id, p.full_name, p.avatar_url, p.city,
    c.email, c.phone, p.locale, p.created_at, now()
  from public.profiles p
  left join public.profile_contacts c on c.profile_id = p.id
  where not exists (select 1 from identity.identities i where i.auth_user_id = p.id);

  select count(*) into v_count from identity.identities;
  if v_count <> 4 then
    raise exception 'A profile created after the backfill was not picked up by a re-run (% identities)', v_count;
  end if;

  raise notice '6 · a profile created after the backfill is picked up by re-running it';
end;
$$;

rollback;

-- =========================================================================
-- 7 · Nothing was left behind
--
-- The transaction above is rolled back, so this environment must look exactly as it did.

do $$
declare
  v_synthetic bigint;
begin
  select count(*) into v_synthetic from identity.identities
  where auth_user_id::text like '01920000-0000-4000-8000-00000000b%';

  if v_synthetic > 0 then
    raise exception 'The verification left % synthetic identity row(s) behind', v_synthetic;
  end if;

  raise notice '7 · no synthetic rows remain';
end;
$$;

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_IDENTITY_BACKFILL: all checks passed';
end;
$$;
