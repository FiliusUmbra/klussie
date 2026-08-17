-- Epic 08 WP07 — dual-write: portfolio_items and service_request_photos writes also
-- write property.documents, going forward.
--
-- Step 3 of the six-step migration pattern (roadmap §3). Following migration 0053's own
-- precedent exactly (Epic 07's household_items dual-write): a database trigger, not an
-- application-level second write — the only place a mirror write is transactional with
-- the primary one. Neither source table's client code changes.
--
-- READ BEFORE DESIGN FOUND BOTH SOURCE TABLES SIMPLER THAN ASSUMED — NO UPDATE TRIGGER
-- NEEDED ON EITHER
--
-- src/lib/portfolio.js and src/lib/requestPhotos.js were read in full before writing this
-- migration, not assumed. portfolio_items has exactly one client-mutable field beyond
-- creation — caption, via updatePortfolioCaption() — and property.documents has no
-- caption column; there is nothing for an UPDATE trigger to mirror. service_request_photos
-- has no update path at all. Both source tables only ever see INSERT and DELETE from real
-- client code, so this migration only builds those two triggers per table, not three —
-- caption is a deliberate, stated gap (not mirrored anywhere), not an oversight.
--
-- A REAL BUG FOUND AND FIXED BEFORE ANY LIVE DELETE COULD HIT IT — THE SAME CLASS AS
-- 0053's household_items_id FIX, CAUGHT PROACTIVELY THIS TIME
--
-- property.document_attachments.document_id and property.document_shares.document_id
-- (0056, 0057) were both created with a plain `references property.documents (id)` — no
-- ON DELETE clause, defaulting to NO ACTION. Deleting a property.documents row that has
-- any attachment or share would therefore fail with a foreign-key violation the moment
-- this migration's own delete triggers tried to delete a convenience-class document.
-- Unlike 0053 (where the equivalent household_items_id bug shipped once, in Epic 07, and
-- needed a follow-up migration to fix), this one was caught by reading 0056/0057 again
-- before writing the delete triggers below, in the same session, before it could ever
-- reach a real account. Fixed here with ON DELETE CASCADE, not SET NULL: unlike
-- household_items_id (bookkeeping on the asset itself, meaningless once its source is
-- gone but the asset must survive), an attachment or share row has no independent meaning
-- once its own document is gone — it should not survive as an orphan, it should go with
-- it.

-- =========================================================================
-- THE FOREIGN KEY FIX

do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'property.document_attachments'::regclass
    and contype = 'f'
    and conkey = array[(
      select attnum from pg_attribute
      where attrelid = 'property.document_attachments'::regclass and attname = 'document_id'
    )];
  if v_constraint_name is not null then
    execute format('alter table property.document_attachments drop constraint %I', v_constraint_name);
  end if;
end;
$$;

alter table property.document_attachments
  add constraint document_attachments_document_id_fkey
  foreign key (document_id) references property.documents (id)
  on delete cascade;

do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'property.document_shares'::regclass
    and contype = 'f'
    and conkey = array[(
      select attnum from pg_attribute
      where attrelid = 'property.document_shares'::regclass and attname = 'document_id'
    )];
  if v_constraint_name is not null then
    execute format('alter table property.document_shares drop constraint %I', v_constraint_name);
  end if;
end;
$$;

alter table property.document_shares
  add constraint document_shares_document_id_fkey
  foreign key (document_id) references property.documents (id)
  on delete cascade;

comment on column property.document_attachments.document_id is
  'What document this attachment belongs to. ON DELETE CASCADE: an attachment row has no meaning once its own document is gone (0061) — unlike property.assets.household_items_id (0052/0053), which is bookkeeping that must survive its source going away.';
comment on column property.document_shares.document_id is
  'What document this share grants access to. ON DELETE CASCADE, for the same reason as document_attachments.document_id above.';

-- =========================================================================
-- THE MIRROR — PORTFOLIO PHOTOS

create or replace function public.portfolio_items_mirror_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_document_id  uuid;
begin
  select w.id into v_workspace_id
  from identity.identities i
  join workspace.memberships m
    on m.person_ref = i.person_ref and m.role = 'owner' and m.state = 'active'
    and (m.expires_at is null or m.expires_at > now())
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional'
  where i.auth_user_id = new.pro_id;

  -- Silently mirrors nothing when the owner resolves to no Professional Workspace — the
  -- same "reconciled against, not defended against" posture 0052's backfill and 0053's
  -- household_items mirror both already take.
  if v_workspace_id is null then
    return new;
  end if;

  v_document_id := platform.uuid_v7_at(now());

  insert into property.documents (id, owning_workspace_id, type_key, storage_bucket, storage_path, portfolio_item_id, created_at, updated_at)
  values (v_document_id, v_workspace_id, 'portfolio_photo', 'portfolio', new.storage_path, new.id, now(), now())
  on conflict (portfolio_item_id) where portfolio_item_id is not null do nothing;

  insert into property.document_attachments (id, document_id, workspace_id)
  select platform.uuid_v7_at(now()), v_document_id, v_workspace_id
  where exists (select 1 from property.documents where id = v_document_id);

  return new;
end;
$$;

comment on function public.portfolio_items_mirror_insert() is
  'Dual-write mirror for Epic 08 step 3 (WP 08.07): every new portfolio_items row gets a property.documents row, attached to the pro''s own Professional Workspace, mirroring 0060''s own mapping. Temporary by construction — removed when step 6 retires portfolio_items.';

drop trigger if exists portfolio_items_mirror_insert on public.portfolio_items;
create trigger portfolio_items_mirror_insert
  after insert on public.portfolio_items
  for each row
  execute function public.portfolio_items_mirror_insert();

create or replace function public.portfolio_items_mirror_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A real delete, not a disposal: portfolio_photo is convenience-class
  -- (property.document_types), which property.documents_guard_deletion() (0055) permits.
  -- Runs BEFORE DELETE so portfolio_item_id still matches; document_attachments and
  -- document_shares for this document are removed by ON DELETE CASCADE (0061's own fix,
  -- above), not by this function.
  delete from property.documents where portfolio_item_id = old.id;
  return old;
end;
$$;

comment on function public.portfolio_items_mirror_delete() is
  'Dual-write mirror for Epic 08 step 3 (WP 08.07): a deleted portfolio_items row deletes its mirrored document for real — portfolio_photo is convenience-class, so this is permitted, unlike Epic 07''s asset mirror (which disposes rather than deletes, since assets withhold DELETE entirely). A no-op when no mirror exists. Temporary by construction.';

drop trigger if exists portfolio_items_mirror_delete on public.portfolio_items;
create trigger portfolio_items_mirror_delete
  before delete on public.portfolio_items
  for each row
  execute function public.portfolio_items_mirror_delete();

-- =========================================================================
-- THE MIRROR — REQUEST PHOTOS
--
-- Sharing on live insert cannot snapshot 0060's own backfill query verbatim — a new
-- request that has not been quoted on yet has no quotes to derive an audience from, and
-- pro_matches_request() itself only answers "does THIS pro match," not "list every pro
-- who does." Mirrors 0060's exact matching predicate (service offered, not paused,
-- certification, city) as a set-based insert, live, the same shape the backfill already
-- proved — not a new rule, the same one, evaluated at a different time.

create or replace function public.service_request_photos_mirror_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_document_id  uuid;
begin
  select w.id into v_workspace_id
  from public.service_requests sr
  join identity.identities i on i.auth_user_id = sr.customer_id
  join workspace.memberships m
    on m.person_ref = i.person_ref and m.role = 'owner' and m.state = 'active'
    and (m.expires_at is null or m.expires_at > now())
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal'
  where sr.id = new.request_id;

  if v_workspace_id is null then
    return new;
  end if;

  v_document_id := platform.uuid_v7_at(now());

  insert into property.documents (id, owning_workspace_id, type_key, storage_bucket, storage_path, service_request_photo_id, created_at, updated_at)
  values (v_document_id, v_workspace_id, 'request_photo', 'request-photos', new.storage_path, new.id, now(), now())
  on conflict (service_request_photo_id) where service_request_photo_id is not null do nothing;

  -- Deliberately left unattached — see 0060's own header for why no real subject fits
  -- yet. Shared per the same predicate the backfill snapshotted, evaluated live.
  insert into property.document_shares (id, document_id, shared_with_workspace_id)
  select distinct platform.uuid_v7_at(now()), v_document_id, pro_w.id
  from public.service_requests sr
  join public.pro_services ps on ps.service_id = sr.service_id
  join public.services sv on sv.id = sr.service_id
  join public.pro_profiles pp on pp.profile_id = ps.pro_id and not pp.paused
  left join public.pro_stats st on st.pro_id = pp.profile_id
  left join public.profiles prof on prof.id = pp.profile_id
  join identity.identities pro_i on pro_i.auth_user_id = pp.profile_id
  join workspace.memberships pro_m
    on pro_m.person_ref = pro_i.person_ref and pro_m.role = 'owner' and pro_m.state = 'active'
    and (pro_m.expires_at is null or pro_m.expires_at > now())
  join workspace.workspaces pro_w on pro_w.id = pro_m.workspace_id and pro_w.type = 'professional'
  where sr.id = new.request_id
    and (sv.certified_only = false or coalesce(st.is_certified, false))
    and (sr.city is null or prof.city is null or lower(sr.city) = lower(prof.city))
    and exists (select 1 from property.documents where id = v_document_id)
  on conflict (document_id, shared_with_workspace_id) do nothing;

  return new;
end;
$$;

comment on function public.service_request_photos_mirror_insert() is
  'Dual-write mirror for Epic 08 step 3 (WP 08.07): every new service_request_photos row gets a property.documents row, unattached (0060''s own restraint — no real subject fits yet), shared with every currently-matching pro''s workspace per pro_matches_request()''s own predicate (migration 0004), evaluated live rather than snapshotted. Temporary by construction.';

drop trigger if exists service_request_photos_mirror_insert on public.service_request_photos;
create trigger service_request_photos_mirror_insert
  after insert on public.service_request_photos
  for each row
  execute function public.service_request_photos_mirror_insert();

create or replace function public.service_request_photos_mirror_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- request_photo is convenience-class too — a real delete, same reasoning as the
  -- portfolio mirror above.
  delete from property.documents where service_request_photo_id = old.id;
  return old;
end;
$$;

comment on function public.service_request_photos_mirror_delete() is
  'Dual-write mirror for Epic 08 step 3 (WP 08.07): a deleted service_request_photos row deletes its mirrored document for real — request_photo is convenience-class. A no-op when no mirror exists. Temporary by construction.';

drop trigger if exists service_request_photos_mirror_delete on public.service_request_photos;
create trigger service_request_photos_mirror_delete
  before delete on public.service_request_photos
  for each row
  execute function public.service_request_photos_mirror_delete();
