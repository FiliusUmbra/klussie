-- Epic 08 WP09 (part 2) — a dedicated lookup for service_request_photos-sourced documents,
-- resolving the second half of the gap found designing the read switch
-- (implementation/epic-08/COMPLETION.md §5.5): these documents are deliberately unattached
-- (0060/0061's own stated restraint — no real subject exists until Epic 12 links a request
-- to a property), so property.my_documents(subject) cannot discover them at all.
--
-- WHY A DEDICATED LOOKUP, NOT A CHANGE TO WHAT'S ATTACHED
--
-- 0062 resolved the *visibility* half of §5.5's finding (portfolio_items is genuinely
-- public); this is the *discoverability* half, and it is a narrower, more mechanical
-- question than the public/private one — there is no user-facing trade-off between
-- alternatives the way there was between "silently break public portfolio viewing" and
-- "don't." Forcing an attachment to a subject that doesn't fit (the property, the
-- workspace) would overstate what's true about a request photo, the same restraint
-- WP 07.05 held for unplaced assets and 0060 already held for these exact documents.
-- Reusing the bookkeeping column (service_request_photo_id) that 0060 built explicitly as
-- "read by nothing except the backfill/dual-write's own idempotency guard" is the
-- narrower change: one new function, keyed on the one real fact the client already has —
-- src/lib/requestPhotos.js's own fetchRequestPhotos(requestId) already calls exactly this
-- shape today.
--
-- THE SAME VISIBILITY RULE, NO PUBLIC BRANCH — request_photo STAYS PRIVATE
--
-- Owning-workspace membership or an explicit share, identical to property.resolve_document()
-- (0059/0062). request_photo's is_public stayed false in 0062, deliberately — a request
-- photo was never meant to be public, and this function does not change that.

create or replace function property.documents_for_service_request(p_request_id uuid)
returns table (
  id                  uuid,
  owning_workspace_id uuid,
  type_key            text,
  storage_bucket      text,
  storage_path        text,
  issuer              text,
  valid_from          date,
  valid_until         date,
  version_since       timestamptz,
  created_at          timestamptz,
  updated_at          timestamptz
)
language sql
stable
set search_path = ''
as $$
  select d.id, d.owning_workspace_id, d.type_key, d.storage_bucket, d.storage_path, d.issuer,
         d.valid_from, d.valid_until, d.version_since, d.created_at, d.updated_at
  from property.documents d
  join public.service_request_photos srp on srp.id = d.service_request_photo_id
  where srp.request_id = p_request_id
    and auth.uid() is not null
    and (
      d.owning_workspace_id in (select workspace_id from workspace.current_memberships())
      or exists (
        select 1 from property.document_shares ds
        where ds.document_id = d.id
          and ds.shared_with_workspace_id in (select workspace_id from workspace.current_memberships())
      )
    )
  order by d.created_at asc;
$$;

comment on function property.documents_for_service_request(uuid) is
  'Every document mirrored from public.service_request_photos for one request (roadmap WP 08.09) — request-photo documents are deliberately unattached (0060/0061), so this is a dedicated lookup via the bookkeeping join, not subject-based discovery through property.my_documents(). Same visibility rule as resolve_document() (owning workspace or an explicit share); no public branch — request_photo stayed private in 0062. Not SECURITY DEFINER, granted to nobody, reachable only from api.documents_for_service_request().';

create or replace function api.documents_for_service_request(p_request_id uuid)
returns table (
  id                  uuid,
  owning_workspace_id uuid,
  type_key            text,
  storage_bucket      text,
  storage_path        text,
  issuer              text,
  valid_from          date,
  valid_until         date,
  version_since       timestamptz,
  created_at          timestamptz,
  updated_at          timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from property.documents_for_service_request(p_request_id);
$$;

comment on function api.documents_for_service_request(uuid) is
  'Delegate for property.documents_for_service_request() (ADR-0026''s split). Every document mirrored from a request''s photos, private to the customer and any pro it has been shared with.';

revoke all on function property.documents_for_service_request(uuid) from public, anon, authenticated, service_role;
revoke all on function api.documents_for_service_request(uuid) from public, anon, service_role;
grant execute on function api.documents_for_service_request(uuid) to authenticated;
