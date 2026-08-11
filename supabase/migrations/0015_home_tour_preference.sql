-- The durable "this customer has seen the first-login tour" record.
--
-- Same shape and same reasoning as migration 0011's onboarding_role_selected: the
-- tour must be shown exactly once per account, and inferring "first login" from
-- created_at or a session count is the fragile signal 0011 already rejected.
--
-- A timestamp rather than a boolean, because "when did they see it" is the question
-- worth being able to answer later (did the tour land before or after a copy change?)
-- and a boolean throws that away for no saving. Null means not seen.
--
-- Nullable with no default, so applying this to an existing database marks nobody as
-- having completed a tour that did not exist when they signed up.
-- Guarded so re-running this file is a no-op rather than an error: this repository has no
-- migration ledger (see 0013's header for the full reasoning, including why this was
-- edited in place instead of corrected by a follow-up, and supabase/diagnostics/CHECK_STATE.sql
-- for what is actually applied). 0001–0012 are not guarded; this note covers this file only.
--
-- No constraint accompanies this column, so `if not exists` has nothing to skip past —
-- unlike 0013, which had to move its constraints out of the column definitions.
alter table public.profiles
  add column if not exists home_tour_completed_at timestamptz;

comment on column public.profiles.home_tour_completed_at is
  'When the customer completed or dismissed the first-login home tour. Null = not yet seen. Written by src/lib/onboardingPrefs.js.';
