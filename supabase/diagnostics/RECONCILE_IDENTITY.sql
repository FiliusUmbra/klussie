-- Epic 02 WP05 — reconciles identity.identities against public.profiles.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/RECONCILE_IDENTITY.sql
--
-- Step 4 of the migration pattern (IMPLEMENTATION_ROADMAP.md §3), and a **hard gate**:
-- §8 of that document says "a read-switch without a passing reconciliation is not
-- permitted." WP 02.06 moves profile reads onto the identity row, and this file is the
-- evidence that doing so shows people the same thing they see today.
--
-- READ-ONLY. It writes nothing, not even a temporary table.
--
-- IT REFUSES TO PASS WHEN THERE IS NOTHING TO COMPARE.
--
-- That is the most important behaviour here and the least obvious. An empty database
-- produces zero discrepancies, and zero discrepancies reads like success — so a green run
-- against an environment with no profiles would look exactly like the gate being met while
-- proving nothing at all. Roadmap §13 asks for "zero discrepancies against production
-- data", and no rows is not data. Check 0 fails loudly in that case.
--
-- WHAT COUNTS AS A DISCREPANCY, AND WHAT DOES NOT.
--
-- The gate protects one specific thing: that a read moved from `profiles` to
-- `identities` returns the same answer. So:
--
--   · A profile with no identity FAILS — that person's name would vanish from a screen.
--   · Attributes that disagree FAIL — that person's name would change on a screen.
--   · An identity with no profile is INFORMATIONAL, not a failure. §11.4 requires the auth
--     record and the identity row to be separable, and `profiles` cascade-deletes with
--     `auth.users` while `identities` deliberately does not. An identity outliving its
--     profile is the design working, and nothing reads it.
--   · An erased identity is EXCLUDED from attribute comparison. It holds no personal data
--     by law and by constraint; comparing it to a profile that still has a name would
--     report the erasure as drift.

\set ON_ERROR_STOP on

-- =========================================================================
-- 0 · There is something to compare
--
-- Deliberately first, and deliberately fatal.

do $$
declare
  v_profiles bigint;
  v_identities bigint;
begin
  select count(*) into v_profiles from public.profiles;
  select count(*) into v_identities from identity.identities;

  raise notice '--- reconciling % profile(s) against % identity row(s) ---', v_profiles, v_identities;

  if v_profiles = 0 then
    raise exception
      E'NOT A GATE: this database holds no profiles, so there is nothing to reconcile.\n'
      '  Zero discrepancies over zero rows is not evidence, and WP 02.06 must not treat\n'
      '  this run as a passing reconciliation (IMPLEMENTATION_ROADMAP.md §8).\n'
      '  Seed the environment (docs/operations/ENVIRONMENTS.md §4.4) or run this against\n'
      '  an environment that has real data.';
  end if;
end;
$$;

-- =========================================================================
-- 1 · Every profile has exactly one identity
--
-- The failure that would empty a screen. A profile created between the backfill and the
-- dual-write landing would land here; the fix is re-running the backfill, which WP 02.02
-- proved is a no-op for everything already present.

do $$
declare
  v_missing bigint;
  v_examples text;
begin
  select count(*) into v_missing
  from public.profiles p
  where not exists (select 1 from identity.identities i where i.auth_user_id = p.id);

  if v_missing > 0 then
    select string_agg(p.id::text, ', ') into v_examples
    from (
      select id from public.profiles p2
      where not exists (select 1 from identity.identities i where i.auth_user_id = p2.id)
      limit 10
    ) p;

    raise exception
      E'DISCREPANCY: % profile(s) have no identity row.\n  First up to 10: %\n'
      '  Re-run supabase/migrations/0026_identity_backfill.sql — it is idempotent.',
      v_missing, v_examples;
  end if;

  raise notice '1 · every profile has an identity';
end;
$$;

-- =========================================================================
-- 2 · No auth user has two identities
--
-- The unique constraint on auth_user_id makes this impossible, which is exactly why it is
-- worth asserting: a gate that only checks what can plausibly break is a gate that stops
-- noticing when the constraint is dropped.

do $$
declare
  v_dupes bigint;
begin
  select count(*) into v_dupes from (
    select auth_user_id from identity.identities
    where auth_user_id is not null
    group by auth_user_id having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise exception 'DISCREPANCY: % auth user(s) have more than one identity', v_dupes;
  end if;

  raise notice '2 · no auth user has more than one identity';
end;
$$;

-- =========================================================================
-- 3 · Attributes agree
--
-- The six fields WP 02.06 will read. `is distinct from` throughout, so a null on one side
-- and a value on the other is caught rather than silently comparing as unknown — which is
-- the mistake that makes a reconciliation pass while the data disagrees.
--
-- Erased identities are excluded: they hold no personal data by construction, and
-- comparing them would report lawful erasure as drift.

do $$
declare
  v_mismatched bigint;
  v_detail text;
begin
  with drift as (
    select p.id,
           p.full_name    as profile_name,   i.full_name  as identity_name,
           p.avatar_url   as profile_avatar, i.avatar_url as identity_avatar,
           p.city         as profile_city,   i.city       as identity_city,
           p.locale       as profile_locale, i.locale     as identity_locale,
           c.email        as profile_email,  i.email      as identity_email,
           c.phone        as profile_phone,  i.phone      as identity_phone
    from public.profiles p
    join identity.identities i on i.auth_user_id = p.id
    left join public.profile_contacts c on c.profile_id = p.id
    where i.erased_at is null
      and (
        p.full_name  is distinct from i.full_name
        or p.avatar_url is distinct from i.avatar_url
        or p.city       is distinct from i.city
        or p.locale     is distinct from i.locale
        or c.email      is distinct from i.email
        or c.phone      is distinct from i.phone
      )
  )
  select count(*), string_agg(
    format('%s: name %L/%L city %L/%L locale %L/%L email %L/%L',
           id, profile_name, identity_name, profile_city, identity_city,
           profile_locale, identity_locale, profile_email, identity_email),
    E'\n    ')
  into v_mismatched, v_detail
  from (select * from drift limit 10) d;

  if v_mismatched > 0 then
    raise exception
      E'DISCREPANCY: % identity row(s) disagree with their profile (profile/identity).\n    %',
      v_mismatched, v_detail;
  end if;

  raise notice '3 · every live identity agrees with its profile on all six attributes';
end;
$$;

-- =========================================================================
-- 4 · Every person reference is a well-formed, unique UUIDv7
--
-- §3 chose v7 for index locality and §8 makes the identifier permanent. A v4 that slipped
-- in through the dual-write's metadata channel would satisfy every other check here.

do $$
declare
  v_bad bigint;
  v_dupes bigint;
begin
  select count(*) into v_bad from identity.identities
  where person_ref is null or substr(person_ref::text, 15, 1) <> '7';

  if v_bad > 0 then
    raise exception 'DISCREPANCY: % person reference(s) are missing or are not UUIDv7', v_bad;
  end if;

  select count(*) into v_dupes from (
    select person_ref from identity.identities group by person_ref having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise exception 'DISCREPANCY: % person reference(s) are shared by more than one identity', v_dupes;
  end if;

  raise notice '4 · every person reference is a distinct, well-formed UUIDv7';
end;
$$;

-- =========================================================================
-- 5 · Creation times were preserved
--
-- ADR-0022 mints backfilled references from the profile's own creation time, and the
-- backfill copies that time onto the identity. If these disagree, the identifier's embedded
-- timestamp is a fiction and ordering by it no longer means what it says.

do $$
declare
  v_drifted bigint;
begin
  select count(*) into v_drifted
  from public.profiles p
  join identity.identities i on i.auth_user_id = p.id
  where i.created_at is distinct from p.created_at;

  if v_drifted > 0 then
    raise exception 'DISCREPANCY: % identity row(s) do not carry their profile''s creation time', v_drifted;
  end if;

  raise notice '5 · every identity carries its profile''s creation time';
end;
$$;

-- =========================================================================
-- 6 · Informational — identities with no profile
--
-- Not a failure. §11.4: "losing authentication is not losing identity." `profiles`
-- cascade-deletes with `auth.users`; `identities` does not, on purpose. Reported so the
-- number is known rather than discovered later.

do $$
declare
  v_orphans bigint;
begin
  select count(*) into v_orphans
  from identity.identities i
  where i.auth_user_id is not null
    and not exists (select 1 from public.profiles p where p.id = i.auth_user_id);

  if v_orphans > 0 then
    raise notice
      '6 · % identity row(s) have no profile. Expected where an auth user was deleted (§11.4); nothing reads them.',
      v_orphans;
  else
    raise notice '6 · every identity still has its profile';
  end if;
end;
$$;

-- =========================================================================

do $$
declare
  v_compared bigint;
begin
  select count(*) into v_compared
  from public.profiles p join identity.identities i on i.auth_user_id = p.id;

  raise notice 'RECONCILE_IDENTITY: PASSED over % compared row(s) — WP 02.06 is unblocked for this environment', v_compared;
end;
$$;
