-- Epic 02 WP02 — one identity per existing profile.
--
-- Step 2 of the migration pattern (IMPLEMENTATION_ROADMAP.md §3): the new structure is
-- populated and still unused. `public.profiles` remains authoritative, remains written,
-- and is not touched here.
--
-- IDEMPOTENT AND RE-RUNNABLE, WHICH IS A RULE RATHER THAN A COURTESY.
--
-- §3 of the roadmap: "a backfill that can only be run once is a backfill that cannot be
-- trusted." Re-running this file inserts nothing and changes nothing — it does NOT
-- re-mint identifiers, and it does NOT refresh attributes that have since diverged.
-- Keeping the two in step is the dual-write path's job (WP 02.04), and proving they agree
-- is the reconciliation's (WP 02.05), which is a hard gate on the read switch in 02.06.
--
-- WHERE THE IDENTIFIERS COME FROM
--
-- SUPABASE_ARCHITECTURE.md §3 puts identifier generation in the application, for a reason
-- that is about the write path: an engine must know an aggregate's identity before it
-- writes so it can emit an event in the same transaction. A backfill has no engine, no
-- event and no request, and WP 02.03's JavaScript generator cannot supply values to a SQL
-- migration however it is sequenced.
--
-- ADR-0022 resolves it: mint v7 in SQL, from each row's OWN creation time, through a
-- function no engine can execute. The timestamp choice is the substantive part — a v7
-- carries its timestamp in the leading 48 bits, so a backfilled reference sorts exactly
-- where it would have sorted had it been generated when the profile was created.

-- =========================================================================
-- THE MINTER
--
-- RFC 9562 layout: 48 bits of Unix milliseconds, the version nibble, then random.
-- gen_random_uuid() supplies the random half and has already set the variant bits
-- correctly, so the only surgery needed is the timestamp and the version.
--
-- Takes a timestamp and has NO no-argument form, deliberately. A runtime caller would
-- have to write `platform.uuid_v7_at(now())`, which reads as the mistake it would be.

create or replace function platform.uuid_v7_at(p_at timestamptz)
returns uuid
language sql
volatile
set search_path = ''
as $$
  select (
    -- 12 hex digits = 48 bits of Unix epoch milliseconds.
    --
    -- `date_part` rather than `extract`: EXTRACT(field FROM source) is SQL syntax, not a
    -- function, so it cannot be schema-qualified — and under `search_path = ''` every
    -- function reference must be. `date_part` is the ordinary function form of the same
    -- operation. (The same trap as `coalesce` in migration 0023.)
    pg_catalog.lpad(
      pg_catalog.to_hex(pg_catalog.floor(pg_catalog.date_part('epoch', p_at) * 1000)::bigint),
      12, '0'
    )
    -- The version nibble.
    || '7'
    -- 3 hex digits of randomness, then the remaining 16 including the variant nibble,
    -- which gen_random_uuid() has already set to 10xx.
    || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 14, 3)
    || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 17, 16)
  )::uuid;
$$;

comment on function platform.uuid_v7_at(timestamptz) is
  'Mints a UUIDv7 whose embedded timestamp is the argument. For BACKFILLS ONLY (ADR-0022) — executable by no application role, because SUPABASE_ARCHITECTURE.md §3 puts runtime identifier generation in the application.';

-- The grant is the enforcement. PostgreSQL gives EXECUTE on a new function to PUBLIC, and
-- leaving it there would make §3 advisory: any engine could mint identifiers in the
-- database. Revoked and granted to nobody, so only the owner — the migration runner — can
-- call it.
revoke all on function platform.uuid_v7_at(timestamptz) from public;

-- =========================================================================
-- THE BACKFILL
--
-- One identity per profile. Personal data moves to the identity row because §11.4 makes it
-- "the only identity-scoped aggregate that holds personal data" — including the contact
-- details that live in a separate table today, since §8 counts contact channels among the
-- identity's own attributes.
--
-- `auth_user_id` is `profiles.id`, which IS the Supabase Auth user id. Note what is NOT
-- happening: that value is recorded as the link to authentication, and a NEW person
-- reference is minted. Reusing it as the person reference would derive the platform's
-- permanent identity from a provider the architecture treats as a replaceable adapter
-- (ADR-0022, alternative A).
--
-- `created_at` is preserved rather than defaulted, so the identity's age is the person's
-- real age on the platform — and so the minted v7 and the row agree about when this
-- person appeared.

insert into identity.identities (
  person_ref, auth_user_id, full_name, avatar_url, city, email, phone, locale,
  created_at, updated_at
)
select
  platform.uuid_v7_at(p.created_at),
  p.id,
  p.full_name,
  p.avatar_url,
  p.city,
  c.email,
  c.phone,
  p.locale,
  p.created_at,
  now()
from public.profiles p
-- Left join: a profile without contact details is ordinary, not a reason to skip it.
left join public.profile_contacts c on c.profile_id = p.id
-- What makes re-running a no-op. Not `on conflict do nothing`, because that would also
-- swallow a genuine unique violation from an unrelated cause; this says exactly what it
-- means — insert the profiles that do not yet have an identity.
where not exists (
  select 1 from identity.identities i where i.auth_user_id = p.id
);
