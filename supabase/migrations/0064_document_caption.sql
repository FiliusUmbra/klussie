-- Epic 08 WP09 (part 3) — resolves §5.6's finding (implementation/epic-08/COMPLETION.md):
-- fetchPortfolioItems() returns `caption`, a real client-mutable field
-- (updatePortfolioCaption(), src/lib/portfolio.js), with no equivalent on
-- property.documents — switching that read would have silently dropped it. Adds the
-- column, backfills it onto already-mirrored rows, extends every contract function's
-- return shape, and gives portfolio_items an UPDATE mirror trigger for the first time in
-- this epic — the one thing 0061's own header correctly said wasn't needed yet ("there is
-- nothing for an UPDATE trigger to mirror") is now needed, because this migration is what
-- gives it something to mirror.
--
-- WHY THIS IS ITS OWN MIGRATION
--
-- 0055 (the table), 0059/0062/0063 (the contract), and 0061 (dual-write) are all already
-- committed and pushed. Same discipline as every other correction in this epic
-- (document_attachments/document_shares' FK fix, the public-visibility branch): a new
-- migration, ALTER TABLE and CREATE OR REPLACE FUNCTION, never an edit to a file that
-- already shipped.
--
-- CAPTION HAS NO EQUIVALENT ON request_photo — NULLABLE, NEVER SET FOR THAT TYPE
--
-- public.service_request_photos has no caption-like field at all; property.documents'
-- caption column stays null for every request_photo document, by construction — nothing
-- writes it for that type, and nothing is expected to.

-- =========================================================================
-- THE COLUMN, BACKFILLED ONTO ALREADY-MIRRORED PORTFOLIO DOCUMENTS

alter table property.documents add column if not exists caption text;

update property.documents d
set caption = pi.caption
from public.portfolio_items pi
where d.portfolio_item_id = pi.id
  and d.caption is distinct from pi.caption;

comment on column property.documents.caption is
  'Free text, mirrored from public.portfolio_items.caption for portfolio_photo documents only (0064) — no equivalent exists for request_photo, which never sets this. The one field on property.documents that is not part of DATABASE_ARCHITECTURE.md §15''s own document model (type, validity, issuer); kept here because the source table it mirrors already has it and dropping it silently would have been a real regression (§5.6).';

-- =========================================================================
-- THE CONTRACT — every function's return shape gains caption

create or replace function property.my_documents(
  p_property_id  uuid default null,
  p_location_id  uuid default null,
  p_asset_id     uuid default null,
  p_workspace_id uuid default null
)
returns table (
  id                  uuid,
  owning_workspace_id uuid,
  type_key            text,
  storage_bucket      text,
  storage_path        text,
  issuer              text,
  valid_from          date,
  valid_until         date,
  caption             text,
  version_since       timestamptz,
  created_at          timestamptz,
  updated_at          timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if num_nonnulls(p_property_id, p_location_id, p_asset_id, p_workspace_id) <> 1 then
    raise exception 'property.my_documents: exactly one subject must be given'
      using errcode = 'invalid_parameter_value';
  end if;

  return query
    select d.id, d.owning_workspace_id, d.type_key, d.storage_bucket, d.storage_path, d.issuer,
           d.valid_from, d.valid_until, d.caption, d.version_since, d.created_at, d.updated_at
    from property.documents d
    join property.document_attachments da on da.document_id = d.id
    where (p_property_id is not null and da.property_id = p_property_id)
       or (p_location_id is not null and da.location_id = p_location_id)
       or (p_asset_id is not null and da.asset_id = p_asset_id)
       or (p_workspace_id is not null and da.workspace_id = p_workspace_id)
    and (
      exists (select 1 from property.document_types dt where dt.type_key = d.type_key and dt.is_public)
      or (
        auth.uid() is not null
        and (
          d.owning_workspace_id in (select workspace_id from workspace.current_memberships())
          or exists (
            select 1 from property.document_shares ds
            where ds.document_id = d.id
              and ds.shared_with_workspace_id in (select workspace_id from workspace.current_memberships())
          )
        )
      )
    );
end;
$$;

comment on function property.my_documents(uuid, uuid, uuid, uuid) is
  'Every document attached to one subject, visible via a public document type, a live membership in the owning workspace, or an explicit share. caption is populated for portfolio_photo, always null for request_photo (0064). Not SECURITY DEFINER, granted to nobody, reachable only from api.my_documents().';

create or replace function property.resolve_document(p_document_id uuid)
returns table (
  id                  uuid,
  owning_workspace_id uuid,
  type_key            text,
  storage_bucket      text,
  storage_path        text,
  issuer              text,
  valid_from          date,
  valid_until         date,
  caption             text,
  version_since       timestamptz,
  created_at          timestamptz,
  updated_at          timestamptz
)
language sql
stable
set search_path = ''
as $$
  select d.id, d.owning_workspace_id, d.type_key, d.storage_bucket, d.storage_path, d.issuer,
         d.valid_from, d.valid_until, d.caption, d.version_since, d.created_at, d.updated_at
  from property.documents d
  where d.id = p_document_id
    and (
      exists (select 1 from property.document_types dt where dt.type_key = d.type_key and dt.is_public)
      or (
        auth.uid() is not null
        and (
          d.owning_workspace_id in (select workspace_id from workspace.current_memberships())
          or exists (
            select 1 from property.document_shares ds
            where ds.document_id = d.id
              and ds.shared_with_workspace_id in (select workspace_id from workspace.current_memberships())
          )
        )
      )
    );
$$;

comment on function property.resolve_document(uuid) is
  'Resolves one document''s current version, including caption where it applies (0064). Not SECURITY DEFINER, granted to nobody, reachable only from api.resolve_document().';

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
  caption             text,
  version_since       timestamptz,
  created_at          timestamptz,
  updated_at          timestamptz
)
language sql
stable
set search_path = ''
as $$
  select d.id, d.owning_workspace_id, d.type_key, d.storage_bucket, d.storage_path, d.issuer,
         d.valid_from, d.valid_until, d.caption, d.version_since, d.created_at, d.updated_at
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
  'Every document mirrored from a request''s photos. caption included for return-shape consistency with my_documents()/resolve_document() (0064) — always null here, since service_request_photos has no caption-like field to mirror. Not SECURITY DEFINER, granted to nobody, reachable only from api.documents_for_service_request().';

-- =========================================================================
-- THE DELEGATES — same signatures, same grants, only the return shape changed

create or replace function api.my_documents(
  p_property_id  uuid default null,
  p_location_id  uuid default null,
  p_asset_id     uuid default null,
  p_workspace_id uuid default null
)
returns table (
  id                  uuid,
  owning_workspace_id uuid,
  type_key            text,
  storage_bucket      text,
  storage_path        text,
  issuer              text,
  valid_from          date,
  valid_until         date,
  caption             text,
  version_since       timestamptz,
  created_at          timestamptz,
  updated_at          timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from property.my_documents(p_property_id, p_location_id, p_asset_id, p_workspace_id);
$$;

create or replace function api.resolve_document(p_document_id uuid)
returns table (
  id                  uuid,
  owning_workspace_id uuid,
  type_key            text,
  storage_bucket      text,
  storage_path        text,
  issuer              text,
  valid_from          date,
  valid_until         date,
  caption             text,
  version_since       timestamptz,
  created_at          timestamptz,
  updated_at          timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from property.resolve_document(p_document_id);
$$;

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
  caption             text,
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

-- Grants are unchanged from 0062/0063 — CREATE OR REPLACE FUNCTION preserves existing
-- grants in Postgres as long as the signature (argument types) does not change, which it
-- does not here; restated explicitly anyway, verified rather than assumed (ADR-0026
-- property 4's own discipline).
revoke all on function property.my_documents(uuid, uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function property.resolve_document(uuid) from public, anon, authenticated, service_role;
revoke all on function property.documents_for_service_request(uuid) from public, anon, authenticated, service_role;
revoke all on function api.my_documents(uuid, uuid, uuid, uuid) from public, service_role;
revoke all on function api.resolve_document(uuid) from public, service_role;
revoke all on function api.documents_for_service_request(uuid) from public, anon, service_role;
grant execute on function api.my_documents(uuid, uuid, uuid, uuid) to anon, authenticated;
grant execute on function api.resolve_document(uuid) to anon, authenticated;
grant execute on function api.documents_for_service_request(uuid) to authenticated;

-- =========================================================================
-- THE DUAL-WRITE — portfolio_items gains an UPDATE mirror for the first time in this
-- epic, now that there is something (caption) to mirror; the insert mirror is extended
-- to carry it from the start too.

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

  if v_workspace_id is null then
    return new;
  end if;

  v_document_id := platform.uuid_v7_at(now());

  insert into property.documents (id, owning_workspace_id, type_key, storage_bucket, storage_path, caption, portfolio_item_id, created_at, updated_at)
  values (v_document_id, v_workspace_id, 'portfolio_photo', 'portfolio', new.storage_path, new.caption, new.id, now(), now())
  on conflict (portfolio_item_id) where portfolio_item_id is not null do nothing;

  insert into property.document_attachments (id, document_id, workspace_id)
  select platform.uuid_v7_at(now()), v_document_id, v_workspace_id
  where exists (select 1 from property.documents where id = v_document_id);

  return new;
end;
$$;

comment on function public.portfolio_items_mirror_insert() is
  'Dual-write mirror for Epic 08 step 3 (WP 08.07/0064): every new portfolio_items row gets a property.documents row, including its caption from the start. Temporary by construction.';

create or replace function public.portfolio_items_mirror_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update property.documents
  set caption = new.caption, updated_at = now()
  where portfolio_item_id = new.id;

  return new;
end;
$$;

comment on function public.portfolio_items_mirror_update() is
  'Dual-write mirror for Epic 08 step 3 (0064): keeps a mirrored document''s caption in step with public.portfolio_items.updatePortfolioCaption(). The one client-mutable field portfolio_items has (0061''s own header) — no other column needs this trigger. A no-op when no mirror exists (the owner resolved to no Professional Workspace at insert time). Temporary by construction — removed when step 6 retires portfolio_items.';

drop trigger if exists portfolio_items_mirror_update on public.portfolio_items;
create trigger portfolio_items_mirror_update
  after update on public.portfolio_items
  for each row
  when (old.caption is distinct from new.caption)
  execute function public.portfolio_items_mirror_update();
