-- Authentication UX Redesign, Phase 1: the flag that makes "ask how you'll
-- use Klussie exactly once, right after auth" possible without inferring
-- "new user" from timestamps or other fragile signals.
alter table public.profiles
  add column onboarding_role_selected boolean not null default false;
