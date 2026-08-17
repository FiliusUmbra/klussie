-- Epic 07 WP06 — dual-write: household_items writes also write property.assets.
--
-- Step 3 of the migration pattern (IMPLEMENTATION_ROADMAP.md §3): writes go to both
-- structures, public.household_items stays authoritative, and nothing reads property.assets
-- yet (WP 07.08, a separate later package).
--
-- WHY A TRIGGER, NOT A CHANGE TO src/lib/householdItems.js
--
-- The roadmap's own WP 07.06 scope note reads "src/lib/householdItems.js's create/update/
-- delete functions gain a second write." Building it found a closer precedent already
-- settled in this exact codebase: migration 0027's identity dual-write. Its own header:
-- "That makes the trigger the only place a third write can be transactional with the
-- first two. A write issued from the client after [the primary write] returns is a
-- separate request against an already-committed transaction: a dropped connection, a
-- closed tab or a failed redirect leaves [the primary rows] with no [mirror]." Every word
-- of that applies here unchanged — an application-level second call from
-- src/lib/householdItems.js would be two round trips, not one transaction, and would
-- silently under-mirror on exactly the connection failures ADR-0024's "once per request
-- becomes once per statement" reasoning cares about. A trigger keeps the two writes atomic
-- and needs no client code change at all: src/lib/householdItems.js is untouched by this
-- migration.
--
-- WHERE THE ASSET'S IDENTIFIER COMES FROM
--
-- ADR-0022 rules out a no-argument uuid_v7() engines call at runtime, and reserves
-- platform.uuid_v7_at() for backfills — but also documents its own precedented exception:
-- migration 0027's handle_new_user() mints via platform.uuid_v7_at(now()) whenever the
-- application could not have supplied an identifier through the row it wrote (a signup made
-- outside the application entirely). public.household_items has no metadata channel the
-- way auth.users does (signUp's options.data), and WP 07.05's backfill promised this table
-- stays untouched — adding one now would break that promise for a narrower reason than it
-- was made. So this migration takes 0027's documented fallback path, not its primary path:
-- the trigger mints, exactly as ADR-0022 already anticipated for "identifiers for rows the
-- application did not create."
--
-- A REAL BUG FOUND WHILE BUILDING THIS, BEFORE ANY DUAL-WRITE ROW EXISTED
--
-- WP 07.05's household_items_id column (0052) is a plain `references public.household_items
-- (id)` foreign key — no ON DELETE clause, so it defaults to NO ACTION. The moment any
-- property.assets row is linked to a household_items row (which WP 07.05's backfill already
-- did, for every existing item), deleteHouseholdItem()'s `delete from household_items where
-- id = ...` would fail with a foreign-key violation: Postgres refuses to delete a row still
-- referenced, and nothing before this migration cleared the reference first. That made
-- deleteHouseholdItem() already latently broken for any backfilled item on any environment
-- that has run 0052 — this migration is what turns "latent" into "guaranteed," since dual-
-- write is about to link every new item too, not just backfilled ones. Found by the same
-- means as Epic 06's ltree bug: reasoning through what the existing DDL actually declares,
-- not by running anything.
--
-- The fix is not CASCADE. Migration 0048's own words: "DELETE is withheld from both tables
-- — an asset is retired, never removed (§14)." Deleting the mirrored asset when its source
-- item is deleted would violate that on the first real delete. ON DELETE SET NULL is what
-- the column's own nature calls for instead: household_items_id is "bookkeeping only, not
-- part of the domain model" (0052's own comment) — once the household_items row is gone,
-- there is nothing left to book-keep, and the asset itself survives, disposed (see below),
-- exactly as an asset with no remaining source of truth should.
--
-- The constraint is dropped and re-added by discovered name rather than a guessed literal
-- one (Postgres's own auto-generated name for an unnamed single-column FK is predictable,
-- but this migration does not trust that prediction unverified against a database it
-- cannot reach this session — the same posture ADR-0026 states for verifying a revoke
-- rather than assuming one).
--
-- WHAT "DELETE" MEANS FOR THE MIRROR
--
-- Never a row deletion (0048's own withheld-DELETE rule, restated above). A deleted
-- household_items row disposes its mirrored asset: lifecycle_state = 'disposed', the exact
-- value the state machine already reserves for exactly this (0048: "active/retired/
-- disposed... this platform's own lifecycle").
--
-- WHAT "NO PROPERTY RESOLVES" MEANS
--
-- The same "reconciled against, not defended against" posture 0052's backfill takes for the
-- identical join (its own header: "a household_items row whose owner has no property is
-- therefore evidence of an already-broken invariant elsewhere, not something this migration
-- should paper over"). The insert trigger below does not fail the caller's item save over a
-- resolution gap the read path never asked about — it mirrors nothing, silently, and
-- WP 07.07's reconciliation is what surfaces the gap.
--
-- NO SELF-HEALING ON UPDATE
--
-- If the insert mirror found no property and wrote nothing, a later update mirror simply
-- updates zero rows — matched by household_items_id, which does not exist yet. This
-- migration does not attempt to insert-on-update; that would silently create an asset
-- days or months after the item it mirrors, backdated to nothing in particular, which is a
-- worse outcome than a gap WP 07.07 can actually see and explain.
--
-- THE SHARED RESOLVER — WRITTEN ONCE, NOT COPIED
--
-- property.resolve_property_for_owner() is the same five-way join WP 07.05's backfill
-- wrote inline (household_items.owner_id cannot appear here — this function takes the
-- owner directly). Factored into one callable so this migration's insert trigger and
-- WP 07.07's reconciliation diagnostic both call the *same* rule rather than each keeping
-- their own copy of it — the "never duplicate ownership or business logic" standard this
-- session is now held to, applied for the first time in this roadmap to a join that
-- previously existed only inline (0052 is frozen and unaffected; this is the second time
-- the join is written, and the last).

-- =========================================================================
-- THE FOREIGN KEY FIX — household_items_id no longer blocks a delete

do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'property.assets'::regclass
    and contype = 'f'
    and conkey = array[(
      select attnum from pg_attribute
      where attrelid = 'property.assets'::regclass and attname = 'household_items_id'
    )];

  if v_constraint_name is not null then
    execute format('alter table property.assets drop constraint %I', v_constraint_name);
  end if;
end;
$$;

alter table property.assets
  add constraint assets_household_items_id_fkey
  foreign key (household_items_id) references public.household_items (id)
  on delete set null;

comment on column property.assets.household_items_id is
  'Bookkeeping only, not part of the domain model (PLATFORM_DOMAIN_MODEL.md §11 does not describe an asset knowing its own migration provenance) — which household_items row this asset was backfilled from or mirrors. ON DELETE SET NULL (0053): once the source row is gone there is nothing left to book-keep, and the asset itself is not deleted with it (0048: an asset is retired, never removed) — it is disposed by the same migration''s delete trigger first.';

-- =========================================================================
-- THE SHARED RESOLVER — property.resolve_property_for_owner()

create or replace function property.resolve_property_for_owner(p_owner_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select p.id
  from identity.identities i
  join workspace.memberships m
    on m.person_ref = i.person_ref
    and m.role = 'owner'
    and m.state = 'active'
    and (m.expires_at is null or m.expires_at > now())
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal'
  join property.properties p on p.steward_workspace_id = w.id
  where i.auth_user_id = p_owner_id;
$$;

comment on function property.resolve_property_for_owner(uuid) is
  'The property a given auth user''s Personal Workspace stewards, if any — the same join WP 07.05''s backfill (0052) wrote inline, factored here so this migration''s insert trigger and RECONCILE_ASSETS.sql (WP 07.07) share one definition rather than two copies. Erased identities are not excluded, matching 0052''s own reasoning exactly: this resolves existing ownership, not new structure. Not SECURITY DEFINER, granted to nobody — reachable only as a nested call from a SECURITY DEFINER context (the triggers below) or from a diagnostic running with the migration runner''s own privileges.';

revoke all on function property.resolve_property_for_owner(uuid) from public, anon, authenticated, service_role;

-- =========================================================================
-- THE MIRROR — INSERT

create or replace function public.household_items_mirror_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property_id uuid;
begin
  v_property_id := property.resolve_property_for_owner(new.owner_id);

  if v_property_id is null then
    return new;
  end if;

  insert into property.assets (
    id, property_id, name, type, make, model, room_label, photo_path,
    acquired_on, notes, source, ai_suggestion, household_items_id,
    created_at, updated_at
  ) values (
    platform.uuid_v7_at(now()), v_property_id, new.name, new.category, new.brand, new.model,
    new.room, new.photo_path, new.purchased_on, new.notes, new.source, new.ai_suggestion,
    new.id, now(), now()
  )
  on conflict (household_items_id) where household_items_id is not null do nothing;

  return new;
end;
$$;

comment on function public.household_items_mirror_insert() is
  'Dual-write mirror for Epic 07 step 3 (WP 07.06): every new household_items row gets a property.assets row, unplaced, mirroring 0052''s own field mapping. Mints the asset''s id in SQL — the ADR-0022 fallback path 0027''s handle_new_user() already established, taken because household_items has no metadata channel to carry an application-generated id through. Silently mirrors nothing when the owner resolves to no property (WP 07.07''s reconciliation is what surfaces that, not this trigger failing the caller''s save). Temporary by construction — removed when step 6 retires household_items.';

drop trigger if exists household_items_mirror_insert on public.household_items;
create trigger household_items_mirror_insert
  after insert on public.household_items
  for each row
  execute function public.household_items_mirror_insert();

-- =========================================================================
-- THE MIRROR — UPDATE
--
-- WHEN guards on exactly the columns mirrored, the same discipline 0027's
-- on_profile_updated trigger uses and for the same reason: without it, a column
-- household_items has but property.assets does not mirror would still bump the mirrored
-- row's updated_at, and WP 07.07's reconciliation would read that as drift. Every column
-- setHouseholdItemPhoto() and updateHouseholdItem() can touch is named here, so both
-- callers are covered by one trigger without either knowing this migration exists.

create or replace function public.household_items_mirror_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update property.assets
  set name = new.name,
      type = new.category,
      make = new.brand,
      model = new.model,
      room_label = new.room,
      photo_path = new.photo_path,
      acquired_on = new.purchased_on,
      notes = new.notes,
      source = new.source,
      ai_suggestion = new.ai_suggestion,
      updated_at = now()
  where household_items_id = new.id;

  return new;
end;
$$;

comment on function public.household_items_mirror_update() is
  'Dual-write mirror for Epic 07 step 3 (WP 07.06): keeps mirrored asset attributes in step with public.household_items. A no-op, by design, when the insert mirror found no property earlier — no self-healing insert here (this migration''s own header explains why). Temporary by construction — removed when step 6 retires household_items.';

drop trigger if exists household_items_mirror_update on public.household_items;
create trigger household_items_mirror_update
  after update on public.household_items
  for each row
  when (
    old.name is distinct from new.name
    or old.category is distinct from new.category
    or old.brand is distinct from new.brand
    or old.model is distinct from new.model
    or old.room is distinct from new.room
    or old.photo_path is distinct from new.photo_path
    or old.purchased_on is distinct from new.purchased_on
    or old.notes is distinct from new.notes
    or old.source is distinct from new.source
    or old.ai_suggestion is distinct from new.ai_suggestion
  )
  execute function public.household_items_mirror_update();

-- =========================================================================
-- THE MIRROR — DELETE
--
-- Disposes, never deletes (0048's own withheld-DELETE rule). Runs BEFORE the row is gone
-- rather than after, so it can still be matched by household_items_id — the FK's own
-- ON DELETE SET NULL only fires once the delete actually proceeds, and by then this trigger
-- has already recorded the disposal.

create or replace function public.household_items_mirror_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update property.assets
  set lifecycle_state = 'disposed', updated_at = now()
  where household_items_id = old.id
    and lifecycle_state <> 'disposed';

  return old;
end;
$$;

comment on function public.household_items_mirror_delete() is
  'Dual-write mirror for Epic 07 step 3 (WP 07.06): a deleted household_items row disposes its mirrored asset (0048: "an asset is retired, never removed") rather than deleting it. Runs BEFORE DELETE so household_items_id still matches; the column''s own ON DELETE SET NULL (this migration, above) is what clears the now-meaningless bookkeeping link once the delete itself proceeds. A no-op when no mirror exists. Temporary by construction — removed when step 6 retires household_items.';

drop trigger if exists household_items_mirror_delete on public.household_items;
create trigger household_items_mirror_delete
  before delete on public.household_items
  for each row
  execute function public.household_items_mirror_delete();
