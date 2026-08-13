-- Epic 02 WP06 — the read path onto identity.identities.
--
-- Step 5 of the migration pattern (IMPLEMENTATION_ROADMAP.md §3): **the only step that
-- changes behaviour, and the only one that can regress.** Reads move; writes do not.
-- `public.profiles` is still written by everything that wrote it yesterday.
--
-- ADR-0023 (accepted) decides the shape, because a straight read switch could not hold
-- all three of identical behaviour, identical UI and identical permissions. Migration 0001
-- split contact details out of `profiles` so RLS could keep them private until a booking
-- exists; `identity.identities` merges both column groups into one row; and RLS decides
-- visibility per row, with no field-level security anywhere in this design (§11.1). One
-- policy cannot serve a column group everyone may read and a column group almost nobody
-- may.
--
-- So there are two operations rather than one table read, exactly as SYSTEM_ARCHITECTURE.md
-- §6.1 states the Identity engine's contract:
--
--   "Authenticate a principal. **Resolve an internal person-reference to display
--    information, subject to erasure.** Assert a verified attribute."
--
--   · current_identity()        — the caller's OWN row, contact channels included, which
--                                 matches what profile_contacts' owner policy allows today.
--   · resolve_identity_display() — anyone's name and avatar, and NOTHING else, ever.
--
-- WHY FUNCTIONS IN `public` RATHER THAN A POLICY ON THE TABLE.
--
-- ADR-0023 anticipated an own-row RLS policy with the client reading `identity.identities`
-- directly. That requires PostgREST to expose the `identity` schema, and **it cannot be
-- done from a migration**: `pgrst.db_schemas` is not set on the `authenticator` role on
-- this project, so exposed schemas are configured outside the database and a migration
-- that set it would either be ignored or fight the dashboard.
--
-- The substance of ADR-0023 is unchanged and the outcome is stricter: `identity` stays
-- entirely off the client API surface, as `platform` does, and the ADR's stated cost —
-- "identity.identities becomes reachable from the client API surface for the first time"
-- — does not have to be paid. SECURITY DEFINER RPCs in `public` are the established
-- pattern here (ADR-0004's `emit_domain_event`).
--
-- CONTACT CHANNELS ARE NOT REACHABLE THROUGH THE DISPLAY RESOLVER AT ANY PRIVILEGE LEVEL.
-- Not by policy, not by convention — the function's return type has no column for them.

-- =========================================================================
-- THE CALLER'S OWN IDENTITY
--
-- Returns at most one row: the caller's. `auth.uid()` is null for an anonymous request, so
-- an unauthenticated caller gets nothing rather than an error.
--
-- An erased identity returns nothing. §11.4: the reference "remains valid as a key and
-- resolves to nothing" — and a person whose identity is erased has no display information
-- to hand back.

create or replace function public.current_identity()
returns table (
  person_ref  uuid,
  full_name   text,
  avatar_url  text,
  city        text,
  email       text,
  phone       text,
  locale      text,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.person_ref, i.full_name, i.avatar_url, i.city, i.email, i.phone, i.locale, i.created_at
  from identity.identities i
  where i.auth_user_id = auth.uid()
    and i.erased_at is null;
$$;

comment on function public.current_identity() is
  'The signed-in person''s own identity, contact channels included — matching what public.profile_contacts'' owner policy allows today. Returns nothing for an anonymous caller or an erased identity.';

-- =========================================================================
-- DISPLAY RESOLUTION
--
-- The operation §6.1 names. Takes person references — or rather the auth user ids the
-- application still keys professionals by — and returns what may be shown.
--
-- THE RETURN TYPE IS THE SECURITY BOUNDARY. There is no email column, no phone column, and
-- no way to ask for one. A future contributor widening this signature is making a privacy
-- decision, not a convenience change, and the test alongside this migration says so.
--
-- Deliberately not restricted to professionals: §6.1's contract is about people, and Epic
-- 03's membership lists will need the same operation for ordinary members. Restricting it
-- to pros now would guarantee a second, parallel resolver later.

create or replace function public.resolve_identity_display(p_auth_user_ids uuid[])
returns table (
  auth_user_id uuid,
  full_name    text,
  avatar_url   text
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.auth_user_id, i.full_name, i.avatar_url
  from identity.identities i
  where i.auth_user_id = any(p_auth_user_ids)
    and i.erased_at is null;
$$;

comment on function public.resolve_identity_display(uuid[]) is
  'Resolves person references to display information only — name and avatar (SYSTEM_ARCHITECTURE.md §6.1). Contact channels are unreachable through it because the return type has no column for them. An erased identity resolves to nothing.';

-- =========================================================================
-- ACCESS
--
-- PostgreSQL grants EXECUTE on a new function to PUBLIC, which on a SECURITY DEFINER
-- function reading every person's row would be the whole protection inverted.
--
-- REVOKING FROM `public` IS NOT ENOUGH ON SUPABASE, and this was found by testing rather
-- than by reading. Supabase ships `alter default privileges in schema public grant all on
-- functions to anon, authenticated, service_role`, so a new function here is granted to
-- `anon` **by name** — a grant that survives `revoke ... from public` untouched. An
-- anonymous visitor could call both of these until the explicit revokes below were added.
--
-- `anon` must not reach either. An anonymous visitor cannot read `public.profiles` today
-- (its select policy is `to authenticated`), and these resolvers are SECURITY DEFINER, so
-- an anon grant would hand the whole user table to anyone with the public key.
--
-- `service_role` is revoked too: nothing server-side calls these, and it bypasses RLS.

revoke all on function public.current_identity() from public, anon, service_role;
revoke all on function public.resolve_identity_display(uuid[]) from public, anon, service_role;

grant execute on function public.current_identity() to authenticated;
grant execute on function public.resolve_identity_display(uuid[]) to authenticated;
