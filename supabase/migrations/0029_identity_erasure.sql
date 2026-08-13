-- Epic 02 WP07 — erasure by redaction.
--
-- DATABASE_ARCHITECTURE.md §8 calls this "the hardest question in the document" and
-- answers it in one sentence: personal identifying data is separated from the durable
-- record, so erasure removes the person and not their history.
--
-- SUPABASE_ARCHITECTURE.md §11.4: "Erasure redacts the identity row. The person reference
-- remains valid as a key and resolves to nothing. Events, audit records, service records,
-- transitions and financial records are untouched, complete, and internally consistent."
--
-- WHY REDACTION IS NOT MERELY THE TIDIER OPTION.
--
-- Deleting is not available, and the schema says so loudly. `public.profiles` is the
-- parent of nine `on delete cascade` foreign keys — conversations, messages, reviews,
-- service_requests, household_items, reports, pro_profiles, profile_contacts,
-- ai_usage_log — and `profiles.id` itself cascades from `auth.users`. **Deleting one auth
-- user would destroy that person's entire history and both sides of every conversation
-- they were part of**, including the other party's messages.
--
-- So this function deletes nothing at all. It sets personal columns to null and marks the
-- row erased. `identity.identities` has no `DELETE` grant for anyone (WP 02.01), which is
-- the same decision expressed as a privilege.
--
-- WHAT IT REDACTS, AND WHERE THAT STOPS.
--
-- Three tables hold the attributes of a person today: the identity row, and the two
-- legacy tables that still carry them because ADR-0023 leaves step 6 out of this epic.
-- Redacting only `identity.identities` would leave the name and email sitting in
-- `public.profiles` and `public.profile_contacts`, which would make this operation a
-- statement rather than an erasure.
--
-- It deliberately does NOT touch `public.pro_profiles` — see the work package. Whether a
-- sole trader's `business_name` is personal data or a public trading name is a legal
-- question, not one this migration should answer by picking.
--
-- IT WRITES AN AUDIT RECORD, because §33 requires one: "every export or erasure". This is
-- the first writer of `platform.audit_records`, and it can be because it is SECURITY
-- DEFINER and owned by the table's owner — §8's "audit rows arrive through a privileged
-- path" is exactly this shape.

create or replace function identity.erase_person(
  p_person_ref  uuid,
  p_actor_type  platform.actor_type,
  p_actor_ref   text,
  p_authority   text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid;
  v_already_erased boolean;
begin
  if p_person_ref is null then
    raise exception 'erase_person requires a person reference';
  end if;
  if p_actor_ref is null or length(trim(p_actor_ref)) = 0 then
    raise exception 'erase_person requires an actor — an unattributed erasure is not auditable';
  end if;
  if p_authority is null or length(trim(p_authority)) = 0 then
    raise exception 'erase_person requires the authority it acts under (§33)';
  end if;

  select i.auth_user_id, i.erased_at is not null
  into v_auth_user_id, v_already_erased
  from identity.identities i
  where i.person_ref = p_person_ref;

  if not found then
    raise exception 'No identity with person reference %', p_person_ref;
  end if;

  -- Idempotent. Erasure is requested by people under stress and retried by systems under
  -- load; the second attempt must not fail, and must not write a second audit record
  -- claiming a second erasure happened.
  if v_already_erased then
    return false;
  end if;

  -- THE IDENTITY ROW FIRST, AND THE ORDER IS LOAD-BEARING.
  --
  -- Redacting the profile fires the WP 02.04 mirror, which copies profile attributes onto
  -- the identity row — but only `where erased_at is null`. Marking the identity erased
  -- before touching the profile is what makes the mirror skip it. Reverse these two
  -- statements and the mirror writes nulls onto an already-null row, which is harmless
  -- today and would silently stop being harmless the moment the mirror carries a column
  -- the redaction does not.
  update identity.identities
  set full_name = null, avatar_url = null, city = null, email = null, phone = null,
      erased_at = now(), updated_at = now()
  where person_ref = p_person_ref;

  -- The legacy tables that still hold the same attributes. Both survive this epic
  -- (ADR-0023), so both have to be reached.
  update public.profiles
  set full_name = null, avatar_url = null, city = null
  where id = v_auth_user_id;

  update public.profile_contacts
  set email = null, phone = null
  where profile_id = v_auth_user_id;

  -- §33: every erasure is audited. Platform-scoped, so no workspace — the case ADR-0021
  -- kept a nullable workspace column for.
  --
  -- The audit record names the person reference and never the person: writing the erased
  -- name into the audit trail would put back, in a permanent table, precisely what was
  -- just removed.
  insert into platform.audit_records (
    audit_id, occurred_at, workspace_id, actor_type, actor_ref, action,
    subject_type, subject_id, outcome, authority, detail
  ) values (
    platform.uuid_v7_at(now()), now(), null, p_actor_type, p_actor_ref, 'identity.person_erased',
    'identity', p_person_ref, 'permitted', p_authority,
    jsonb_build_object('redacted', jsonb_build_array('identity.identities', 'public.profiles', 'public.profile_contacts'))
  );

  return true;
end;
$$;

comment on function identity.erase_person(uuid, platform.actor_type, text, text) is
  'Erases a person by redaction: personal columns nulled across identity and the two legacy tables that still hold them, the person reference left valid as a key, durable history untouched, and an audit record written (§33). Deletes nothing — public.profiles is the parent of nine cascading foreign keys.';

-- =========================================================================
-- ACCESS
--
-- Executable by nobody. Erasure is not exposed to users and has no request flow yet
-- (roadmap §13 says so outright), so the only caller is a database owner running it
-- deliberately. The epic that builds the request flow grants it to whatever executes that
-- flow, and audits the request as well as the erasure.
--
-- The revoke matters more here than anywhere else in this schema: this is a SECURITY
-- DEFINER function that destroys personal data, and Supabase's default privileges in
-- `public` grant EXECUTE to `anon` by name — a lesson from WP 02.06. This function is in
-- `identity` rather than `public`, so those defaults do not reach it, and the revoke below
-- closes the PUBLIC grant PostgreSQL adds regardless.

revoke all on function identity.erase_person(uuid, platform.actor_type, text, text)
  from public, anon, authenticated, service_role;
