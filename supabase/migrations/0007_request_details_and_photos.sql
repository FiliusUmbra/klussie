-- Structured per-service question answers (rooms, sqm, ceiling included, etc.), stored
-- as JSON since the field set varies per service (see SERVICE_QUESTIONS in App.jsx).
-- The freeform `details` column stays as-is for any extra notes.
alter table public.service_requests add column details_json jsonb;

-- =========================================================================
-- Photos of the job the customer wants done, attached to a request. Unlike the public
-- portfolio/avatar buckets, these are private: visible only to the customer who owns the
-- request and pros who match it (same visibility as the request itself).
create table public.service_request_photos (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index service_request_photos_request_id_idx on public.service_request_photos (request_id);

alter table public.service_request_photos enable row level security;

create policy "customers manage own request photos"
  on public.service_request_photos for all
  to authenticated
  using (exists (select 1 from public.service_requests sr where sr.id = request_id and sr.customer_id = auth.uid()))
  with check (exists (select 1 from public.service_requests sr where sr.id = request_id and sr.customer_id = auth.uid()));

create policy "matching pros can view request photos"
  on public.service_request_photos for select
  to authenticated
  using (public.pro_matches_request(auth.uid(), request_id));

-- =========================================================================
-- STORAGE — private bucket (unlike avatars/portfolio). Path is
-- "<customer_uid>/<request_id>/<random>" so RLS can scope both by owner (first segment)
-- and, for matching pros, by request (second segment, checked via pro_matches_request).
insert into storage.buckets (id, name, public)
values ('request-photos', 'request-photos', false)
on conflict (id) do nothing;

create policy "customers can upload own request photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'request-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "customers can view own request photos"
on storage.objects for select
to authenticated
using (bucket_id = 'request-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "matching pros can view request photo objects"
on storage.objects for select
to authenticated
using (
  bucket_id = 'request-photos'
  and public.pro_matches_request(auth.uid(), ((storage.foldername(name))[2])::uuid)
);

create policy "customers can delete own request photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'request-photos' and (storage.foldername(name))[1] = auth.uid()::text);
