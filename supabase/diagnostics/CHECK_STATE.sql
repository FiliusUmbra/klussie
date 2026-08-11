-- ==========================================================================
-- PASTE THIS WHOLE FILE INTO THE SUPABASE SQL EDITOR AND RUN IT.
-- It is a read-only diagnostic: it reads catalog tables and changes nothing.
-- ==========================================================================
--
-- Why this exists: this repository keeps no migration ledger — 0001_init.sql's own
-- header says "paste this into the SQL Editor" — so nothing records which migration
-- files have already been applied. Re-running one then fails with a bare
-- `column ... already exists`, which tells you nothing about whether the rest of that
-- file landed. This reports the real state of everything 0013, 0014 and 0015 touch,
-- including the parts that are not columns (two constraints and two function bodies).
--
-- Lives outside supabase/migrations/ on purpose: it is a diagnostic, not a migration, and
-- anything that runs that directory in order (`supabase db push`, or a ledger added later)
-- would otherwise pick it up.
--
-- Scope: 0013–0015 only. It says nothing about 0001–0012, which are also the migrations
-- that are not re-runnable.
--
-- Every row should read 'applied'. Anything reading 'MISSING' still needs its migration.
-- Re-running 0013 or 0015 is safe and repairs anything they own; the others are not
-- guarded, so a MISSING there needs the specific statement applied by hand.

select item, case when present then 'applied' else 'MISSING' end as state
from (values
  ('0013 · directed_pro_id column',
   exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'service_requests'
             and column_name = 'directed_pro_id')),

  ('0013 · directed_until column',
   exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'service_requests'
             and column_name = 'directed_until')),

  ('0013 · auto_accept_max column',
   exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'service_requests'
             and column_name = 'auto_accept_max')),

  ('0013 · directed_complete constraint',
   exists (select 1 from pg_constraint
           where conname = 'service_requests_directed_complete')),

  -- The two constraints that used to be declared inline on their columns. They get their
  -- own rows because `add column if not exists` skips the whole column definition when the
  -- column is already there — so a column can be present with its constraint missing, and
  -- checking only for the column would report 'applied' over exactly that gap.
  ('0013 · directed_pro_id foreign key',
   exists (select 1 from pg_constraint
           where conname = 'service_requests_directed_pro_id_fkey')),

  ('0013 · auto_accept_max > 0 check',
   exists (select 1 from pg_constraint
           where conname = 'service_requests_auto_accept_max_check')),

  ('0013 · status allows awaiting_pro',
   exists (select 1 from pg_constraint
           where conname = 'service_requests_status_check'
             and pg_get_constraintdef(oid) like '%awaiting_pro%')),

  ('0013 · directed_pro index',
   exists (select 1 from pg_indexes
           where schemaname = 'public'
             and indexname = 'service_requests_directed_pro_idx')),

  -- Not a column: without this, a directed request is visible to every matching pro
  -- rather than to the one it was addressed to.
  ('0013 · pro_matches_request honours directed window',
   exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'pro_matches_request'
             and pg_get_functiondef(p.oid) like '%directed_pro_id%')),

  -- Not a column: without this, a quote inside the pre-authorized ceiling is never
  -- auto-accepted and one-tap booking never reaches 'booked'.
  ('0013 · handle_quote_sent auto-accepts directed quotes',
   exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'handle_quote_sent'
             and pg_get_functiondef(p.oid) like '%auto_accept_max%')),

  -- The one most likely to be missing, and the most damaging: without this default,
  -- service_requests_directed_complete rejects every directed request, so one-tap
  -- booking fails 100% of the time (see 0014's header).
  ('0014 · directed_until has a 24h default',
   exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'service_requests'
             and column_name = 'directed_until' and column_default is not null)),

  ('0015 · profiles.home_tour_completed_at',
   exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'profiles'
             and column_name = 'home_tour_completed_at'))
) as t(item, present)
order by 1;
