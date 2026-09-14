-- Found live, 2026-09-14, during production database reconciliation (bringing
-- production's schema up from migration 0017 to 0223 after discovering it had never
-- received Epic 02 onward -- see that session's own notes for the full story).
--
-- WHAT WAS WRONG
--
-- Resetting production's public schema (`drop schema public cascade; create schema
-- public;`, needed to safely replay the full migration chain from empty) also destroyed
-- a baseline grant that has never lived in any migration file in this repository:
-- `USAGE ON SCHEMA public` and full CRUD on every `public.*` table, granted to `anon`
-- and `authenticated`. Every one of the 24 tables in `public` carries this identical
-- grant on staging -- confirmed by querying information_schema.table_privileges -- yet
-- grep across every migration in this repository finds not one explicit `grant ... to
-- anon` statement for any of them. This is a Supabase project-bootstrap default,
-- established once at project creation, outside this repository's own migration
-- history entirely -- migration 0019's own text is explicit about this: "Nothing to
-- public. The running product's access to public is untouched."
--
-- WHY THIS IS BEING TRACKED NOW, AFTER YEARS OF WORKING FINE UNTRACKED
--
-- It was never exercised before because nothing had ever reset `public` schema on a
-- real project. Re-applying it by hand after production's reset revealed a second,
-- sharper problem: the grant does not reliably survive a restart. It was manually
-- re-applied, then silently reverted by the project's own restart and (separately) its
-- pause/resume cycle -- reproduced twice, confirmed via `has_table_privilege()` directly
-- against the database, not just observed as flaky API behaviour. Whatever Supabase-side
-- mechanism restores a "default" grant posture on restart does not consider a plain,
-- untracked `GRANT` durable. A grant this codebase's own RLS-based security model has
-- always depended on being present needs to be re-establishable by replaying this
-- repository's own migration chain, not by trusting an out-of-band project default that
-- has now been observed to disappear.
--
-- WHY THIS IS SAFE -- RLS IS THE REAL GATE, NOT THIS GRANT
--
-- Every table this migration grants already has row level security enabled with its own
-- real policies. This migration grants nothing new in practice: it makes durable, in
-- this repository's own tracked history, exactly the baseline access every one of these
-- tables has always had in every environment that has ever worked. `GRANT` alone does
-- not bypass RLS -- a role still needs a policy to actually read or write any given row.
--
-- WHY `audit_log` AND `domain_events` ARE EXPLICITLY EXCLUDED, NOT SWEPT UP BY THE BLANKET
-- GRANT BELOW
--
-- 0192_revoke_audit_log_domain_events_client_grants.sql deliberately revoked anon/
-- authenticated's own direct CRUD grant on these two tables -- "no client policies at
-- all... nothing in the client should ever write directly to an audit trail" (0010's own
-- text, quoted in 0192's header). A blanket `grant all on all tables in schema public`
-- running after that migration in the chain would silently re-open exactly the gap 0192
-- closed. Re-revoked explicitly, immediately after the blanket grant, in this same
-- migration -- not left to depend on 0192 running again (it won't, `db push` never re-
-- applies an already-recorded migration) or on a reader noticing the ordering matters.
--
-- WHY `anon` GETS THE SAME GRANT AS `authenticated`, NOT JUST READ ACCESS
--
-- Matches exactly what every environment has always actually had (confirmed via the same
-- information_schema query) -- narrowing it now, in a migration whose only job is to
-- restore existing behaviour, would be a real, separate policy change dressed up as a
-- grant-posture fix. If `anon`'s access should be narrower than `authenticated`'s on any
-- of these tables, that is real, independent follow-up work informed by this table's own
-- RLS policies, not something to fold into restoring what was already there.

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

-- Re-close the one real, deliberate exception 0192 already established -- see this
-- migration's own header for why this can't be left implicit.
revoke all on public.audit_log from anon, authenticated;
revoke all on public.domain_events from anon, authenticated;
