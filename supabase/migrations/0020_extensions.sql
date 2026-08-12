-- Epic 01 WP03 — ltree and pg_cron, out of public.
--
-- SUPABASE_ARCHITECTURE.md §2: "Extensions live in their own schema and are never
-- installed into `public`." §11.2 chooses ltree for the location tree — containment
-- becomes a prefix match on an indexed path rather than a recursive walk per query — and
-- §18 gives cron the scheduled work: due-date evaluation, document expiry, workflow
-- timers, retention sweeps, archival, projection health.
--
-- Installed now, ahead of the epics that use them (06 for ltree, 10 onward for cron), so
-- that a later migration creating an `ltree` column is a schema change and not also an
-- infrastructure change.
--
-- WHERE THEY GO, AND WHY IT IS NOT THE SAME ANSWER TWICE
--
-- ltree is relocatable, so it goes in `extensions` — the schema Supabase already
-- provides and already uses for pgcrypto, uuid-ossp and pg_stat_statements. Creating an
-- eleventh schema of our own for one extension would be a second answer to a question the
-- platform has already answered.
--
-- pg_cron is NOT relocatable. `with schema extensions` is accepted and then silently
-- ignored: the extension registers in `pg_catalog` and creates its own `cron` schema for
-- its seven objects. Verified rather than assumed — see the work package. Writing the
-- clause anyway would put a line in this file that looks like it decides something and
-- does not, so it is omitted and the reason is here instead.
--
-- Either way `public` receives nothing, which is what §2 is protecting.
--
-- No grants. Nothing runs as an engine role yet, and docs/operations/ROLES.md §3 rule 1
-- is that a privilege is granted when there is a real query needing it. Epic 06 grants
-- `usage on schema extensions` to klussie_engine_property when it creates the first
-- ltree column.
--
-- Guarded, so re-running is a no-op. Rollback: `drop extension ltree;` and
-- `drop extension pg_cron;` — the second also drops the `cron` schema it created.

-- =========================================================================
-- LTREE — the location tree's materialised path (§11.2)
--
-- Note for the migration that first uses it: `extensions` is not on the default
-- search_path for a migration, so an ltree column is declared as `extensions.ltree` and
-- its operator class as `extensions.gist_ltree_ops`. Qualifying explicitly is correct
-- regardless — a type resolved through search_path is a type that can be resolved
-- differently later.

create extension if not exists ltree with schema extensions;

-- =========================================================================
-- PG_CRON — scheduled work (§18)
--
-- Deliberately no schema clause; see the header. The extension lands in `pg_catalog` and
-- brings a `cron` schema with it, both of which are pg_cron's decision and not ours.
--
-- No job is scheduled here. An extension with no jobs runs nothing; the scheduler is
-- available for the epics that need it and idle until then.

create extension if not exists pg_cron;
