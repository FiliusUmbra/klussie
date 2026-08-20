-- Platform Activation Slice 2, WP 2.4 — completes scoped authorization: makes
-- `workspace.memberships.scope` (present since 0030, never enforced by anything —
-- ADR-0026's own "What this does not resolve": "There is no location tree until Epic 06,
-- and no consumer workspace uses scope... nothing resolves it yet") a real, enforced
-- narrowing, for the first time in this platform's history.
--
-- A REAL, PRE-EXISTING BUG FOUND ALONG THE WAY, INDEPENDENT OF THIS MIGRATION'S OWN
-- CHANGE — FOUND BY THE ADVERSARIAL VERIFICATION THIS WORK PACKAGE'S OWN INSTRUCTION
-- REQUIRED, FIXED IN §4
--
-- property.my_documents()'s own WHERE clause (0149) never parenthesised its five-subject
-- OR-chain together with its visibility check — SQL's own AND-binds-tighter-than-OR rule
-- meant only the last subject clause (p_request_id) was ever really gated by visibility;
-- calling it with p_property_id/p_location_id/p_asset_id/p_workspace_id instead returned
-- every attached document with no visibility check at all. Never exploited by this
-- codebase's own client (fetchRequestPhotos() has only ever called it with p_request_id,
-- accidentally the one safe parameter) — but a real, live vulnerability the moment
-- anything calls it with p_property_id, which this migration's own scope feature is the
-- first thing that ever does. See §4's own header for the fix.
--
-- WHY THIS IS PART OF WP 2.4, NOT A SEPARATE DECISION
--
-- WP 2.4's own stated acceptance bar (SLICE_2_MARKETPLACE_TRANSACTION_ACTIVATION.md §4):
-- "A professional who accepts a booking can see the customer's own Location/Asset/
-- Document twin for the property concerned — WP 2.4's own acceptance bar, not merely
-- 'the grant row exists'." Checked directly before writing the consumer that creates that
-- grant row: every property/location/asset/document isolation policy in this codebase
-- (0042/0045/0050/0058, unchanged since Epics 06-08) grants visibility purely from
-- `steward_workspace_id`/`owning_workspace_id` IN (api.current_workspace_memberships()) —
-- membership existence alone, with `role`/`scope` selected into the row type and never
-- once referenced by any policy. Creating a scoped `workspace.memberships` row for a
-- performing workspace, as WP 2.4 requires, would — under every existing policy, as
-- written — grant that workspace's owner full, unscoped visibility into the CUSTOMER'S
-- ENTIRE property/asset/document twin, not "exactly the locations and assets the work
-- concerns" (DATABASE_ARCHITECTURE.md §19's own words). Shipping the grant without this
-- fix would be a real cross-tenant disclosure, on the platform's single hottest,
-- most-reused authorization function. Not feature creep — completing what the `scope`
-- column was always for, the one precondition WP 2.4's own grant depends on to be correct
-- rather than merely present.
--
-- THE FIX, IN ONE SENTENCE: workspace.current_memberships() NOW RETURNS scope IS NULL
-- MEMBERSHIPS ONLY. EVERY EXISTING POLICY IS THEREFORE UNCHANGED IN BEHAVIOUR, BY
-- CONSTRUCTION — NOT BY REVIEW
--
-- This is the deliberate design choice, not the alternative of auditing and patching
-- every one of the ~20 policies built on this function across nine engines
-- (property/work/workspace/knowledge/commerce/capability/analytics/search — checked, see
-- below). A membership with a non-null scope is, by definition, LESS than full workspace
-- access — the correct default for every caller of current_memberships() that has never
-- known any other kind of membership existed is to keep not seeing it, automatically,
-- with zero risk of a forgotten policy anywhere in the platform silently over-granting.
-- Only the five property.* policies that actually need to respect a property-level scope
-- are extended, explicitly, below — nothing else changes, and nothing else needed to.
--
-- REVIEWED: EVERY RLS POLICY BUILT ON api.current_workspace_memberships() — 23 POLICIES
-- ACROSS property AND work, PLUS workspace/knowledge/commerce/capability/analytics/
-- search/provider_decisions — AND EVERY FUNCTION IN property/work/api THAT REFERENCES
-- workspace.current_memberships()/api.current_workspace_memberships() DIRECTLY, NOT ONLY
-- ITS POLICIES
--
-- RLS is the outer gate a plain table read passes through; it is not the only one, and
-- checking only the five policies above would have left this fix half-done. A second grep
-- across every function body in property/work/api for the same string found seven read
-- functions that each ADDITIONALLY, REDUNDANTLY bake in their own
-- `join workspace.current_memberships()` gate — meaning even with RLS fixed, every one of
-- them would still have returned nothing for a real, valid scoped grant. §4 below extends
-- all seven, for the identical reason and in the identical shape as the five policies.
--
-- Three categories, checked directly against every CREATE POLICY and every function body
-- in the codebase (not assumed):
--
--   NEEDS scope-awareness — extended below:
--     Policies: property.properties, property.locations, property.assets,
--       property.asset_facets, property.documents (§3).
--     Functions: property.resolve_property, property.resolve_asset,
--       property.resolve_document, property.locations_for_property, property.my_assets,
--       property.my_documents, property.assemble_twin (§4) — exactly what
--       "Location/Asset/Document twin" names, at both the row-visibility layer and the
--       read-function layer built on top of it.
--
--   Deliberately NOT extended, named as a decision — see §4's own header for the full
--   reasoning: property.my_properties(), property.timeline_segment(),
--     property.documents_for_service_request().
--
--   MUST NOT gain scope-awareness — a scoped grant must stay invisible to every one of
--   these, which the fix in §1 guarantees without touching any of them:
--     work.requests/quotes/engagements (bilateral marketplace — a contractor's property
--       access must never extend to the customer's OTHER, unrelated marketplace
--       activity), work.conversations/conversation_participants/messages (already
--       participant-scoped via api.my_active_conversation_ids(), untouched by this
--       function at all), work.maintenance_obligations/schedules, work.service_records
--       and its two annex tables (property-adjacent, but not named by WP 2.4's own
--       acceptance bar — a real, separate, later decision if ever wanted, not assumed
--       here), work.provider_decisions, work.workflow_* (four tables, configuration-
--       level), every work.* MUTATION function (accept_quote_for_caller,
--       create_request_for_caller, and 18 others — a scoped grant authorizing a write on
--       the customer's behalf would be a materially larger escalation than read access,
--       never intended), and every workspace/knowledge/commerce/capability/analytics/
--       search policy (billing, subscriptions, capability grants — governance-level facts
--       about the whole workspace a temporary contractor must never see regardless of
--       scope).
--
-- WHAT "SCOPE" MEANS, CONCRETELY, FOR THE FIRST TIME
--
-- Property-level: workspace.memberships.scope = {"propertyId": "<uuid>", ...}. Chosen
-- over location/asset-level enforcement because it is exactly what the acceptance bar's
-- own words require ("the property... covered by that grant") and because it is the
-- coarsest, always-correct level every scope this migration's own consumer (0162) can
-- construct reduces to — a request naming only an asset or location still resolves a
-- real property_id through it (property.assets/locations both carry their own
-- property_id). A narrower, asset/location-level cut inside the same property is a real
-- future refinement (§10's own "a set of properties or a location subtree"), not
-- required by anything this work package or its own stated objectives ask for, and not
-- built speculatively here (ADR-0010's own restraint).

-- =========================================================================
-- 1 · workspace.current_memberships() — now scope-null only. Same signature, same
-- return type — a body change, not a DROP-FIRST case.

create or replace function workspace.current_memberships()
returns table (membership_id uuid, workspace_id uuid, role text, scope jsonb)
language sql
stable
set search_path = ''
as $$
  select m.id, m.workspace_id, m.role, m.scope
  from workspace.memberships m
  join identity.identities i on i.person_ref = m.person_ref
  where i.auth_user_id = auth.uid()
    and i.erased_at is null
    and m.state = 'active'
    and (m.expires_at is null or m.expires_at > now())
    and m.scope is null;
$$;

comment on function workspace.current_memberships() is
  'The caller''s own live, UNSCOPED memberships only (WP 2.4) — every membership with a real scope (a temporary, property-narrowed grant) is deliberately excluded here, so every one of this function''s ~20 existing callers across the platform keeps behaving exactly as it always has, by construction. A scoped membership is resolved separately, only where scope-aware visibility is actually wanted — see workspace.current_property_scope() below.';

-- =========================================================================
-- 2 · workspace.current_property_scope() / api.current_property_scope() — the caller's
-- own scoped grants, resolved to the one thing they narrow to today: a property_id.

create or replace function workspace.current_property_scope()
returns table (membership_id uuid, property_id uuid, expires_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select m.id, (m.scope->>'propertyId')::uuid, m.expires_at
  from workspace.memberships m
  join identity.identities i on i.person_ref = m.person_ref
  where i.auth_user_id = auth.uid()
    and i.erased_at is null
    and m.state = 'active'
    and (m.expires_at is null or m.expires_at > now())
    and m.scope is not null
    and m.scope ? 'propertyId';
$$;

comment on function workspace.current_property_scope() is
  'The caller''s own live, scoped memberships, resolved to the property_id each one narrows to (WP 2.4) — the missing half of workspace.current_memberships()''s own new scope-null filter. Reachable only via api.current_property_scope(); not SECURITY DEFINER itself, granted to nobody.';

create or replace function api.current_property_scope()
returns table (property_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select property_id from workspace.current_property_scope();
$$;

comment on function api.current_property_scope() is
  'Delegate for workspace.current_property_scope() (WP 2.4) — the property_ids a scoped grant currently narrows the caller to. Referenced directly from property.properties/locations/assets/asset_facets/documents'' own isolation policies, alongside api.current_workspace_memberships(), never in place of it.';

revoke all on function workspace.current_property_scope() from public, anon, authenticated, service_role;
revoke all on function api.current_property_scope() from public, anon, service_role;
grant execute on function api.current_property_scope() to authenticated;

-- =========================================================================
-- 3 · The five property.* isolation policies — each gains one OR-branch: a real, scoped
-- membership over this row's own property, alongside the unchanged unscoped-membership
-- check. DROP POLICY, not ALTER POLICY — matching every policy redefinition already in
-- this codebase (0094, 0160).

drop policy if exists "workspace members can view properties" on property.properties;
create policy "workspace members can view properties"
  on property.properties for select
  to authenticated
  using (
    steward_workspace_id in (select workspace_id from api.current_workspace_memberships())
    or id in (select property_id from api.current_property_scope())
  );

drop policy if exists "workspace members can view locations" on property.locations;
create policy "workspace members can view locations"
  on property.locations for select
  to authenticated
  using (
    property_id in (
      select p.id from property.properties p
      where p.steward_workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
    or property_id in (select property_id from api.current_property_scope())
  );

drop policy if exists "workspace members can view assets" on property.assets;
create policy "workspace members can view assets"
  on property.assets for select
  to authenticated
  using (
    property_id in (
      select p.id from property.properties p
      where p.steward_workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
    or property_id in (select property_id from api.current_property_scope())
  );

drop policy if exists "workspace members can view asset_facets" on property.asset_facets;
create policy "workspace members can view asset_facets"
  on property.asset_facets for select
  to authenticated
  using (
    asset_id in (
      select a.id from property.assets a
      join property.properties p on p.id = a.property_id
      where p.steward_workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
    or asset_id in (
      select a.id from property.assets a
      where a.property_id in (select property_id from api.current_property_scope())
    )
  );

-- documents carry their own owning_workspace_id (the steward's, set at creation — unlike
-- the other four, not derivable from a property_id column on the row itself), so the new
-- branch instead resolves through property.document_attachments: a document is visible
-- under scope when it is attached to a property_id directly, or to an asset/location that
-- itself belongs to a property in scope. Workspace- and request-attached documents are
-- deliberately NOT covered by this branch — the acceptance bar names the Document twin,
-- not every document a workspace has ever created, and a request-photo document is
-- already a separate, request-scoped read (api.my_documents(p_request_id), WP 2.6).
drop policy if exists "workspace members can view documents" on property.documents;
create policy "workspace members can view documents"
  on property.documents for select
  to authenticated
  using (
    exists (select 1 from property.document_types dt where dt.type_key = documents.type_key and dt.is_public)
    or (
      auth.uid() is not null
      and (
        owning_workspace_id in (select workspace_id from api.current_workspace_memberships())
        or exists (
          select 1 from property.document_shares ds
          where ds.document_id = documents.id
            and ds.shared_with_workspace_id in (select workspace_id from api.current_workspace_memberships())
        )
        or exists (
          select 1
          from property.document_attachments da
          left join property.assets a on a.id = da.asset_id
          left join property.locations l on l.id = da.location_id
          where da.document_id = documents.id
            and coalesce(da.property_id, a.property_id, l.property_id) in (
              select property_id from api.current_property_scope()
            )
        )
      )
    )
  );

comment on policy "workspace members can view properties" on property.properties is
  'Unscoped workspace membership (unchanged) OR a real, currently-active scoped grant over this exact property (WP 2.4) — never broader. See 0161''s own header for why every other engine''s policy stays untouched.';
comment on policy "workspace members can view documents" on property.documents is
  'Unchanged unscoped-membership and explicit-share branches, plus a new scoped branch (WP 2.4): visible under a property scope only when attached to that property directly, or to one of its own assets/locations — never a workspace- or request-attached document, which the Location/Asset/Document twin does not name.';

-- =========================================================================
-- 4 · SEVEN READ FUNCTIONS THAT DO NOT MERELY RELY ON RLS — EACH BAKES IN ITS OWN
-- `join workspace.current_memberships()` GATE, CHECKED DIRECTLY, NOT ASSUMED
--
-- RLS is the outer gate every plain table read passes through; it is not the only one.
-- `property.resolve_property()` and six siblings each additionally, redundantly, join
-- current_memberships() themselves — meaning fixing RLS alone would have left every one
-- of them still returning nothing for a real, valid scoped grant, an easy way for this
-- fix to have looked complete while actually being half-done. Found by grepping every
-- function body in property/work/api for the string, not assumed from the five policies
-- alone.
--
-- The same signature-and-return-type-unchanged reasoning as workspace.current_memberships()
-- above applies to all seven: CREATE OR REPLACE, no DROP FIRST needed.
--
-- WHAT IS DELIBERATELY *NOT* EXTENDED, AND WHY — NAMED HERE SO IT READS AS A DECISION,
-- NOT AN OMISSION
--
--   property.my_properties() — "every property I steward," a different question from "the
--     one property I've been granted temporary access to." A scoped grant does not make a
--     foreign property appear in a contractor's own property list; they reach it through
--     the request/engagement context that granted it, via resolve_property(id) and its
--     six siblings below, exactly as a real client would.
--   property.timeline_segment() — reads platform.events directly and folds in
--     maintenance/conversation/message subject events, a materially broader disclosure
--     than "Location/Asset/Document" and not named by WP 2.4's own acceptance bar. A real,
--     plausible future enhancement, not assumed here (ADR-0010's own restraint).
--   property.documents_for_service_request() — legacy-request-photo-keyed, unrelated to
--     the property twin.
--   Every work.* function in the earlier grep (accept_quote_for_caller,
--     create_request_for_caller, my_maintenance_obligations, my_quotes, ... 20 more) —
--     every one is either a MUTATION (a scoped grant must never authorize creating,
--     accepting, or cancelling anything on the customer's behalf — a materially larger
--     escalation than read access) or a marketplace/maintenance READ this migration's own
--     §3 header already named as deliberately excluded. workspace.current_memberships()'s
--     own new scope-null filter (§1) already protects every one of these automatically;
--     nothing here needed to change for that protection to hold.

create or replace function property.resolve_property(p_property_id uuid)
returns table (id uuid, name text, jurisdiction text, steward_workspace_id uuid, steward_since timestamptz)
language sql
stable
set search_path = ''
as $$
  select p.id, p.name, p.jurisdiction, p.steward_workspace_id, p.steward_since
  from property.properties p
  where p.id = p_property_id
    and (
      p.steward_workspace_id in (select workspace_id from workspace.current_memberships())
      or p.id in (select property_id from workspace.current_property_scope())
    );
$$;

create or replace function property.resolve_asset(p_asset_id uuid)
returns table (
  id uuid, name text, type text, make text, model text, serial_number text,
  location_id uuid, placed_since timestamptz, room_label text,
  acquired_on date, installed_on date, expected_service_life_months integer,
  warranty_expires_on date, condition text, lifecycle_state text,
  photo_path text, notes text, source text, ai_suggestion jsonb,
  parent_asset_id uuid, created_at timestamptz, updated_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    a.id, a.name, a.type, a.make, a.model, a.serial_number,
    a.location_id, a.placed_since, a.room_label,
    a.acquired_on, a.installed_on, a.expected_service_life_months,
    a.warranty_expires_on, a.condition, a.lifecycle_state,
    a.photo_path, a.notes, a.source, a.ai_suggestion,
    a.parent_asset_id, a.created_at, a.updated_at
  from property.assets a
  where a.id = p_asset_id
    and (
      a.property_id in (
        select p.id from property.properties p
        where p.steward_workspace_id in (select workspace_id from workspace.current_memberships())
      )
      or a.property_id in (select property_id from workspace.current_property_scope())
    );
$$;

create or replace function property.resolve_document(p_document_id uuid)
returns table (
  id uuid, owning_workspace_id uuid, type_key text, storage_bucket text, storage_path text,
  issuer text, valid_from date, valid_until date, caption text,
  version_since timestamptz, created_at timestamptz, updated_at timestamptz
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
          or exists (
            select 1
            from property.document_attachments da
            left join property.assets a on a.id = da.asset_id
            left join property.locations l on l.id = da.location_id
            where da.document_id = d.id
              and coalesce(da.property_id, a.property_id, l.property_id) in (
                select property_id from workspace.current_property_scope()
              )
          )
        )
      )
    );
$$;

create or replace function property.locations_for_property(p_property_id uuid)
returns table (id uuid, parent_id uuid, name text, type text, path ltree)
language sql
stable
set search_path = ''
as $$
  select l.id, l.parent_id, l.name, l.type, l.path
  from property.locations l
  where l.property_id = p_property_id
    and l.retired_at is null
    and (
      l.property_id in (
        select p.id from property.properties p
        where p.steward_workspace_id in (select workspace_id from workspace.current_memberships())
      )
      or l.property_id in (select property_id from workspace.current_property_scope())
    )
  order by l.path;
$$;

create or replace function property.my_assets(p_property_id uuid)
returns table (
  id uuid, name text, type text, make text, model text, serial_number text,
  location_id uuid, placed_since timestamptz, room_label text,
  acquired_on date, installed_on date, expected_service_life_months integer,
  warranty_expires_on date, condition text, lifecycle_state text,
  photo_path text, notes text, source text, ai_suggestion jsonb,
  parent_asset_id uuid, created_at timestamptz, updated_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    a.id, a.name, a.type, a.make, a.model, a.serial_number,
    a.location_id, a.placed_since, a.room_label,
    a.acquired_on, a.installed_on, a.expected_service_life_months,
    a.warranty_expires_on, a.condition, a.lifecycle_state,
    a.photo_path, a.notes, a.source, a.ai_suggestion,
    a.parent_asset_id, a.created_at, a.updated_at
  from property.assets a
  where a.property_id = p_property_id
    and (
      a.property_id in (
        select p.id from property.properties p
        where p.steward_workspace_id in (select workspace_id from workspace.current_memberships())
      )
      or a.property_id in (select property_id from workspace.current_property_scope())
    );
$$;

create or replace function property.my_documents(
  p_property_id  uuid default null,
  p_location_id  uuid default null,
  p_asset_id     uuid default null,
  p_workspace_id uuid default null,
  p_request_id   uuid default null
)
returns table (
  id uuid, owning_workspace_id uuid, type_key text, storage_bucket text, storage_path text,
  issuer text, valid_from date, valid_until date, version_since timestamptz,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if num_nonnulls(p_property_id, p_location_id, p_asset_id, p_workspace_id, p_request_id) <> 1 then
    raise exception 'property.my_documents: exactly one subject must be given'
      using errcode = 'invalid_parameter_value';
  end if;

  -- A REAL, PRE-EXISTING BUG, FOUND HERE BY WP 2.4's OWN ADVERSARIAL VERIFICATION, FIXED
  -- IN THE SAME BREATH — NOT INTRODUCED BY THIS MIGRATION
  --
  -- The subject match (five OR'd clauses) and the visibility check (owning workspace, or
  -- shared, or now scoped) were never actually parenthesised together as one
  -- `(subject) AND (visibility)` — SQL's own AND-binds-tighter-than-OR rule silently
  -- parsed the original 0149 text as `A or B or C or D or (E and visibility)`. Only the
  -- LAST subject clause (p_request_id) was ever really gated by the visibility check; a
  -- caller supplying p_property_id, p_location_id, p_asset_id, or p_workspace_id instead
  -- got every attached document back with NO visibility check at all, for any subject id
  -- they could name. Never exploited by this codebase's own client (fetchRequestPhotos()
  -- has only ever called this with p_request_id, the one accidentally-safe parameter),
  -- but a real, live vulnerability the moment anything called it with p_property_id — as
  -- this migration's own scope feature is the first thing that ever does. Explicit
  -- parentheses now enforce the always-intended grouping.
  return query
    select d.id, d.owning_workspace_id, d.type_key, d.storage_bucket, d.storage_path, d.issuer,
           d.valid_from, d.valid_until, d.version_since, d.created_at, d.updated_at
    from property.documents d
    join property.document_attachments da on da.document_id = d.id
    where (
      (p_property_id is not null and da.property_id = p_property_id)
      or (p_location_id is not null and da.location_id = p_location_id)
      or (p_asset_id is not null and da.asset_id = p_asset_id)
      or (p_workspace_id is not null and da.workspace_id = p_workspace_id)
      or (p_request_id is not null and da.request_id = p_request_id)
    )
    and (
      d.owning_workspace_id in (select workspace_id from workspace.current_memberships())
      or exists (
        select 1 from property.document_shares ds
        where ds.document_id = d.id
          and ds.shared_with_workspace_id in (select workspace_id from workspace.current_memberships())
      )
      -- Scoped access (WP 2.4): only the property/location/asset subject branches — a
      -- workspace- or request-attached document is never in scope, matching the RLS
      -- policy's own identical restraint above.
      or (
        p_property_id is not null
        and p_property_id in (select property_id from workspace.current_property_scope())
      )
      or (
        p_location_id is not null
        and exists (
          select 1 from property.locations l
          where l.id = p_location_id
            and l.property_id in (select property_id from workspace.current_property_scope())
        )
      )
      or (
        p_asset_id is not null
        and exists (
          select 1 from property.assets a
          where a.id = p_asset_id
            and a.property_id in (select property_id from workspace.current_property_scope())
        )
      )
    );
end;
$$;

create or replace function property.assemble_twin(p_property_id uuid)
returns table (
  property_id uuid, name text, jurisdiction text, steward_workspace_id uuid, steward_since timestamptz,
  location_count bigint, asset_count bigint, document_count bigint,
  open_maintenance_obligation_count bigint, service_record_count bigint
)
language sql
stable
set search_path = ''
as $$
  select
    p.id,
    p.name,
    p.jurisdiction,
    p.steward_workspace_id,
    p.steward_since,
    (select count(*) from property.locations l where l.property_id = p.id),
    (select count(*) from property.assets a where a.property_id = p.id),
    (select count(*) from property.document_attachments da
       where da.property_id = p.id
          or da.location_id in (select id from property.locations where property_id = p.id)
          or da.asset_id in (select id from property.assets where property_id = p.id)),
    (select count(*) from work.maintenance_obligations mo
       where mo.status = 'open'
         and (
           mo.asset_id in (select id from property.assets where property_id = p.id)
           or mo.location_id in (select id from property.locations where property_id = p.id)
         )),
    (select count(*) from work.service_records sr where sr.property_id = p.id)
  from property.properties p
  where p.id = p_property_id
    and (
      p.steward_workspace_id in (select workspace_id from workspace.current_memberships())
      or p.id in (select property_id from workspace.current_property_scope())
    );
$$;

comment on function property.resolve_property(uuid) is
  'Extended (WP 2.4): a real, active scoped grant over this exact property now resolves it too, alongside the unchanged unscoped-membership branch.';
comment on function property.resolve_asset(uuid) is
  'Extended (WP 2.4): resolves under a scoped grant over the asset''s own property, alongside the unchanged unscoped-membership branch.';
comment on function property.resolve_document(uuid) is
  'Extended (WP 2.4): resolves under a scoped grant reached through property.document_attachments (property, or an asset/location under it), alongside the unchanged public/owning-workspace/share branches — never a workspace- or request-attached document.';
comment on function property.locations_for_property(uuid) is
  'Extended (WP 2.4): resolves under a scoped grant over the location''s own property, alongside the unchanged unscoped-membership branch.';
comment on function property.my_assets(uuid) is
  'Extended (WP 2.4): resolves under a scoped grant over the property, alongside the unchanged unscoped-membership branch.';
comment on function property.my_documents(uuid, uuid, uuid, uuid, uuid) is
  'Extended (WP 2.4): the property/location/asset subject branches now also resolve under a scoped grant — the workspace/request subject branches are deliberately unchanged, matching the RLS documents policy''s own restraint.';
comment on function property.assemble_twin(uuid) is
  'Extended (WP 2.4): the whole twin summary — including its maintenance/service-record counts, which are twin-level facts, not row-level history — resolves under a scoped grant over the property, alongside the unchanged unscoped-membership branch. Deliberately does not extend property.timeline_segment(), a materially broader disclosure WP 2.4''s own acceptance bar does not name.';

-- =========================================================================
-- 5 · authenticated GAINS USAGE ON SCHEMA property + SELECT ON EXACTLY THE FIVE
-- RLS-GATED TABLES §3 ALREADY NARROWS — THE MISSING BASE GRANT, FOUND RUNNING THIS
-- MIGRATION'S OWN ADVERSARIAL DIAGNOSTIC, NOT ASSUMED
--
-- Every one of the five property.* RLS policies already existed before this migration,
-- built in Epics 06-08 with the clear intent that `authenticated` would eventually read
-- them directly under RLS (ROLES.md §2.4's own "Not yet: authenticated on the six
-- workspace-scoped tiers... Opened per table, by the epic that ships a direct-read path
-- for it" — this is that epic). The grant itself was simply never added: nothing before
-- this work package had ever exercised a real `authenticated` session reading
-- property.properties directly (every prior verification of these tables went through
-- either a superuser psql session or a SECURITY DEFINER api.* delegate, which needs no
-- grant on the underlying table at all) — the identical blind spot already found and
-- fixed for schema `platform` (0158) and schema `work` (0159), now found a third time
-- here, the same way: this migration's own VERIFY_SCOPED_MEMBERSHIP_AUTHORIZATION.sql
-- diagnostic could not even execute a direct SELECT against property.properties as
-- `authenticated` without it. GRANT SELECT only — never INSERT/UPDATE/DELETE; every write
-- stays behind its own caller-checked api.* delegate (WP 1.4-1.7), unchanged. RLS (§3)
-- still does the real narrowing on top of this; the grant alone permits nothing extra.

grant usage on schema property to authenticated;

grant select on
  property.properties,
  property.locations,
  property.assets,
  property.asset_facets,
  property.documents
to authenticated;
