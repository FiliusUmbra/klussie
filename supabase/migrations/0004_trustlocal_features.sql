-- Stage 4: location-based matching, pause profile, report a business, trust score inputs.
-- (Trust score itself is computed client-side from existing pro_stats fields — no column needed.)

alter table public.service_requests add column city text;
alter table public.pro_profiles add column paused boolean not null default false;

-- Shared matching predicate: extracted from what were two duplicated policies
-- (service/certification match) so location + pause can be added in one place.
create or replace function public.pro_matches_request(p_pro_id uuid, p_request_id uuid)
returns boolean
language sql
stable
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

drop policy "pros can view matching requests" on public.service_requests;
create policy "pros can view matching requests"
  on public.service_requests for select
  to authenticated
  using (public.pro_matches_request(auth.uid(), id));

drop policy "pros can send quotes on matching requests" on public.quotes;
create policy "pros can send quotes on matching requests"
  on public.quotes for insert
  to authenticated
  with check (auth.uid() = pro_id and public.pro_matches_request(auth.uid(), request_id));

-- =========================================================================
-- REPORTS
-- =========================================================================
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  pro_id uuid not null references public.pro_profiles (profile_id) on delete cascade,
  request_id uuid references public.service_requests (id) on delete set null,
  reason text not null check (reason in ('no_show','poor_quality','billing_issue','other')),
  details text,
  status text not null default 'open' check (status in ('open','reviewed','resolved')),
  created_at timestamptz not null default now()
);

create index reports_pro_id_idx on public.reports (pro_id);

alter table public.reports enable row level security;

create policy "reporters can view own reports"
  on public.reports for select
  to authenticated
  using (auth.uid() = reporter_id);

create policy "customers can report a pro they booked"
  on public.reports for insert
  to authenticated
  with check (
    auth.uid() = reporter_id
    and exists (
      select 1 from public.service_requests sr
      where sr.customer_id = auth.uid()
        and sr.booked_pro_id = reports.pro_id
        and (reports.request_id is null or sr.id = reports.request_id)
    )
  );
