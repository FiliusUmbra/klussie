-- Grants Platform Operator access to one existing identity, in one environment, by email
-- supplied at invocation time — never hardcoded in this file. Per the Platform
-- Activation Programme's own instruction: "Do not hardcode personal information... the
-- production application must remain environment independent."
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -v operator_email='someone@example.com' \
--        -f supabase/seed/bootstrap_operator.sql
--
-- Development may run this against a local or staging database naming
-- vereecken.michael@gmail.com, per the Programme's own instruction — that address
-- belongs in the -v invocation above, not in any file this repository commits. The psql
-- variable IS the "configuration" the Programme describes.
--
-- WHAT THIS DOES AND DOES NOT DO
--
-- Calls platform.bootstrap_operator(:'operator_email') — 0144's own function, fully
-- explained there. This file's only job is to be a documented, discoverable invocation
-- of it, exactly as supabase/seed/staging_test_accounts.sql is a documented,
-- discoverable invocation of the fixture inserts it wraps. No SQL below is
-- environment-specific; only the value supplied via -v is.
--
-- SAFE TO RUN AGAINST PRODUCTION, UNLIKE staging_test_accounts.sql
--
-- staging_test_accounts.sql refuses to run outside staging because it manufactures fake
-- accounts nobody should ever see in production. This file grants operator access to a
-- real person's real, already-existing identity — the same operation production itself
-- will eventually need, once the platform has a real operator (0132's own header: "a
-- specific person's membership is per-environment operational data"). No guard here
-- refuses production on principle; 0144's own checks (the identity must already exist
-- and be active; the grant is idempotent) are the only safety this operation needs, and
-- it already has them.
--
-- REQUIRES operator_email TO BE SUPPLIED — this script refuses to run without it, rather
-- than silently doing nothing or defaulting to anyone.

\set ON_ERROR_STOP on

\if :{?operator_email}
\else
\echo REFUSING TO SEED: no operator_email supplied. Pass -v operator_email='...' on the psql command line.
\quit 1
\endif

select platform.bootstrap_operator(:'operator_email');
