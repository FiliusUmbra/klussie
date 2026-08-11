-- "Mijn spullen" V1 — the first real Property Memory storage in the product.
--
-- ADR-0008 named "the home itself, Systems, and Documents" as genuinely new schema with
-- no shortcuts, and until now src/lib/homeInventory.js returned hardcoded empty objects
-- so the panels could be written against a contract nothing backed. This is the first
-- piece of that contract becoming real: a household item a customer enters by hand.
--
-- Deliberately narrow. It stores what a person can actually tell you about something
-- they own, and nothing it would have to invent. There is no warranty table, no receipt
-- OCR, no product database lookup — those are named at the bottom of this file as the
-- extension path, not shipped as empty columns nobody writes.
--
-- Guarded throughout, same as 0013 and 0015: this repository keeps no migration ledger,
-- so re-running this file is a no-op rather than an error. Run
-- supabase/diagnostics/CHECK_STATE.sql to see what is actually applied. 0001-0012 are
-- NOT guarded; that note covers this file only.

-- =========================================================================
-- ITEMS
--
-- owner_id, not customer_id: a professional is also a person with a home, and nothing
-- about this table is specific to being a customer. It references profiles rather than
-- auth.users to match every other table here, and cascades because an item has no
-- meaning without the person who recorded it.
create table if not exists public.household_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,

  -- The only field a person must give. Everything else about an object can be genuinely
  -- unknown to its owner — which brand a previous tenant's boiler is, when a hand-me-down
  -- sofa was bought — and a form that refuses to save without it teaches people to lie.
  name text not null,

  -- Kept as a text column with a check rather than a Postgres enum: adding a value to an
  -- enum is a migration that cannot run inside a transaction with other DDL, and this
  -- vocabulary is expected to grow. The mirror of this list lives in
  -- src/lib/itemCategories.js, which owns the display order and the locale keys.
  category text not null default 'other'
    check (category in ('appliance','electronics','furniture','garden','tool','other')),

  -- Free text, not a foreign key to a rooms table. No such table exists (ADR-0008), and
  -- inventing one to hold a word like "keuken" would be schema pretending to be
  -- structure. When rooms become real, this column is what gets backfilled from.
  room text,

  brand text,
  model text,

  -- Path into the private item-photos bucket, not a URL: URLs here are signed and
  -- short-lived, so storing one would store something already expired.
  photo_path text,

  purchased_on date,
  notes text,

  -- =======================================================================
  -- AI PROVENANCE
  --
  -- The product intent (see the brief and HOME_OPERATING_SYSTEM.md §4) is that a photo
  -- can later be recognised into a suggested brand, model and category — and that the
  -- customer confirms before anything is saved. These two columns are what make that
  -- possible without a second migration, and what make it auditable afterwards.
  --
  -- 'manual'       — the person typed it.
  -- 'ai_confirmed' — a model proposed it and the person accepted it.
  --
  -- There is deliberately no 'ai_auto' value. Constitution Rule 9 and the brief agree on
  -- this: nothing a model guessed about someone's home is saved without them saying yes,
  -- so a row that nobody confirmed is a row that should not exist. The check constraint
  -- is where that promise is actually kept, rather than in whichever client wrote last.
  source text not null default 'manual'
    check (source in ('manual','ai_confirmed')),

  -- What the model originally proposed, kept even when the person edited it before
  -- saving. This is the only way to later answer "how often is the recognition right?"
  -- without instrumenting the client, and it is why confirmation is not just a dialog
  -- that throws the suggestion away. Null for anything entered by hand.
  --
  -- Shape (documented here rather than constrained, since it is a model output and will
  -- gain fields): { brand, model, category, confidence, modelVersion, suggestedAt }
  ai_suggestion jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.household_items is
  'Property Memory V1: things a person owns, entered by hand. AI recognition may later populate ai_suggestion, but source=ai_confirmed requires the owner to have accepted it.';
comment on column public.household_items.source is
  'How this row came to exist. There is no value for unconfirmed AI output on purpose — the owner always confirms before save.';
comment on column public.household_items.ai_suggestion is
  'What a model proposed, retained after confirmation so recognition accuracy is measurable later. Null when typed by hand.';

-- The only access pattern V1 has: one person's items, newest first.
create index if not exists household_items_owner_idx
  on public.household_items (owner_id, created_at desc);

-- =========================================================================
-- KEEPING updated_at HONEST
--
-- Set in the database rather than trusted from the client, so it means "when the row
-- changed" and not "what the last writer claimed".
create or replace function public.touch_household_item()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists household_items_touch on public.household_items;
create trigger household_items_touch
  before update on public.household_items
  for each row execute function public.touch_household_item();

-- =========================================================================
-- ROW LEVEL SECURITY
--
-- Strictly private. Unlike service requests, which matching professionals can see, an
-- inventory of what someone owns has no second audience — there is no product reason for
-- a professional to browse a household's possessions, and a table that starts private is
-- far easier to open later than one that starts open.
alter table public.household_items enable row level security;

drop policy if exists "owners manage own items" on public.household_items;
create policy "owners manage own items"
  on public.household_items for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- =========================================================================
-- STORAGE — private bucket, one photo per item.
--
-- Path is "<owner_uid>/<item_id>/<random>", mirroring request-photos: the first segment
-- is what RLS checks, so a policy never has to join back to the table. Private rather
-- than public because a photo of the inside of someone's kitchen is not portfolio work.
insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', false)
on conflict (id) do nothing;

drop policy if exists "owners can upload own item photos" on storage.objects;
create policy "owners can upload own item photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'item-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "owners can view own item photos" on storage.objects;
create policy "owners can view own item photos"
on storage.objects for select
to authenticated
using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "owners can delete own item photos" on storage.objects;
create policy "owners can delete own item photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- =========================================================================
-- EXTENSION PATH — designed, deliberately not created.
--
-- The brief named warranty, manuals, receipts and maintenance schedules as things this
-- model should be able to grow into. They are written out here so the shape is decided
-- rather than improvised later, and left uncreated so this migration ships no column or
-- table that nothing reads. An empty column is not extensibility; it is debt with a
-- plausible excuse.
--
-- Two of them are scalar and land on this table directly:
--
--   alter table public.household_items
--     add column if not exists warranty_expires_on date,
--     add column if not exists serial_number text;
--
-- The other two are collections and need their own tables, both keyed to the item so a
-- deleted item takes its paperwork with it:
--
--   create table public.household_item_documents (
--     id uuid primary key default gen_random_uuid(),
--     item_id uuid not null references public.household_items (id) on delete cascade,
--     kind text not null check (kind in ('receipt','manual','warranty','other')),
--     storage_path text not null,
--     -- OCR output, same confirm-before-save rule as ai_suggestion above.
--     extracted jsonb,
--     created_at timestamptz not null default now()
--   );
--
--   create table public.household_item_maintenance (
--     id uuid primary key default gen_random_uuid(),
--     item_id uuid not null references public.household_items (id) on delete cascade,
--     -- Null when this records something that already happened rather than something due.
--     due_on date,
--     performed_on date,
--     -- Set when the work went through Klussie, so maintenance history and job history
--     -- are one story rather than two lists that disagree.
--     request_id uuid references public.service_requests (id) on delete set null,
--     notes text,
--     created_at timestamptz not null default now()
--   );
--
-- Whoever builds those: the reminder side of maintenance needs a notification system,
-- which this product does not have (MASTER_CONTEXT.md section 13 tracks it as a real
-- gap). A due_on column without one is a date nobody is ever told about.
