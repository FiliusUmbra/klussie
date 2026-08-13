-- Epic 02 WP04 — dual-write identity on signup and profile change.
--
-- Step 3 of the migration pattern (IMPLEMENTATION_ROADMAP.md §3): writes go to both
-- structures, `public.profiles` stays authoritative, and nothing reads the new one yet.
--
-- WHY THIS IS A MIGRATION AND NOT A CHANGE TO src/lib/auth.jsx.
--
-- The roadmap's file list for this package is `src/lib/auth.jsx` and `api/_lib/auth.js`,
-- which assumes the application creates users. It does not. `public.handle_new_user()` —
-- an AFTER INSERT trigger on `auth.users` since migration 0001 — creates the profile and
-- the contact row, inside the transaction that inserts the auth user. The client calls
-- `supabase.auth.signUp()` and the rows appear underneath it.
--
-- That makes the trigger the only place a third write can be transactional with the first
-- two. A write issued from the client after signUp() returns is a separate request against
-- an already-committed transaction: a dropped connection, a closed tab or a failed
-- redirect leaves an auth user and a profile with no identity. Magic-link and OAuth
-- signups complete through a redirect, where there may be no client running at the moment
-- the user row appears at all.
--
-- The client also *cannot* write here. WP 02.01 revoked everything on
-- `identity.identities` from `anon`, `authenticated` and `service_role`, PostgREST does
-- not expose the `identity` schema, and Epic 01 established that it must not. Both
-- diagnostics assert it.
--
-- WHERE THE PERSON REFERENCE COMES FROM.
--
-- SUPABASE_ARCHITECTURE.md §3 puts identifier generation in the application, so the
-- application generates it: `src/lib/ids.ts` mints a UUIDv7 and passes it through the
-- signup metadata, which this trigger reads. That covers every signup the application
-- makes.
--
-- An auth user can also appear without the application: the Supabase dashboard's "Add
-- user", the admin API, and OAuth once a provider is configured
-- (`docs/operations/AUTH_PROVIDER_SETUP.md` records that none is today). For those the
-- trigger mints in SQL — which is ADR-0022's existing case, identifiers for rows the
-- application did not create, not a runtime generator for engines.

-- =========================================================================
-- SIGNUP
--
-- The existing body is unchanged and still first: if the identity write were to fail, the
-- profile write has already happened in the same transaction and both roll back together.
-- That is the point of putting it here.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_person_ref uuid;
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url');

  insert into public.profile_contacts (profile_id, email)
  values (new.id, new.email);

  -- The application's identifier, if the application made this signup. A malformed value
  -- falls through to the mint rather than raising: a client sending nonsense is a defect
  -- worth finding, and failing a person's signup over it is not the way to find it.
  begin
    v_person_ref := nullif(new.raw_user_meta_data ->> 'person_ref', '')::uuid;
  exception when invalid_text_representation then
    v_person_ref := null;
  end;

  if v_person_ref is null then
    v_person_ref := platform.uuid_v7_at(now());
  end if;

  -- `on conflict do nothing` on the auth-user link, so exactly one identity exists per
  -- auth user no matter how many times anything runs. The unique constraint is what makes
  -- a second one impossible; this makes the attempt harmless rather than an error that
  -- would fail a signup.
  insert into identity.identities (
    person_ref, auth_user_id, full_name, avatar_url, email, created_at, updated_at
  ) values (
    v_person_ref,
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    new.email,
    now(),
    now()
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

-- =========================================================================
-- PROFILE CHANGE
--
-- Mirrors the four attributes the two structures share. `public.profiles` is written from
-- exactly two places today (`updateProfile` and `markRoleSelected` in src/lib/auth.jsx),
-- and putting the mirror on the table rather than in either of them covers both, plus
-- anything added later, plus anything an operator does by hand.
--
-- PERSON_REF IS NOT IN THE UPDATE LIST, WHICH IS WHY IT CANNOT CHANGE. Not a rule someone
-- has to remember — the statement has no way to express it. §8: "Its identifier is
-- permanent and never reused."
--
-- `onboarding_role_selected` and `home_tour_completed_at` are deliberately not mirrored:
-- they are application state about a session, not attributes of a person, and WP 02.01
-- gave the identity row no column for either.

create or replace function public.handle_profile_updated()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update identity.identities
  set full_name  = new.full_name,
      avatar_url = new.avatar_url,
      city       = new.city,
      locale     = new.locale,
      updated_at = now()
  where auth_user_id = new.id
    -- An erased identity holds no personal data, and identities_erasure_is_complete
    -- refuses a row that says otherwise. Without this clause, a profile update for an
    -- erased person would write their name back, the constraint would reject it, and the
    -- rejection would fail the caller's profile update — turning erasure into a bug in
    -- someone else's screen. WP 02.07 adds erasure; this guard has to exist before it.
    and erased_at is null;

  return new;
end;
$$;

comment on function public.handle_profile_updated() is
  'Dual-write mirror for Epic 02 step 3: keeps identity attributes in step with public.profiles. Temporary by construction — removed when step 6 retires profiles. Cannot change person_ref, because the statement does not name it.';

drop trigger if exists on_profile_updated on public.profiles;
create trigger on_profile_updated
  after update on public.profiles
  for each row
  -- Only when something mirrored actually changed. Without this, marking the onboarding
  -- flag would bump the identity's updated_at and make the reconciliation in WP 02.05 read
  -- as though attributes had drifted.
  when (
    old.full_name  is distinct from new.full_name
    or old.avatar_url is distinct from new.avatar_url
    or old.city       is distinct from new.city
    or old.locale     is distinct from new.locale
  )
  execute function public.handle_profile_updated();
