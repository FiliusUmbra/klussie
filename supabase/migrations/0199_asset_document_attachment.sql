-- Home Builder follow-up slice — closing a real, named scope boundary from
-- 0141_document_write_contract.sql: "property-level attachment only, matching WP 1.3's
-- own read-side scope." The read side was never actually property-only —
-- property.my_documents()/api.my_documents() (0059) and property.resolve_document()
-- (0059, extended by 0161) have always accepted p_asset_id, and property.
-- document_attachments (0056) has always had a real asset_id column with its own
-- "exactly one subject" check. Only the WRITE contract was narrowed. This migration
-- closes that gap: a customer can now attach a warranty or manual to one specific
-- appliance, not only to the property as a whole.
--
-- WHY A NEW PARAMETER LIST, NOT A SEPARATE create_asset_document() FUNCTION
--
-- property.document_attachments' own shape (0056) is "exactly one of several possible
-- subjects on one row" — my_documents()/resolve_document() already made "one function,
-- several optional subject parameters" the established idiom for this exact table. A
-- second, near-identical create function would just be that idiom, abandoned, for no
-- reason. p_property_id and p_asset_id both become optional (default null) with the
-- same num_nonnulls(...) = 1 guard my_documents() itself already uses.
--
-- SAFE TO REPLACE: EVERY CALLER USES NAMED RPC ARGUMENTS
--
-- src/lib/documents.js's own createDocument() calls this via a named-argument RPC
-- object (Supabase/PostgREST always sends named JSON args, never positional) — so
-- moving p_property_id from its original 3rd position to a trailing, now-optional
-- position, alongside the new p_asset_id, does not break the existing call. This is
-- the same replace-in-place shape 0197_conversation_workspace_scoping.sql already used
-- for functions with real existing callers.

-- =========================================================================
-- THE LOGIC — property.create_document(), now accepting an asset as the subject

create or replace function property.create_document(
  p_document_id     uuid,
  p_attachment_id   uuid,
  p_type_key        text,
  p_storage_path    text,
  p_issuer          text,
  p_valid_from      date,
  p_valid_until     date,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text,
  p_property_id     uuid default null,
  p_asset_id        uuid default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_steward_workspace_id uuid;
  v_property_id          uuid;
begin
  if num_nonnulls(p_property_id, p_asset_id) <> 1 then
    raise exception
      'property.create_document: exactly one of property or asset must be given'
      using errcode = 'invalid_parameter_value';
  end if;

  -- An asset is always inside exactly one property (property.assets.property_id, not
  -- null, Epic 07) — resolving through it and reusing the identical property-membership
  -- check below is the whole extension. No separate asset-specific authorization rule.
  if p_asset_id is not null then
    select a.property_id into v_property_id
    from property.assets a
    where a.id = p_asset_id;
  else
    v_property_id := p_property_id;
  end if;

  select p.steward_workspace_id into v_steward_workspace_id
  from property.properties p
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  where p.id = v_property_id;

  -- One generic exception for "no such property/asset" and "not yours" alike, matching
  -- this function's own prior restraint (and create_asset()/create_location()'s) —
  -- unchanged even though the reason can now be either a missing property or a missing/
  -- foreign asset.
  if v_steward_workspace_id is null then
    raise exception
      'property.create_document: caller may not create a document under this property or asset'
      using errcode = 'insufficient_privilege';
  end if;

  if not pg_catalog.starts_with(p_storage_path, v_steward_workspace_id::text || '/') then
    raise exception
      'property.create_document: storage_path must be rooted under the caller''s own workspace folder'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into property.documents
    (id, owning_workspace_id, type_key, storage_bucket, storage_path, issuer, valid_from, valid_until, version_since, created_at, updated_at)
  values
    (p_document_id, v_steward_workspace_id, p_type_key, 'documents', p_storage_path, p_issuer, p_valid_from, p_valid_until, now(), now(), now());

  if p_asset_id is not null then
    insert into property.document_attachments (id, document_id, asset_id)
    values (p_attachment_id, p_document_id, p_asset_id);
  else
    insert into property.document_attachments (id, document_id, property_id)
    values (p_attachment_id, p_document_id, p_property_id);
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'property.document.created',
    p_workspace_id   => v_steward_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'document',
    p_subject_id     => p_document_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object(
      'typeKey', p_type_key, 'propertyId', p_property_id, 'assetId', p_asset_id, 'attachmentId', p_attachment_id
    )
  );
end;
$$;

comment on function property.create_document(uuid, uuid, text, text, text, date, date, uuid, uuid, platform.actor_type, text, uuid, uuid) is
  'Creates a document owned by a property''s steward workspace, attached to either that property or one real asset inside it (exactly one of p_property_id/p_asset_id — 0199, closing the write-side gap 0141''s own header named). storage_bucket is always ''documents''; storage_path must be rooted under the caller''s own resolved workspace folder. One generic exception for "no such subject" and "not yours" alike. Emits property.document.created. Not SECURITY DEFINER, granted to nobody, reachable only from api.create_document().';

-- =========================================================================
-- THE DELEGATE

create or replace function api.create_document(
  p_document_id     uuid,
  p_attachment_id   uuid,
  p_type_key        text,
  p_storage_path    text,
  p_issuer          text,
  p_valid_from      date,
  p_valid_until     date,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text,
  p_property_id     uuid default null,
  p_asset_id        uuid default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  select property.create_document(
    p_document_id, p_attachment_id, p_type_key, p_storage_path,
    p_issuer, p_valid_from, p_valid_until, p_event_id, p_correlation_id, p_actor_type, p_actor_ref,
    p_property_id, p_asset_id
  );
$$;

comment on function api.create_document(uuid, uuid, text, text, text, date, date, uuid, uuid, platform.actor_type, text, uuid, uuid) is
  'Delegate for property.create_document() (ADR-0026''s split). Creates a document under a property or asset the caller has a live membership in, attached to it.';

-- =========================================================================
-- ACCESS — the old signature is dropped outright (not just replaced): Postgres treats a
-- changed parameter list as a distinct function identity, so the original 12-parameter
-- overload would otherwise linger, still granted, as dead surface.

drop function if exists property.create_document(uuid, uuid, uuid, text, text, text, date, date, uuid, uuid, platform.actor_type, text);
drop function if exists api.create_document(uuid, uuid, uuid, text, text, text, date, date, uuid, uuid, platform.actor_type, text);

revoke all on function property.create_document(uuid, uuid, text, text, text, date, date, uuid, uuid, platform.actor_type, text, uuid, uuid)
  from public, anon, authenticated, service_role;

revoke all on function api.create_document(uuid, uuid, text, text, text, date, date, uuid, uuid, platform.actor_type, text, uuid, uuid)
  from public, anon, service_role;
grant execute on function api.create_document(uuid, uuid, text, text, text, date, date, uuid, uuid, platform.actor_type, text, uuid, uuid)
  to authenticated;

-- =========================================================================
-- AI USAGE LOG — a new endpoint, 'ask-about-item' (ask Klussie a grounded question about
-- one appliance/asset), joins the two 0010_phase1_foundation.sql seeded. Constraint name
-- resolved dynamically (matching 0061_document_dual_write.sql's own established idiom)
-- rather than assumed, since Postgres' auto-generated name is not guaranteed across
-- environments that may have been repaired/replayed differently.

do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.ai_usage_log'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%endpoint%';

  if v_constraint_name is not null then
    execute format('alter table public.ai_usage_log drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.ai_usage_log
  add constraint ai_usage_log_endpoint_check
  check (endpoint in ('ai-intake', 'translate-message', 'ask-about-item'));
