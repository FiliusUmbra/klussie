-- Epic 06 WP02 — maintaining the path alongside the parent pointer.
--
-- SUPABASE_ARCHITECTURE.md §11.2: "The parent pointer is retained alongside as the
-- authoritative structure; the path is a maintained denormalisation of it, and can be
-- recomputed if it ever disagrees." This migration is what maintains it on INSERT.
--
-- ONLY ON INSERT — RE-PARENTING IS DELIBERATELY NOT THIS TRIGGER'S JOB
--
-- Moving a location changes the path of every descendant, not just the moved row's own —
-- something a single-row BEFORE UPDATE trigger cannot do (it fires once per updated row,
-- with no reach into the rest of the subtree). WP 06.05's property.reparent_location() does
-- the cascading rewrite explicitly, as one statement touching every affected row, in the
-- same transaction as the LocationTreeChanged event SUPABASE_ARCHITECTURE.md §11.2 requires.
-- This trigger only ever computes a NEW row's own path from a parent that (if any) already
-- has a correct one.
--
-- THE LABEL SCHEME
--
-- ltree labels are restricted to [A-Za-z0-9_]+ — a UUID's hyphens are not legal, so each
-- segment is the id with hyphens replaced by underscores. The property is the tree's own
-- root label, not a separate concept: every location's path starts with its property's
-- label, which is what lets containment be checked from the path alone (WP 06.04), with no
-- second join to confirm which property a location belongs to.
--
-- WHY THIS BUILDS PATHS AS TEXT, THEN CASTS ONCE, RATHER THAN CONCATENATING LTREE VALUES
--
-- `set search_path = ''` means every non-pg_catalog name must be schema-qualified —
-- migration 0023's own header names the trap ("coalesce... written bare"; "date_part
-- rather than extract"). ltree's own `||` concatenation operator lives in `extensions`,
-- same as the type itself, and an infix operator needs `OPERATOR(extensions.||)` to resolve
-- under an empty search_path — correct, but the least legible option available. Plain text
-- `||` is pg_catalog and always resolves; building the path as text and casting to
-- `extensions.ltree` exactly once, at the end, gets the identical result without it. The
-- cast itself (`::extensions.ltree`) is resolved by type OID via pg_cast, not by name
-- search, so it needs no such qualification.
--
-- CONVENTION, NOT A STRUCTURAL GUARD — RECORDED AS A DEFERRED HARDENING ITEM
--
-- Nothing in this migration stops a future caller from issuing a plain `update
-- property.locations set parent_id = ...` outside property.reparent_location() and leaving
-- every descendant's path stale. Today that risk is theoretical — no application code and
-- no other engine reaches this table yet — so a guard trigger blocking direct parent_id
-- writes would be defensive structure with nothing to defend against yet (ADR-0010's
-- restraint). The convention is stated here, in property.reparent_location()'s own header
-- (WP 06.05), and in property.locations' own table comment: re-parenting a location happens
-- through that function, never through a direct UPDATE. Whichever epic first gives this
-- table a real write path should revisit whether that convention needs to become structural.

create or replace function property.locations_maintain_path()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_own_label       text;
  v_property_label  text;
  v_parent_path     text;
begin
  v_own_label := replace(new.id::text, '-', '_');

  if new.parent_id is null then
    select replace(p.id::text, '-', '_') into v_property_label
    from property.properties p
    where p.id = new.property_id;

    if v_property_label is null then
      raise exception 'property % does not exist', new.property_id;
    end if;

    new.path := (v_property_label || '.' || v_own_label)::extensions.ltree;
  else
    -- v_parent_path is `text`, not extensions.ltree — l.path::text sidesteps ever needing
    -- ltree's own || operator, which would otherwise need OPERATOR(extensions.||) to
    -- resolve under this empty search_path. See this migration's header.
    select l.path::text, l.property_id into v_parent_path, new.property_id
    from property.locations l
    where l.id = new.parent_id;

    if v_parent_path is null then
      raise exception 'parent location % does not exist', new.parent_id;
    end if;

    -- A child inherits its parent's property, regardless of what the caller supplied —
    -- a location cannot straddle two properties, and the path (which encodes the
    -- property as its root label) would disagree with a mismatched property_id otherwise.
    new.path := (v_parent_path || '.' || v_own_label)::extensions.ltree;
  end if;

  return new;
end;
$$;

comment on function property.locations_maintain_path() is
  'Computes a new location''s own path from its parent (if any) and its own id, on INSERT only. Never touches an existing row''s path — that is property.reparent_location()''s job (WP 06.05), which rewrites a whole subtree in one statement. See this migration''s header for why a single-row trigger cannot do that job.';

drop trigger if exists locations_maintain_path on property.locations;
create trigger locations_maintain_path
  before insert on property.locations
  for each row execute function property.locations_maintain_path();
