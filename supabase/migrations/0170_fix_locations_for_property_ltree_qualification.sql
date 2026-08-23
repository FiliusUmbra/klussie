-- Fix: property.locations_for_property() declared its return type as bare `ltree`,
-- not `extensions.ltree` — found live, while applying the migration backlog for Slice 4.
--
-- WHAT HAPPENED
--
-- 0136 (Epic 07 WP 1.1) declared this function correctly:
-- `path extensions.ltree` — matching 0020's own instruction, restated at every other
-- ltree call site in this codebase (0043, 0044, 0046, 0047, 0121, 0123, 0136): "an ltree
-- column is declared as extensions.ltree... Qualifying explicitly is correct... for a
-- migration [that runs with] `set search_path = ''`." 0161 (WP 2.4, adding the scoped-
-- membership OR-branch to this and four sibling functions) re-declared this one
-- function's return type as bare `ltree` — a real regression, not a stylistic
-- difference: under `set search_path = ''` (this function's own clause, unchanged since
-- 0136), an unqualified `ltree` fails to resolve at CREATE time unless the connection
-- applying the migration happens to have `extensions` in its own session search_path.
--
-- WHY THIS WAS INVISIBLE UNTIL NOW
--
-- A prior session applied 0161 through a connection whose own search_path included
-- `extensions` (a normal psql session's default, `"$user", public`, does not — but
-- Supabase's own SQL editor or a differently-configured client might), so the bare
-- `ltree` resolved successfully at CREATE time and the function was born with a
-- correctly-typed `path` column regardless of what its own source text says — Postgres
-- resolves a type name once, at CREATE FUNCTION time, into a fixed OID; nothing about
-- calling the function afterward re-parses the original text. The bug was real but
-- silent: invisible to every test in this codebase (none re-run migrations against a
-- live connection with an empty search_path) and invisible to the running application
-- (the function works correctly once created). It surfaced only running
-- `npx supabase db push --linked` against a database that already had 0161's own net
-- effect applied — `ERROR: type ltree does not exist (SQLSTATE 42704)` — which is also
-- exactly what `supabase db push` against a genuinely EMPTY database (ENVIRONMENTS.md
-- §4's own "all migrations applied cleanly from empty" acceptance line) would hit.
--
-- WHY A NEW MIGRATION, NOT AN EDIT TO 0161
--
-- ENVIRONMENTS.md's own acceptance criterion is migrations replayed "with no file
-- modified" — 0161 is not touched. This migration does exactly what 0161's own version
-- already does, functionally identical (same scoped-membership OR-branch, same
-- ordering), correcting only the one qualification 0161 got wrong. Once this migration
-- exists, an empty-database replay of the full chain succeeds end to end again — the
-- gap 0161 alone left in that acceptance property is closed by 0161-then-0170 together,
-- not by rewriting history.

create or replace function property.locations_for_property(p_property_id uuid)
returns table (id uuid, parent_id uuid, name text, type text, path extensions.ltree)
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

comment on function property.locations_for_property(uuid) is
  'Extended (WP 2.4): resolves under a scoped grant over the location''s own property, alongside the unchanged unscoped-membership branch. Return type corrected to extensions.ltree (0170) — 0161''s own version declared bare ltree, which only ever resolved because the session that first applied 0161 happened to have extensions in its own search_path; a strict-search_path replay (an empty database, or `supabase db push`) fails on it otherwise. No behavioural change from 0161''s own version.';

-- No grant/revoke changes — 0161''s own posture (nobody but the api.* delegate) is
-- unchanged; this migration corrects the function body''s own type declaration only.
