-- Fixes a bug in 0013_directed_requests.sql, found by exercising the real schema from
-- the browser rather than trusting the unit tests.
--
-- 0013 added directed_until with no default, while service_requests_directed_complete
-- requires all three directed columns to be set together. src/lib/requests.js's
-- createDirectedRequest() deliberately doesn't send a deadline — how long a professional
-- gets exclusivity is a platform rule, not something a client should be able to choose —
-- so directed_until was always null and the constraint rejected every directed request:
--
--   new row for relation "service_requests" violates check constraint
--   "service_requests_directed_complete"
--
-- One-tap booking would have failed 100% of the time. The unit tests could not catch it:
-- they mock the Supabase client, so no constraint or default is ever evaluated. Naming
-- that limitation rather than pretending the coverage was sufficient — a missing column
-- default is only observable against a real database.
--
-- 0013 is already applied to production, so this is a follow-up rather than an edit,
-- matching how 0005 corrected 0004.

-- 24 hours of exclusivity, then pro_matches_request() lets the request fall back to open
-- quoting (ADR-0012). Changing the window is a one-line migration here, which is the
-- point of keeping it in the schema instead of in client code.
alter table public.service_requests
  alter column directed_until set default (now() + interval '24 hours');

comment on column public.service_requests.directed_until is
  'ADR-0012: end of the addressed professional''s exclusive window. Defaults to 24h from insert; clients do not set it. After this, pro_matches_request() opens the request to every matching pro.';
