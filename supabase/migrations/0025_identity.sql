-- Epic 02 WP01 — the identity row, and the person reference that outlives it.
--
-- DATABASE_ARCHITECTURE.md §8 calls erasure "the hardest question in the document", and
-- resolves it with one decision that this table exists to make possible:
--
--   "Personal identifying data is separated from the durable record. Everything durable —
--    events, audit, service records, invoices, workflow transitions — refers to a person
--    by a stable internal reference, never by their personal details. Erasure removes or
--    redacts the identity aggregate; the durable record keeps a reference that no longer
--    resolves to a person."
--
-- So this is the only identity-scoped aggregate that holds personal data, and
-- `person_ref` is the UUID every durable record carries instead.
--
-- WHAT THIS TABLE IS NOT
--
-- Not authentication. Supabase Auth owns that and is an adapter behind this engine
-- (SUPABASE_ARCHITECTURE.md §18), not the identity model.
--
-- Not roles, permissions or membership. SYSTEM_ARCHITECTURE.md §6.1's "does not own" list
-- is longer than its "owns" list, and deliberately: the Identity engine "does not know
-- which workspaces an identity belongs to; it is asked, never asks." Nothing about what a
-- person may do belongs here.
--
-- This table is inert. Nothing reads or writes it; `public.profiles` remains the
-- application's source of truth for display information until WP 02.06 switches reads,
-- and remains written until step 6 retires it, which is not in this epic.

-- =========================================================================
-- THE TABLE

create table if not exists identity.identities (
  -- The person reference. UUIDv7 and application-generated (§3): an engine must know an
  -- aggregate's identity before it writes, so it can emit an event referencing it in the
  -- same transaction.
  --
  -- DELIBERATELY NO DEFAULT. `gen_random_uuid()` would produce a v4 and would produce it
  -- in the database, contradicting §3 on both counts, and a default is the kind of
  -- convenience that quietly becomes the way rows are made. WP 02.03 adds the generator.
  person_ref    uuid        not null,

  -- The link to Supabase Auth, and there is deliberately NO FOREIGN KEY here.
  --
  -- §11.4: "Deleting an auth user must never cascade. The auth record and the identity row
  -- are separable, and losing authentication is not losing identity." A foreign key would
  -- have to choose an ON DELETE behaviour, and every choice couples the two lifecycles:
  -- CASCADE destroys identity with authentication, RESTRICT makes an auth deletion fail,
  -- SET NULL is closest but still lets the auth provider reach into this schema.
  --
  -- Nullable, because the direction of travel is federated identity and provider migration
  -- (§6.1's future expansion). An identity with no auth record is a person who cannot
  -- currently sign in — not a corrupt row.
  auth_user_id  uuid,

  -- Personal attributes. §8: "Mutable in its attributes — name, language, contact
  -- channels, preferences." This is the only place they live, which is what makes erasure
  -- reach all of them.
  full_name     text,
  avatar_url    text,
  city          text,
  email         text,
  phone         text,
  locale        text        not null default 'nl',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Erasure is redaction, not deletion (§11.4): the row stays, its personal data goes, and
  -- `person_ref` "remains valid as a key and resolves to nothing." Without a marker a
  -- redacted row is indistinguishable from a sparse one, and "resolves to nothing" becomes
  -- unanswerable. WP 02.07 implements the redaction itself; this column is the structure
  -- it needs.
  erased_at     timestamptz,

  constraint identities_pkey primary key (person_ref),

  -- One identity per auth user. Two identities sharing an auth record would make "who is
  -- signed in" ambiguous, which is the one question this engine exists to answer.
  constraint identities_auth_user_unique unique (auth_user_id),

  -- Constraints, not business rules (SUPABASE_ARCHITECTURE.md §4): each refuses an
  -- impossibility rather than making a decision.
  --
  -- Mirrors the check on public.profiles.locale. The duplication is real and temporary —
  -- see the work package — and is accepted because WP 02.06 makes this row authoritative,
  -- and an authoritative row cannot rely on a constraint that lives on the table it is
  -- replacing.
  constraint identities_locale_valid
    check (locale in ('nl','fr','de','en','es','ar','fa','tr','ru','zh')),

  -- An erased identity holds no personal data. Stated as a constraint rather than trusted
  -- to WP 02.07's redaction path, because the failure mode — an erasure that left a field
  -- behind — is unlawful rather than merely wrong, and would be invisible.
  constraint identities_erasure_is_complete check (
    erased_at is null
    or (full_name is null and avatar_url is null and city is null
        and email is null and phone is null)
  )
);

comment on table identity.identities is
  'The identity aggregate — the only identity-scoped table holding personal data. Durable records reference a person by person_ref and never by their details, which is what lets erasure redact this row without rewriting history (DATABASE_ARCHITECTURE.md §8).';

comment on column identity.identities.person_ref is
  'The person reference every durable record carries. UUIDv7, application-generated (§3). Permanent and never reused, including after erasure — the reference stays valid as a key and resolves to nothing.';
comment on column identity.identities.auth_user_id is
  'The Supabase Auth user, if there is one. No foreign key on purpose: §11.4 requires the auth record and the identity row to be separable, and deleting an auth user must never cascade.';
comment on column identity.identities.erased_at is
  'When this identity was erased by redaction. Null means resolvable. A non-null value with personal data still present is refused by identities_erasure_is_complete.';

-- =========================================================================
-- INDEXES
--
-- The primary key serves resolution by person reference, which is the engine's hot path:
-- §6.1 calls identity "the most-read, least-written thing in the platform — small records,
-- consulted per request." The unique constraint on auth_user_id serves sign-in.
--
-- Nothing else is indexed. There is no query yet, and §9's principle of the narrowest
-- thing that works applies to indexes as much as to grants.

-- =========================================================================
-- MUTABILITY AND ACCESS
--
-- Mutability class: MUTABLE in its attributes (§8). docs/operations/ROLES.md §3 rule 2
-- says a mutable table opts in explicitly and names its class, because 0019's default
-- privileges grant only SELECT and INSERT — the fail-safe direction for the append-only
-- tables that make up most of this platform.
--
-- DELETE is withheld from everyone, and that is the point rather than an oversight. §8:
-- an identity is "ended only by erasure, never by inactivity", and §11.4 makes erasure a
-- redaction. There is no correct reason for a row to leave this table, so no role is given
-- the ability to remove one.

grant update on identity.identities to klussie_engine_identity;

-- RLS on every table without exception (§24 item 5). No policies yet: nothing reads this
-- table, and the policies that will eventually let a person read their own row belong with
-- WP 02.06, which is where reading starts. Until then the absent policy is the deny.
alter table identity.identities enable row level security;

-- Explicit, for the same reason as everywhere in Epic 01: an absence of grants is
-- indistinguishable from an oversight. `authenticated` will eventually read its own row
-- through a policy; it is not granted anything here, because that is 02.06's decision to
-- make with the read path in front of it.
revoke all on identity.identities from anon, authenticated, service_role;
