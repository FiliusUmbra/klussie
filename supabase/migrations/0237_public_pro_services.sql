-- Public professional profile: which services a professional offers.
--
-- The profile a customer sees (opened from a quote or a booked job) showed a professional's
-- rating, bio, portfolio and reviews but never WHAT THEY DO — the one fact a customer weighing
-- a quote most wants next to the price. The data exists (public.pro_services) but its RLS is
-- "workspace members can view" (0037/0195): correct for the professional's own management
-- screens, and the reason a customer's browser can read nothing from it.
--
-- api.public_pro_services() is the narrow read that closes that gap, and nothing more:
--   * it returns only (pro_id, service_id) — the same fact the service catalogue already
--     exposes in aggregate (service_stats.pro_count); no workspace id, no price, no city;
--   * only for professionals that actually have a pro profile;
--   * only for a signed-in caller (no anon grant) — profiles are reached from a quote or a
--     booking, never browsed anonymously;
--   * capped at 100 ids per call so it cannot be used to dump the table in one request.
-- A professional's services are, by design, something they publish: they choose them in
-- Business > Public profile & services precisely so customers can see them.

create or replace function api.public_pro_services(p_pro_ids uuid[])
returns table (pro_id uuid, service_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select ps.pro_id, ps.service_id
  from public.pro_services ps
  join public.pro_profiles pp on pp.profile_id = ps.pro_id
  where ps.pro_id = any (p_pro_ids[1:100]);
$$;

comment on function api.public_pro_services(uuid[]) is
  'The services each given professional offers — (pro_id, service_id) only — for any signed-in caller, capped at 100 ids. The public professional profile''s own read; public.pro_services itself stays workspace-member-only under RLS.';

revoke all on function api.public_pro_services(uuid[]) from public, anon, service_role;
grant execute on function api.public_pro_services(uuid[]) to authenticated;
