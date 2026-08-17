-- Epic 07 WP05 — migrate existing household_items rows into property.assets.
--
-- PLATFORM_DOMAIN_MODEL.md §11: the asset is "the true anchor of maintenance history and
-- prediction." Step 2 of the six-step migration pattern (roadmap §3): the new structure is
-- populated and still unused. public.household_items remains authoritative, remains
-- written by the running application, and is not touched by this migration — WP 07.06
-- (dual-write) and WP 07.08 (the read switch) are separate, later packages, both
-- decomposed but not built this session (roadmap §17's own scope note).
--
-- THE FIRST BACKFILL IN THIS ROADMAP MOVING REAL, EXISTING DATA
--
-- Every prior backfill (0033, 0034, 0040) derived new rows from a table an earlier package
-- in the SAME epic had just created (identities, workspaces, properties). household_items
-- is migration 0016 — already in production, already written by real customers. This
-- migration reads it; it does not, and must not, write to it.
--
-- THE OWNERSHIP CHAIN
--
-- household_items.owner_id -> identity.identities (by auth_user_id) -> workspace.memberships
-- (owner, active, personal) -> workspace.workspaces -> property.properties (by
-- steward_workspace_id). Every link already exists and is guaranteed complete by
-- construction: WP 03.03 gives every identity exactly one Personal Workspace with an owner
-- membership, and WP 05.02 gives every live Personal Workspace exactly one property. A
-- household_items row whose owner has no property is therefore evidence of an already-
-- broken invariant elsewhere, not something this migration should paper over — it is
-- reconciled against, not defended against, the same posture every reconciliation in this
-- roadmap takes (§3: "a read-switch without a passing reconciliation is not permitted").
--
-- ERASED IDENTITIES ARE **NOT** EXCLUDED — A DELIBERATE DEPARTURE FROM MIGRATION 0033
--
-- 0033 excludes an erased identity because creating a NEW workspace for a person whose
-- personal data is already gone would manufacture structure nobody can reach. This
-- migration is different: it is migrating EXISTING data about a POSSESSION, not creating
-- new structure tied to an active identity. Erasure redacts identity.identities in place —
-- person_ref and auth_user_id both survive as keys (§11.4: "resolves to nothing," not
-- "the row is gone") — so the ownership chain to workspace and property is unaffected by
-- erasure, and an erased person's Personal Workspace still exists, stewarding whatever it
-- stewarded before. Excluding their items here would silently drop real inventory history
-- for no architectural reason.
--
-- IDEMPOTENT VIA A BOOKKEEPING COLUMN, NOT PART OF THE DOMAIN MODEL
--
-- household_items_id exists purely so re-running this migration is a no-op — the same role
-- a foreign-key-shaped join column plays in every backfill in this roadmap, but named
-- explicitly as bookkeeping here because, unlike person_ref or workspace_id, nothing in the
-- frozen architecture describes an asset as knowing which legacy row it came from. It is
-- read by nothing except this migration's own re-run guard.
--
-- category -> type, VERBATIM, NO TRANSLATION
--
-- household_items.category's six existing values (appliance, electronics, furniture,
-- garden, tool, other) all fit an unconstrained taxonomy without needing a mapping table —
-- property.assets.type simply has no check constraint to satisfy (migration 0048's own
-- header explains why the new column is deliberately more permissive than the old one).
--
-- room -> room_label, VERBATIM — SEE MIGRATION 0048'S OWN HEADER
--
-- Free text carried across unchanged; not a location reference, and not placed anywhere
-- (location_id and placed_since stay null for every backfilled asset — Epic 06 built no
-- location backfill for this to point at).

alter table property.assets
  add column if not exists household_items_id uuid
    references public.household_items (id);

create unique index if not exists assets_household_items_id_uidx
  on property.assets (household_items_id)
  where household_items_id is not null;

comment on column property.assets.household_items_id is
  'Bookkeeping only, not part of the domain model (PLATFORM_DOMAIN_MODEL.md §11 does not describe an asset knowing its own migration provenance) — which household_items row this asset was backfilled from, so re-running WP 07.05 is a no-op. Read by nothing except this migration''s own re-run guard.';

with candidates as (
  select
    hi.id as household_item_id,
    hi.name, hi.category, hi.room, hi.brand, hi.model, hi.photo_path,
    hi.purchased_on, hi.notes, hi.source, hi.ai_suggestion, hi.created_at,
    p.id as property_id,
    platform.uuid_v7_at(hi.created_at) as asset_id
  from public.household_items hi
  join identity.identities i on i.auth_user_id = hi.owner_id
  join workspace.memberships m
    on m.person_ref = i.person_ref
    and m.role = 'owner'
    and m.state = 'active'
    and (m.expires_at is null or m.expires_at > now())
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal'
  join property.properties p on p.steward_workspace_id = w.id
  where not exists (
    select 1 from property.assets a where a.household_items_id = hi.id
  )
)
insert into property.assets (
  id, property_id, name, type, make, model, room_label, photo_path,
  acquired_on, notes, source, ai_suggestion, household_items_id,
  created_at, updated_at
)
select
  asset_id, property_id, name, category, brand, model, room, photo_path,
  purchased_on, notes, source, ai_suggestion, household_item_id,
  created_at, now()
from candidates;
