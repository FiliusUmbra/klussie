-- Epic 08 WP06 — migrate existing portfolio_items and service_request_photos rows into
-- property.documents.
--
-- PLATFORM_DOMAIN_MODEL.md §12 / DATABASE_ARCHITECTURE.md §15. Step 2 of the six-step
-- migration pattern (roadmap §3): the new structure is populated and still unused.
-- Neither source table is touched by this migration — WP 08.07 (dual-write) and WP 08.09
-- (the read switch) are separate, later packages, both decomposed but not built this
-- session (roadmap §18's own scope note).
--
-- THE SECOND BACKFILL IN THIS ROADMAP MOVING REAL, EXISTING DATA — AND THE FIRST FROM
-- TWO SOURCE TABLES AT ONCE
--
-- household_items (WP 07.05) was one source table into one target. This migration reads
-- public.portfolio_items and public.service_request_photos — both already in production,
-- already written by real customers and pros — and writes into one target,
-- property.documents, with two different type_keys and two different ownership chains.
--
-- avatar_url IS NOT BACKFILLED — SEE ROADMAP §18's OWN PLATFORM DISCOVERY
--
-- DATABASE_ARCHITECTURE.md §15 defines a document as "evidence that outlives what it was
-- attached to" — an avatar carries no type, no validity, no issuer, and is not "about"
-- anything else. Deliberately excluded, not an oversight.
--
-- IDEMPOTENT VIA TWO BOOKKEEPING COLUMNS, NOT PART OF THE DOMAIN MODEL — SAME ROLE AS
-- household_items_id (0052), FIXED FROM THE START THIS TIME
--
-- portfolio_item_id and service_request_photo_id exist purely so re-running this
-- migration is a no-op. WP 07.05's own household_items_id (0052) shipped without an
-- ON DELETE clause and needed a follow-up fix (0053) once dual-write made the gap real —
-- both bookkeeping columns here get ON DELETE SET NULL from the start: once a source row
-- is deleted, there is nothing left to book-keep, and the migrated document is not
-- deleted with it (property.documents_guard_deletion(), 0055, would refuse it anyway for
-- an evidence-class type; these are both convenience-class, so the guard would allow it,
-- but a stale bookkeeping pointer is still wrong to leave behind).
--
-- PORTFOLIO PHOTOS ATTACH TO THE PRO'S OWN WORKSPACE — NO ASSET OR PROPERTY EXISTS FOR A
-- PRO'S CRAFT
--
-- property.document_attachments (0056) supports property/location/asset/workspace
-- subjects. A portfolio photo is not about a physical thing this platform tracks; it is
-- about the professional's own body of work, so it attaches to their Professional
-- Workspace directly — the one real subject that fits.
--
-- REQUEST PHOTOS ATTACH TO NOTHING TODAY — LEFT GENUINELY UNATTACHED, THE SAME RESTRAINT
-- WP 07.05 HELD FOR UNPLACED ASSETS
--
-- No service_requests-to-property link exists yet — that arrives with Epic 12
-- (Marketplace). Forcing an attachment to the customer's own workspace would overstate
-- what's true (a request photo is about the job, not the home in general) and forcing one
-- to nothing at all would be inventing structure with no real subject. Left with zero
-- document_attachments rows — still fully resolvable by id via resolve_document(), and
-- still shared per the rule below, just not discoverable by subject browsing yet.
--
-- SHARING IS A POINT-IN-TIME SNAPSHOT OF public.pro_matches_request(), NOT A LIVE RULE
--
-- migration 0004's own matching predicate (service offered, not paused, certification,
-- city) is reproduced here as a set-based join rather than called per-row, for the same
-- reason every backfill in this roadmap favours a single INSERT...SELECT over a
-- procedural loop. A pro who starts matching a request *after* this migration runs gets
-- no retroactive share — a real, accepted limitation, named here rather than hidden, and
-- exactly the kind of gap WP 08.07's eventual dual-write (a trigger, following WP 07.06's
-- own precedent) would need to keep live going forward.

-- =========================================================================
-- BOOKKEEPING COLUMNS

alter table property.documents
  add column if not exists portfolio_item_id uuid
    references public.portfolio_items (id) on delete set null;

alter table property.documents
  add column if not exists service_request_photo_id uuid
    references public.service_request_photos (id) on delete set null;

create unique index if not exists documents_portfolio_item_id_uidx
  on property.documents (portfolio_item_id)
  where portfolio_item_id is not null;

create unique index if not exists documents_service_request_photo_id_uidx
  on property.documents (service_request_photo_id)
  where service_request_photo_id is not null;

comment on column property.documents.portfolio_item_id is
  'Bookkeeping only, not part of the domain model — which portfolio_items row this document was backfilled from, so re-running WP 08.06 is a no-op. ON DELETE SET NULL: once the source row is gone there is nothing left to book-keep. Read by nothing except this migration''s own re-run guard.';
comment on column property.documents.service_request_photo_id is
  'Bookkeeping only, not part of the domain model — which service_request_photos row this document was backfilled from, so re-running WP 08.06 is a no-op. ON DELETE SET NULL, for the same reason as portfolio_item_id above.';

-- =========================================================================
-- 1 · PORTFOLIO PHOTOS

with candidates as (
  select
    pi.id as portfolio_item_id,
    pi.storage_path,
    pi.created_at,
    w.id as workspace_id,
    platform.uuid_v7_at(pi.created_at) as document_id
  from public.portfolio_items pi
  join identity.identities i on i.auth_user_id = pi.pro_id
  join workspace.memberships m
    on m.person_ref = i.person_ref
    and m.role = 'owner'
    and m.state = 'active'
    and (m.expires_at is null or m.expires_at > now())
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional'
  where not exists (
    select 1 from property.documents d where d.portfolio_item_id = pi.id
  )
),
inserted_documents as (
  insert into property.documents (
    id, owning_workspace_id, type_key, storage_bucket, storage_path,
    portfolio_item_id, created_at, updated_at
  )
  select
    document_id, workspace_id, 'portfolio_photo', 'portfolio', storage_path,
    portfolio_item_id, created_at, now()
  from candidates
  returning id, portfolio_item_id, owning_workspace_id
)
insert into property.document_attachments (id, document_id, workspace_id)
select platform.uuid_v7_at(now()), idoc.id, idoc.owning_workspace_id
from inserted_documents idoc;

-- =========================================================================
-- 2 · REQUEST PHOTOS

with candidates as (
  select
    srp.id as service_request_photo_id,
    srp.storage_path,
    srp.created_at,
    srp.request_id,
    w.id as workspace_id,
    platform.uuid_v7_at(srp.created_at) as document_id
  from public.service_request_photos srp
  join public.service_requests sr on sr.id = srp.request_id
  join identity.identities i on i.auth_user_id = sr.customer_id
  join workspace.memberships m
    on m.person_ref = i.person_ref
    and m.role = 'owner'
    and m.state = 'active'
    and (m.expires_at is null or m.expires_at > now())
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal'
  where not exists (
    select 1 from property.documents d where d.service_request_photo_id = srp.id
  )
),
inserted_documents as (
  insert into property.documents (
    id, owning_workspace_id, type_key, storage_bucket, storage_path,
    service_request_photo_id, created_at, updated_at
  )
  select
    document_id, workspace_id, 'request_photo', 'request-photos', storage_path,
    service_request_photo_id, created_at, now()
  from candidates
  returning id, service_request_photo_id, request_id
)
-- Sharing: a point-in-time snapshot of public.pro_matches_request()'s own predicate
-- (migration 0004), reproduced as a set-based join — see this migration's own header.
insert into property.document_shares (id, document_id, shared_with_workspace_id)
select distinct
  platform.uuid_v7_at(now()), idoc.id, pro_w.id
from inserted_documents idoc
join public.service_requests sr on sr.id = idoc.request_id
join public.pro_services ps on ps.service_id = sr.service_id
join public.services sv on sv.id = sr.service_id
join public.pro_profiles pp on pp.profile_id = ps.pro_id and not pp.paused
left join public.pro_stats st on st.pro_id = pp.profile_id
left join public.profiles prof on prof.id = pp.profile_id
join identity.identities pro_i on pro_i.auth_user_id = pp.profile_id
join workspace.memberships pro_m
  on pro_m.person_ref = pro_i.person_ref
  and pro_m.role = 'owner'
  and pro_m.state = 'active'
  and (pro_m.expires_at is null or pro_m.expires_at > now())
join workspace.workspaces pro_w on pro_w.id = pro_m.workspace_id and pro_w.type = 'professional'
where (sv.certified_only = false or coalesce(st.is_certified, false))
  and (sr.city is null or prof.city is null or lower(sr.city) = lower(prof.city))
on conflict (document_id, shared_with_workspace_id) do nothing;
