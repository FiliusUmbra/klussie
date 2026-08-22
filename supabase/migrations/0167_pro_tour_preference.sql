-- The durable "this pro has seen the first-login pro tour" record — the direct
-- equivalent of migration 0015's profiles.home_tour_completed_at, for
-- GUIDANCE_SYSTEM.md §17.2.1's own pro-side tour (the "no separate tour" gap
-- UX_PATTERNS.md already named for pros, now closed).
--
-- Same shape and same reasoning as 0015: a timestamp, not a boolean (when they saw it is
-- worth keeping); nullable with no default, so applying this to an existing database
-- marks nobody as having completed a tour that did not exist when they became a pro;
-- guarded so re-running this file is a no-op.
--
-- Lives on pro_profiles, not profiles — a pro's own onboarding state is specific to
-- being a pro, the same way pro_profiles.paused/boosted_until already are, not a fact
-- about the account in general the way home_tour_completed_at is.
alter table public.pro_profiles
  add column if not exists pro_tour_completed_at timestamptz;

comment on column public.pro_profiles.pro_tour_completed_at is
  'When this pro completed or dismissed the first-login pro tour (GUIDANCE_SYSTEM.md §17.2.1). Null = not yet seen. Written by src/lib/onboardingPrefs.js.';
