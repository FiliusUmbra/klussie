-- Epic 06 WP04 — subtree containment as a first-class operation.
--
-- DATABASE_ARCHITECTURE.md §13: "Subtree containment must be answerable as a first-class
-- operation... A design that answers it by walking parents at query time will not survive
-- enterprise depth." ltree's own operators (<@ descendant-or-self, @> ancestor-or-self)
-- against the GiST-indexed path column (migration 0043) answer this as a single indexed
-- lookup regardless of tree depth — no recursive CTE anywhere in this migration.
--
-- WHY EVERY ltree OPERATOR BELOW IS WRITTEN OPERATOR(extensions.<op>)
--
-- `set search_path = ''` means every non-pg_catalog name must resolve by explicit schema
-- qualification — migration 0023's own header names this trap for functions ("coalesce...
-- written bare"). The same rule applies to infix operators: ltree's <@ and @> live in
-- `extensions`, the same schema as the type itself, and under an empty search_path
-- PostgreSQL cannot find them by their bare symbols. `OPERATOR(extensions.<@)` is the
-- documented way to reference an operator by schema-qualified name rather than by symbol
-- search. `nlevel()` is an ordinary function and is qualified the ordinary way,
-- `extensions.nlevel(...)`.
--
-- ENGINE-TO-ENGINE, NOT CLIENT-FACING — NO `api` DELEGATE IN THIS EPIC
--
-- SYSTEM_ARCHITECTURE.md §7.2's "public contract" (tree read, containment, ancestors and
-- descendants) is consumed by OTHER ENGINES — Workspace's scope resolution, Search — not
-- directly by a client. Neither consumer exists or is wired yet: ADR-0024 states plainly
-- "there is no location tree until Epic 06, and no consumer workspace uses scope," and
-- Search is Epic 20. Building an api-schema delegate now, with nothing to call it, would be
-- the same mistake ADR-0026's own "makes harder" section named for WP 03.08: a JavaScript
-- module (here, a client-facing SQL delegate) wrapping a function nothing yet calls. These
-- three stay in `property`, ungranted to any role, callable only by whichever engine's own
-- SECURITY DEFINER function is built the day it has a real containment question to ask —
-- following the exact grant-when-needed discipline ROLES.md §3 states and migration 0020
-- already held itself to ("a privilege is granted when there is a real query needing it").

-- =========================================================================
-- IS X WITHIN SUBTREE Y — including Y itself, per ltree's own <@ semantics

create or replace function property.location_within(p_location_id uuid, p_subtree_root_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from property.locations x, property.locations y
    where x.id = p_location_id
      and y.id = p_subtree_root_id
      and x.path OPERATOR(extensions.<@) y.path
  );
$$;

comment on function property.location_within(uuid, uuid) is
  'Is location p_location_id within the subtree rooted at p_subtree_root_id (including p_subtree_root_id itself)? A single indexed prefix match against the GiST-indexed path column, regardless of tree depth (DATABASE_ARCHITECTURE.md §13). Engine-to-engine only; no client-facing delegate exists in this epic.';

-- =========================================================================
-- ANCESTORS — nearest first, excluding the location itself

create or replace function property.location_ancestors(p_location_id uuid)
returns table (id uuid, name text, type text, path extensions.ltree)
language sql
stable
set search_path = ''
as $$
  select l.id, l.name, l.type, l.path
  from property.locations l
  where l.path OPERATOR(extensions.@>) (select loc.path from property.locations loc where loc.id = p_location_id)
    and l.id <> p_location_id
  order by extensions.nlevel(l.path) desc;
$$;

comment on function property.location_ancestors(uuid) is
  'Every ancestor of p_location_id, nearest parent first, excluding the location itself. Engine-to-engine only.';

-- =========================================================================
-- DESCENDANTS — topmost first, excluding the location itself

create or replace function property.location_descendants(p_location_id uuid)
returns table (id uuid, name text, type text, path extensions.ltree)
language sql
stable
set search_path = ''
as $$
  select l.id, l.name, l.type, l.path
  from property.locations l
  where l.path OPERATOR(extensions.<@) (select loc.path from property.locations loc where loc.id = p_location_id)
    and l.id <> p_location_id
  order by extensions.nlevel(l.path), l.path;
$$;

comment on function property.location_descendants(uuid) is
  'Every descendant of p_location_id, topmost first, excluding the location itself. Engine-to-engine only.';

-- =========================================================================
-- ACCESS — explicit, verified rather than assumed, the same discipline every logic
-- function in this pattern holds itself to, even where no default privilege is expected
-- to reach it.

revoke all on function property.location_within(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function property.location_ancestors(uuid) from public, anon, authenticated, service_role;
revoke all on function property.location_descendants(uuid) from public, anon, authenticated, service_role;
