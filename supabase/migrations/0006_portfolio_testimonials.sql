-- Pro portfolio (photos of past work) and freeform testimonials, both part of the
-- public-facing pro profile. Neither table needs a matching-style function (unlike
-- 0004's pro_matches_request) so there's no recursion risk to worry about here.

create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references public.pro_profiles (profile_id) on delete cascade,
  image_url text not null,
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now()
);

create index portfolio_items_pro_id_idx on public.portfolio_items (pro_id);

alter table public.portfolio_items enable row level security;

create policy "portfolio items are publicly viewable"
  on public.portfolio_items for select
  to anon, authenticated
  using (true);

create policy "pros manage own portfolio items"
  on public.portfolio_items for all
  to authenticated
  using (auth.uid() = pro_id)
  with check (auth.uid() = pro_id);

-- =========================================================================
create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references public.pro_profiles (profile_id) on delete cascade,
  client_name text,
  quote_text text not null,
  created_at timestamptz not null default now()
);

create index testimonials_pro_id_idx on public.testimonials (pro_id);

alter table public.testimonials enable row level security;

create policy "testimonials are publicly viewable"
  on public.testimonials for select
  to anon, authenticated
  using (true);

create policy "pros manage own testimonials"
  on public.testimonials for all
  to authenticated
  using (auth.uid() = pro_id)
  with check (auth.uid() = pro_id);

-- =========================================================================
-- STORAGE — public bucket, same folder-scoped RLS pattern as 0003_avatars_storage.sql.
-- Unlike the single fixed "<uid>/avatar" path, a pro can have many portfolio images,
-- so each upload gets its own random path under their folder.
insert into storage.buckets (id, name, public)
values ('portfolio', 'portfolio', true)
on conflict (id) do nothing;

create policy "portfolio images are publicly accessible"
on storage.objects for select
to public
using (bucket_id = 'portfolio');

create policy "users can upload own portfolio images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'portfolio' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users can update own portfolio images"
on storage.objects for update
to authenticated
using (bucket_id = 'portfolio' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users can delete own portfolio images"
on storage.objects for delete
to authenticated
using (bucket_id = 'portfolio' and (storage.foldername(name))[1] = auth.uid()::text);
