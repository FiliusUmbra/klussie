-- pro_matches_request() queries service_requests (and other RLS-protected tables) internally.
-- Called from within the RLS policies on those same tables, a non-security-definer function
-- re-triggers RLS evaluation on every internal query, recursing until Postgres hits its stack
-- depth limit. Redefining it security definer (owned by the migration role, which owns these
-- tables and so bypasses RLS on them) makes it evaluate once instead of recursing — the same
-- pattern already used by the trigger functions in 0001_init.sql.
create or replace function public.pro_matches_request(p_pro_id uuid, p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.service_requests sr
    join public.pro_services ps on ps.service_id = sr.service_id and ps.pro_id = p_pro_id
    join public.services sv on sv.id = sr.service_id
    join public.pro_profiles pp on pp.profile_id = p_pro_id
    left join public.pro_stats st on st.pro_id = p_pro_id
    left join public.profiles prof on prof.id = p_pro_id
    where sr.id = p_request_id
      and not pp.paused
      and (sv.certified_only = false or coalesce(st.is_certified, false))
      and (sr.city is null or prof.city is null or lower(sr.city) = lower(prof.city))
  );
$$;
