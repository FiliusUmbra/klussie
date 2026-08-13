-- Staging test accounts — the seed `docs/operations/ENVIRONMENTS.md` §4.4 has always
-- called for and that has never existed.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<staging-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/seed/staging_test_accounts.sql
--
-- ⚠ STAGING ONLY. This writes real, sign-in-capable accounts into `auth.users`. Running it
-- against production would create accounts in front of real users. Check the project ref in
-- your connection string before running it; production is a different ref entirely, and
-- `.env.local` on this machine points at production rather than staging.
--
-- WHY THIS EXISTS.
--
-- WP 02.05 built the reconciliation that gates the read switch, and discovered it had
-- nothing to stand on: staging held zero profiles, so "zero discrepancies" was true and
-- worthless. Roadmap §8 does not permit a read-switch without a passing reconciliation, so
-- Epic 02 was blocked on an empty database rather than on code. Every later backfill —
-- including Epic 03's workspace backfill, the risk register's highest-severity item —
-- would have inherited the same gap.
--
-- WHAT IT CREATES, AND WHY EACH ONE.
--
-- Not "two accounts" for the sake of the checklist. Each row exists to make some part of
-- the reconciliation capable of failing:
--
--   customer   — the ordinary case: every attribute populated.
--   pro        — a professional with a pro profile and an offered service, per §4.4.
--   sparse     — no name, no city, no phone. Nulls on one side of a comparison are how a
--                null-unsafe reconciliation passes over real drift; without a row like
--                this, that bug would be untestable here.
--   external   — no `person_ref` in its metadata, so the trigger mints one. Represents a
--                Supabase-dashboard or OAuth signup, which is the path WP 02.04's
--                fallback exists for.
--
-- The other three carry a `person_ref`, as an application signup does — the application
-- generates it with `src/lib/ids.ts` and passes it through the signup metadata.
--
-- **These are fixtures, not real people.** `ENVIRONMENTS.md` §6: staging is
-- lower-assurance and must never hold real personal data. The password below is shared,
-- deliberately well-known, and grants access to nothing but these four accounts on a
-- database that contains no real data.
--
-- IDEMPOTENT. Re-running inserts nothing and changes nothing. It does not repair an
-- account that has been edited — this seeds, it does not reconcile.

\set ON_ERROR_STOP on

-- =========================================================================
-- GUARD
--
-- The one mistake this file could make is being run against the wrong database, and the
-- cost of that is real accounts appearing in front of real users. Production has 17
-- migrations and no `identity` schema; every environment this seed belongs in has been
-- through Epic 01 and 02. That is a cheap, honest signal to check.

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_namespace where nspname = 'identity'
  ) then
    raise exception
      E'REFUSING TO SEED: this database has no `identity` schema, so it has not had Epic 01\n'
      '  and 02 applied. That strongly suggests it is production. Check the project ref in\n'
      '  your connection string (docs/operations/ENVIRONMENTS.md §3).';
  end if;
end;
$$;

-- =========================================================================
-- ACCOUNTS
--
-- `email_confirmed_at` is set, or GoTrue treats the account as pending and refuses the
-- sign-in these accounts exist to allow. The `auth.identities` row is what GoTrue looks up
-- for an email login; without it the password is never reached.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  v.id::uuid,
  'authenticated',
  'authenticated',
  v.email,
  extensions.crypt('klussie-staging', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  v.meta::jsonb,
  v.created_at::timestamptz,
  now(),
  '', '', '', ''
from (values
  ('11111111-1111-4111-8111-000000000001', 'customer@staging.klussie.test',
   '{"full_name":"Cathy Customer","person_ref":"01907e00-0000-7000-8000-00000000c001"}',
   '2025-03-04 09:12:00+00'),
  ('11111111-1111-4111-8111-000000000002', 'pro@staging.klussie.test',
   '{"full_name":"Pierre Pro","person_ref":"01917e00-0000-7000-8000-00000000c002"}',
   '2025-07-19 14:40:00+00'),
  ('11111111-1111-4111-8111-000000000003', 'sparse@staging.klussie.test',
   '{"person_ref":"01927e00-0000-7000-8000-00000000c003"}',
   '2026-01-08 07:05:00+00'),
  -- No person_ref: the trigger mints one, as it does for a dashboard or OAuth signup.
  ('11111111-1111-4111-8111-000000000004', 'external@staging.klussie.test',
   '{"full_name":"Otto External"}',
   '2026-05-22 18:30:00+00')
) as v(id, email, meta, created_at)
where not exists (select 1 from auth.users u where u.id = v.id::uuid);

-- The identity GoTrue resolves an email login through.
insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
select
  u.id, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', u.id::text, null, u.created_at, now()
from auth.users u
where u.email like '%@staging.klussie.test'
  and not exists (
    select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
  );

-- =========================================================================
-- PROFILE DETAIL
--
-- `handle_new_user()` created each profile with the name from the metadata. The rest is
-- what a person fills in afterwards — and doing it as an UPDATE means it travels through
-- the WP 02.04 mirror, so these rows exercise the dual-write rather than bypassing it.

update public.profiles set city = 'Brussels', locale = 'nl'
where id = '11111111-1111-4111-8111-000000000001' and city is distinct from 'Brussels';

update public.profiles set city = 'Liège', locale = 'fr'
where id = '11111111-1111-4111-8111-000000000002' and city is distinct from 'Liège';

-- Left sparse on purpose: no city, no name. See the header.
update public.profiles set locale = 'ar'
where id = '11111111-1111-4111-8111-000000000003' and locale is distinct from 'ar';

update public.profiles set city = 'Antwerp', locale = 'en'
where id = '11111111-1111-4111-8111-000000000004' and city is distinct from 'Antwerp';

-- Phone numbers are not written by the signup trigger, so they are set here on the two
-- accounts that have them — giving the reconciliation a populated and an empty case.
update public.profile_contacts set phone = '+32470000001'
where profile_id = '11111111-1111-4111-8111-000000000001' and phone is null;

update public.profile_contacts set phone = '+32470000002'
where profile_id = '11111111-1111-4111-8111-000000000002' and phone is null;

-- The identity mirror only carries the four profile attributes; phone lives in
-- profile_contacts, which nothing updates in the application. Bringing the identity into
-- step here keeps the reconciliation honest about what it is comparing.
update identity.identities i
set phone = c.phone, updated_at = now()
from public.profile_contacts c
where c.profile_id = i.auth_user_id
  and i.phone is distinct from c.phone
  and i.erased_at is null;

-- =========================================================================
-- THE PROFESSIONAL
--
-- §4.4: "A professional account with a pro profile and at least one offered service."

insert into public.pro_profiles (profile_id, pro_type, bio)
select '11111111-1111-4111-8111-000000000002', 'flexi',
       'Staging test professional. Painting and small repairs.'
where not exists (
  select 1 from public.pro_profiles where profile_id = '11111111-1111-4111-8111-000000000002'
);

-- Painting and plastering, the first seeded service in migration 0001.
insert into public.pro_services (pro_id, service_id)
select '11111111-1111-4111-8111-000000000002', '00000000-0000-0000-0000-000000000001'
where not exists (
  select 1 from public.pro_services
  where pro_id = '11111111-1111-4111-8111-000000000002'
    and service_id = '00000000-0000-0000-0000-000000000001'
);

-- =========================================================================

do $$
declare
  v_users bigint;
  v_profiles bigint;
  v_identities bigint;
  v_minted bigint;
begin
  select count(*) into v_users from auth.users where email like '%@staging.klussie.test';
  select count(*) into v_profiles from public.profiles;
  select count(*) into v_identities from identity.identities;
  select count(*) into v_minted from identity.identities
  where auth_user_id = '11111111-1111-4111-8111-000000000004';

  raise notice 'Seeded: % account(s), % profile(s), % identity row(s)', v_users, v_profiles, v_identities;
  if v_minted <> 1 then
    raise exception 'The external account did not get exactly one minted identity';
  end if;
  raise notice 'Sign in with any of them using the password in this file''s header.';
end;
$$;
