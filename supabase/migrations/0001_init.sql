-- klussie.be — initial schema
-- Paste this whole file into the Supabase SQL Editor (or run via `supabase db push`)
-- against a fresh project. Safe to run once on an empty database.

create extension if not exists "pgcrypto";

-- =========================================================================
-- PROFILES
-- =========================================================================
-- Public-safe profile info, one row per auth.users row (created by trigger).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  city text,
  locale text not null default 'nl' check (locale in ('nl','fr','de','en','ar','tr','ru','zh')),
  created_at timestamptz not null default now()
);

-- Contact details split out so RLS can keep them private until a booking exists.
create table public.profile_contacts (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  email text,
  phone text
);

-- =========================================================================
-- PRO PROFILES
-- =========================================================================
-- Owner-editable pro details. Only exists once a profile "becomes a pro".
create table public.pro_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  pro_type text not null check (pro_type in ('flexi','business')),
  business_name text,
  vat_number text,
  bio text,
  boosted_until timestamptz,
  created_at timestamptz not null default now(),
  constraint business_requires_details check (
    pro_type <> 'business' or (business_name is not null and vat_number is not null)
  )
);

-- Platform-controlled pro stats: no client write policy at all (see RLS below),
-- only ever written by security-definer trigger functions owned by the table owner.
create table public.pro_stats (
  pro_id uuid primary key references public.pro_profiles (profile_id) on delete cascade,
  rating_avg numeric(3,2) not null default 0,
  rating_count integer not null default 0,
  badge_tier text check (badge_tier in ('top','elite')),
  is_certified boolean not null default false
);

-- =========================================================================
-- CATALOG (categories, services, translations)
-- =========================================================================
create table public.categories (
  id text primary key,
  icon text not null,
  sort_order integer not null default 0
);

create table public.category_translations (
  category_id text not null references public.categories (id) on delete cascade,
  locale text not null check (locale in ('nl','fr','de','en','ar','tr','ru','zh')),
  name text not null,
  primary key (category_id, locale)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  category_id text not null references public.categories (id),
  mode text not null check (mode in ('book','quote')),
  base_price numeric(10,2) not null,
  certified_only boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.service_translations (
  service_id uuid not null references public.services (id) on delete cascade,
  locale text not null check (locale in ('nl','fr','de','en','ar','tr','ru','zh')),
  name text not null,
  blurb text not null,
  primary key (service_id, locale)
);

-- Which services a pro offers (replaces the mock's `cats: []` array on BASE_PROS).
create table public.pro_services (
  pro_id uuid not null references public.pro_profiles (profile_id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pro_id, service_id)
);

-- =========================================================================
-- REQUESTS / QUOTES / REVIEWS
-- =========================================================================
create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  service_id uuid not null references public.services (id),
  category_id text not null references public.categories (id),
  details text,
  when_pref text not null check (when_pref in ('this_week','next_week','flexible')),
  budget numeric(10,2),
  status text not null default 'collecting'
    check (status in ('collecting','quotes_ready','booked','completed','reviewed','cancelled')),
  booked_pro_id uuid references public.pro_profiles (profile_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  pro_id uuid not null references public.pro_profiles (profile_id) on delete cascade,
  price numeric(10,2) not null,
  message text,
  status text not null default 'sent' check (status in ('sent','accepted','declined')),
  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (request_id, pro_id)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.service_requests (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  pro_id uuid not null references public.pro_profiles (profile_id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  body text,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- MESSAGING
-- =========================================================================
-- Created automatically when a quote is accepted (see handle_quote_accepted below).
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.service_requests (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  pro_id uuid not null references public.pro_profiles (profile_id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- =========================================================================
-- INDEXES
-- =========================================================================
create index services_category_id_idx on public.services (category_id);
create index pro_services_service_id_idx on public.pro_services (service_id);
create index service_requests_customer_id_idx on public.service_requests (customer_id);
create index service_requests_service_id_idx on public.service_requests (service_id);
create index service_requests_category_status_idx on public.service_requests (category_id, status);
create index quotes_request_id_idx on public.quotes (request_id);
create index quotes_pro_id_idx on public.quotes (pro_id);
create index reviews_pro_id_idx on public.reviews (pro_id);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at);

-- =========================================================================
-- VIEWS
-- =========================================================================
-- Computed per-service stats instead of denormalized counters on `services`.
create view public.service_stats as
select
  s.id as service_id,
  coalesce(pc.pro_count, 0) as pro_count,
  coalesce(rv.rating_avg, 0) as rating_avg,
  coalesce(rv.review_count, 0) as review_count
from public.services s
left join (
  select service_id, count(*) as pro_count
  from public.pro_services
  group by service_id
) pc on pc.service_id = s.id
left join (
  select sr.service_id, avg(r.stars) as rating_avg, count(r.id) as review_count
  from public.service_requests sr
  join public.reviews r on r.request_id = sr.id
  group by sr.service_id
) rv on rv.service_id = s.id;

-- =========================================================================
-- FUNCTIONS & TRIGGERS
-- =========================================================================

-- Create profile + contact row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url');

  insert into public.profile_contacts (profile_id, email)
  values (new.id, new.email);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Initialize pro_stats whenever a profile becomes a pro.
create or replace function public.handle_new_pro_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.pro_stats (pro_id) values (new.profile_id)
  on conflict (pro_id) do nothing;
  return new;
end;
$$;

create trigger on_pro_profile_created
  after insert on public.pro_profiles
  for each row execute function public.handle_new_pro_profile();

-- Keep service_requests.updated_at current.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger service_requests_set_updated_at
  before update on public.service_requests
  for each row execute function public.set_updated_at();

-- First quote sent on a request moves it out of "collecting".
create or replace function public.handle_quote_sent()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.service_requests
  set status = 'quotes_ready'
  where id = new.request_id and status = 'collecting';
  return new;
end;
$$;

create trigger on_quote_sent
  after insert on public.quotes
  for each row execute function public.handle_quote_sent();

-- Accepting a quote books the request, declines the other quotes, and opens a conversation.
create or replace function public.handle_quote_accepted()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    update public.service_requests
    set status = 'booked', booked_pro_id = new.pro_id
    where id = new.request_id;

    update public.quotes
    set status = 'declined', responded_at = now()
    where request_id = new.request_id and id <> new.id and status = 'sent';

    insert into public.conversations (request_id, customer_id, pro_id)
    select sr.id, sr.customer_id, new.pro_id
    from public.service_requests sr
    where sr.id = new.request_id
    on conflict (request_id) do nothing;

    new.responded_at = now();
  end if;
  return new;
end;
$$;

create trigger on_quote_accepted
  before update on public.quotes
  for each row execute function public.handle_quote_accepted();

-- A completed job's review updates the pro's aggregate rating and marks the request reviewed.
create or replace function public.handle_new_review()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.pro_stats
  set rating_count = rating_count + 1,
      rating_avg = round((((rating_avg * rating_count) + new.stars) / (rating_count + 1))::numeric, 2)
  where pro_id = new.pro_id;

  update public.service_requests
  set status = 'reviewed'
  where id = new.request_id;

  return new;
end;
$$;

create trigger on_review_created
  after insert on public.reviews
  for each row execute function public.handle_new_review();

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================
alter table public.profiles enable row level security;
alter table public.profile_contacts enable row level security;
alter table public.pro_profiles enable row level security;
alter table public.pro_stats enable row level security;
alter table public.categories enable row level security;
alter table public.category_translations enable row level security;
alter table public.services enable row level security;
alter table public.service_translations enable row level security;
alter table public.pro_services enable row level security;
alter table public.service_requests enable row level security;
alter table public.quotes enable row level security;
alter table public.reviews enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- ---- profiles ----
create policy "profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---- profile_contacts ----
-- Private by default; visible to the owner, and to the other side of a confirmed booking.
create policy "users can view own contact info"
  on public.profile_contacts for select
  to authenticated
  using (auth.uid() = profile_id);

create policy "booked pro can view customer contact info"
  on public.profile_contacts for select
  to authenticated
  using (
    exists (
      select 1 from public.service_requests sr
      where sr.customer_id = profile_contacts.profile_id
        and sr.booked_pro_id = auth.uid()
        and sr.status in ('booked','completed','reviewed')
    )
  );

create policy "customer can view booked pro contact info"
  on public.profile_contacts for select
  to authenticated
  using (
    exists (
      select 1 from public.service_requests sr
      where sr.booked_pro_id = profile_contacts.profile_id
        and sr.customer_id = auth.uid()
        and sr.status in ('booked','completed','reviewed')
    )
  );

create policy "users can update own contact info"
  on public.profile_contacts for update
  to authenticated
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- ---- pro_profiles ----
create policy "pro profiles are publicly viewable"
  on public.pro_profiles for select
  to anon, authenticated
  using (true);

create policy "users can create own pro profile"
  on public.pro_profiles for insert
  to authenticated
  with check (auth.uid() = profile_id);

create policy "pros can update own pro profile"
  on public.pro_profiles for update
  to authenticated
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- ---- pro_stats ----
-- Read-only to clients. Only trigger functions (running as table owner) write to it.
create policy "pro stats are publicly viewable"
  on public.pro_stats for select
  to anon, authenticated
  using (true);

-- ---- catalog: categories / services / translations ----
create policy "categories are publicly viewable"
  on public.categories for select
  to anon, authenticated
  using (true);

create policy "category translations are publicly viewable"
  on public.category_translations for select
  to anon, authenticated
  using (true);

create policy "services are publicly viewable"
  on public.services for select
  to anon, authenticated
  using (active = true);

create policy "service translations are publicly viewable"
  on public.service_translations for select
  to anon, authenticated
  using (true);

-- ---- pro_services ----
create policy "pro services are publicly viewable"
  on public.pro_services for select
  to anon, authenticated
  using (true);

create policy "pros manage own service list"
  on public.pro_services for all
  to authenticated
  using (auth.uid() = pro_id)
  with check (auth.uid() = pro_id);

-- ---- service_requests ----
create policy "customers manage own requests"
  on public.service_requests for all
  to authenticated
  using (auth.uid() = customer_id)
  with check (auth.uid() = customer_id);

create policy "pros can view matching requests"
  on public.service_requests for select
  to authenticated
  using (
    exists (
      select 1
      from public.pro_services ps
      join public.services sv on sv.id = ps.service_id
      left join public.pro_stats st on st.pro_id = ps.pro_id
      where ps.pro_id = auth.uid()
        and ps.service_id = service_requests.service_id
        and (sv.certified_only = false or coalesce(st.is_certified, false))
    )
  );

-- ---- quotes ----
create policy "pros can view own quotes"
  on public.quotes for select
  to authenticated
  using (auth.uid() = pro_id);

create policy "customers can view quotes on own requests"
  on public.quotes for select
  to authenticated
  using (
    exists (
      select 1 from public.service_requests sr
      where sr.id = quotes.request_id and sr.customer_id = auth.uid()
    )
  );

create policy "pros can send quotes on matching requests"
  on public.quotes for insert
  to authenticated
  with check (
    auth.uid() = pro_id
    and exists (
      select 1
      from public.service_requests sr
      join public.pro_services ps on ps.service_id = sr.service_id
      join public.services sv on sv.id = sr.service_id
      left join public.pro_stats st on st.pro_id = ps.pro_id
      where sr.id = quotes.request_id
        and ps.pro_id = auth.uid()
        and (sv.certified_only = false or coalesce(st.is_certified, false))
    )
  );

create policy "pros can update own pending quotes"
  on public.quotes for update
  to authenticated
  using (auth.uid() = pro_id and status = 'sent')
  with check (auth.uid() = pro_id);

create policy "customers can accept or decline quotes on own requests"
  on public.quotes for update
  to authenticated
  using (
    exists (
      select 1 from public.service_requests sr
      where sr.id = quotes.request_id and sr.customer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.service_requests sr
      where sr.id = quotes.request_id and sr.customer_id = auth.uid()
    )
  );

-- ---- reviews ----
create policy "reviews are publicly viewable"
  on public.reviews for select
  to anon, authenticated
  using (true);

create policy "customers can review own completed bookings"
  on public.reviews for insert
  to authenticated
  with check (
    auth.uid() = customer_id
    and exists (
      select 1 from public.service_requests sr
      where sr.id = request_id
        and sr.customer_id = auth.uid()
        and sr.booked_pro_id = reviews.pro_id
        and sr.status = 'completed'
    )
  );

-- ---- conversations ----
create policy "participants can view own conversations"
  on public.conversations for select
  to authenticated
  using (auth.uid() = customer_id or auth.uid() = pro_id);

-- (no insert policy: conversations are only created by handle_quote_accepted)

-- ---- messages ----
create policy "participants can view messages"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.customer_id = auth.uid() or c.pro_id = auth.uid())
    )
  );

create policy "participants can send messages"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.customer_id = auth.uid() or c.pro_id = auth.uid())
    )
  );

create policy "participants can mark messages read"
  on public.messages for update
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.customer_id = auth.uid() or c.pro_id = auth.uid())
    )
  )
  with check (true);

-- =========================================================================
-- SEED DATA — catalog ported from src/App.jsx (CATS, CAT_I18N, BASE_SERVICES, SERVICE_I18N)
-- =========================================================================

insert into public.categories (id, icon, sort_order) values
  ('cleaning', 'Sparkles', 1),
  ('moving', 'Truck', 2),
  ('renovation', 'Hammer', 3),
  ('repair', 'Wrench', 4),
  ('tutoring', 'BookOpen', 5),
  ('events', 'PartyPopper', 6),
  ('specialist', 'BadgeCheck', 7),
  ('other', 'MoreHorizontal', 8);

insert into public.category_translations (category_id, locale, name) values
  ('cleaning','nl',$$Schoonmaak$$), ('cleaning','fr',$$Nettoyage$$), ('cleaning','de',$$Reinigung$$), ('cleaning','en',$$Cleaning$$),
  ('cleaning','ar',$$تنظيف$$), ('cleaning','tr',$$Temizlik$$), ('cleaning','ru',$$Уборка$$), ('cleaning','zh',$$清洁$$),
  ('moving','nl',$$Verhuizing$$), ('moving','fr',$$Déménagement$$), ('moving','de',$$Umzug$$), ('moving','en',$$Moving$$),
  ('moving','ar',$$نقل$$), ('moving','tr',$$Nakliyat$$), ('moving','ru',$$Переезд$$), ('moving','zh',$$搬家$$),
  ('renovation','nl',$$Renovatie$$), ('renovation','fr',$$Rénovation$$), ('renovation','de',$$Renovierung$$), ('renovation','en',$$Renovation$$),
  ('renovation','ar',$$تجديد$$), ('renovation','tr',$$Tadilat$$), ('renovation','ru',$$Ремонт$$), ('renovation','zh',$$装修$$),
  ('repair','nl',$$Herstelling$$), ('repair','fr',$$Réparation$$), ('repair','de',$$Reparatur$$), ('repair','en',$$Repair$$),
  ('repair','ar',$$إصلاح$$), ('repair','tr',$$Tamir$$), ('repair','ru',$$Починка$$), ('repair','zh',$$维修$$),
  ('tutoring','nl',$$Bijles$$), ('tutoring','fr',$$Cours particuliers$$), ('tutoring','de',$$Nachhilfe$$), ('tutoring','en',$$Tutoring$$),
  ('tutoring','ar',$$دروس خصوصية$$), ('tutoring','tr',$$Özel Ders$$), ('tutoring','ru',$$Репетиторство$$), ('tutoring','zh',$$家教$$),
  ('events','nl',$$Evenementen$$), ('events','fr',$$Événements$$), ('events','de',$$Veranstaltungen$$), ('events','en',$$Events$$),
  ('events','ar',$$مناسبات$$), ('events','tr',$$Organizasyon$$), ('events','ru',$$Мероприятия$$), ('events','zh',$$活动策划$$),
  ('specialist','nl',$$Specialisten$$), ('specialist','fr',$$Spécialistes$$), ('specialist','de',$$Spezialisten$$), ('specialist','en',$$Specialists$$),
  ('specialist','ar',$$متخصصون$$), ('specialist','tr',$$Uzmanlar$$), ('specialist','ru',$$Специалисты$$), ('specialist','zh',$$专业认证服务$$),
  ('other','nl',$$Overig$$), ('other','fr',$$Autre$$), ('other','de',$$Sonstiges$$), ('other','en',$$Other$$),
  ('other','ar',$$أخرى$$), ('other','tr',$$Diğer$$), ('other','ru',$$Другое$$), ('other','zh',$$其他$$);

insert into public.services (id, category_id, mode, base_price, certified_only) values
  ('00000000-0000-0000-0000-000000000001','renovation','quote',320,false),
  ('00000000-0000-0000-0000-000000000002','moving','quote',480,false),
  ('00000000-0000-0000-0000-000000000003','cleaning','book',65,false),
  ('00000000-0000-0000-0000-000000000004','cleaning','quote',90,false),
  ('00000000-0000-0000-0000-000000000005','renovation','quote',1500,false),
  ('00000000-0000-0000-0000-000000000006','repair','quote',210,false),
  ('00000000-0000-0000-0000-000000000007','moving','quote',90,false),
  ('00000000-0000-0000-0000-000000000008','tutoring','quote',35,false),
  ('00000000-0000-0000-0000-000000000009','repair','quote',70,false),
  ('00000000-0000-0000-0000-000000000010','cleaning','quote',55,false),
  ('00000000-0000-0000-0000-000000000011','repair','quote',120,false),
  ('00000000-0000-0000-0000-000000000012','specialist','quote',150,true),
  ('00000000-0000-0000-0000-000000000013','specialist','quote',60,true),
  ('00000000-0000-0000-0000-000000000014','specialist','quote',450,true),
  ('00000000-0000-0000-0000-000000000015','specialist','quote',90,true);

insert into public.service_translations (service_id, locale, name, blurb) values
  ('00000000-0000-0000-0000-000000000001','nl',$$Schilderwerken$$,$$Binnen- en buitenschilderwerk, muurvoorbereiding en afwerking door erkende schilders.$$),
  ('00000000-0000-0000-0000-000000000001','fr',$$Travaux de peinture$$,$$Peinture intérieure et extérieure, préparation des murs et finitions par des peintres agréés.$$),
  ('00000000-0000-0000-0000-000000000001','de',$$Malerarbeiten$$,$$Innen- und Außenanstrich, Wandvorbereitung und Ausführung durch geprüfte Maler.$$),
  ('00000000-0000-0000-0000-000000000001','en',$$Painting & Whitewash$$,$$Interior/exterior painting, wall prep, and touch-ups from vetted painters.$$),
  ('00000000-0000-0000-0000-000000000001','ar',$$أعمال الدهان$$,$$دهان داخلي وخارجي، تحضير الجدران واللمسات الأخيرة من قبل دهانين معتمدين.$$),
  ('00000000-0000-0000-0000-000000000001','tr',$$Boya Badana$$,$$Onaylı ustalar tarafından iç/dış boya, duvar hazırlığı ve rötuş.$$),
  ('00000000-0000-0000-0000-000000000001','ru',$$Малярные работы$$,$$Внутренняя и наружная покраска, подготовка стен и отделка проверенными мастерами.$$),
  ('00000000-0000-0000-0000-000000000001','zh',$$油漆粉刷$$,$$由认证油漆工提供的室内外油漆、墙面处理及修补。$$),

  ('00000000-0000-0000-0000-000000000002','nl',$$Verhuisservice$$,$$Volledige verhuizingen inclusief inpakken, dragen en transport.$$),
  ('00000000-0000-0000-0000-000000000002','fr',$$Service de déménagement$$,$$Déménagements complets incluant emballage, portage et transport.$$),
  ('00000000-0000-0000-0000-000000000002','de',$$Umzugsservice$$,$$Komplette Umzüge inklusive Verpacken, Tragen und Transport.$$),
  ('00000000-0000-0000-0000-000000000002','en',$$Moving Service$$,$$Full household moves with packing, loading, and transport.$$),
  ('00000000-0000-0000-0000-000000000002','ar',$$خدمة النقل$$,$$نقل كامل للمنزل يشمل التغليف والحمل والنقل.$$),
  ('00000000-0000-0000-0000-000000000002','tr',$$Nakliyat Hizmeti$$,$$Paketleme, taşıma ve nakliye dahil komple ev taşımacılığı.$$),
  ('00000000-0000-0000-0000-000000000002','ru',$$Служба переезда$$,$$Полный переезд с упаковкой, погрузкой и транспортировкой.$$),
  ('00000000-0000-0000-0000-000000000002','zh',$$搬家服务$$,$$包含打包、搬运和运输的全套搬家服务。$$),

  ('00000000-0000-0000-0000-000000000003','nl',$$Woningreiniging$$,$$Terugkerende of eenmalige grondige schoonmaak voor appartement of huis.$$),
  ('00000000-0000-0000-0000-000000000003','fr',$$Nettoyage de maison$$,$$Nettoyage récurrent ou ponctuel pour appartement ou maison.$$),
  ('00000000-0000-0000-0000-000000000003','de',$$Wohnungsreinigung$$,$$Wiederkehrende oder einmalige Tiefenreinigung für Wohnung oder Haus.$$),
  ('00000000-0000-0000-0000-000000000003','en',$$Home Cleaning$$,$$Recurring or one-off deep cleans for apartments and houses.$$),
  ('00000000-0000-0000-0000-000000000003','ar',$$تنظيف المنزل$$,$$تنظيف عميق متكرر أو لمرة واحدة للشقق والمنازل.$$),
  ('00000000-0000-0000-0000-000000000003','tr',$$Ev Temizliği$$,$$Daire ve evler için tekrarlayan veya tek seferlik detaylı temizlik.$$),
  ('00000000-0000-0000-0000-000000000003','ru',$$Уборка дома$$,$$Регулярная или разовая глубокая уборка квартир и домов.$$),
  ('00000000-0000-0000-0000-000000000003','zh',$$住宅清洁$$,$$为公寓和住宅提供定期或一次性深度清洁。$$),

  ('00000000-0000-0000-0000-000000000004','nl',$$Ontruimingsschoonmaak$$,$$Schoonmaak bij verhuis zodat je je waarborg zonder stress terugkrijgt.$$),
  ('00000000-0000-0000-0000-000000000004','fr',$$Nettoyage de fin de bail$$,$$Nettoyage lors d'un déménagement pour récupérer ta garantie sans stress.$$),
  ('00000000-0000-0000-0000-000000000004','de',$$Endreinigung$$,$$Reinigung beim Auszug, damit du deine Kaution stressfrei zurückbekommst.$$),
  ('00000000-0000-0000-0000-000000000004','en',$$Move-out Cleaning$$,$$End-of-tenancy cleaning to get your deposit back, stress-free.$$),
  ('00000000-0000-0000-0000-000000000004','ar',$$تنظيف الإخلاء$$,$$تنظيف عند الانتقال لاسترجاع تأمينك دون أي إزعاج.$$),
  ('00000000-0000-0000-0000-000000000004','tr',$$Boş Ev Temizliği$$,$$Depozitonu sorunsuzca geri almak için çıkış temizliği.$$),
  ('00000000-0000-0000-0000-000000000004','ru',$$Уборка при выезде$$,$$Уборка при переезде, чтобы без стресса вернуть залог.$$),
  ('00000000-0000-0000-0000-000000000004','zh',$$退租清洁$$,$$搬家时的清洁服务，助你无忧拿回押金。$$),

  ('00000000-0000-0000-0000-000000000005','nl',$$Keukenkasten op maat$$,$$Keukenkasten op maat gemeten en gebouwd voor jouw ruimte.$$),
  ('00000000-0000-0000-0000-000000000005','fr',$$Cuisine sur mesure$$,$$Meubles de cuisine mesurés et construits sur mesure pour ton espace.$$),
  ('00000000-0000-0000-0000-000000000005','de',$$Küchenschränke nach Maß$$,$$Maßgeschneiderte Küchenschränke, vermessen und gebaut für deinen Raum.$$),
  ('00000000-0000-0000-0000-000000000005','en',$$Custom Kitchen Cabinets$$,$$Bespoke kitchen cabinetry, measured and built for your space.$$),
  ('00000000-0000-0000-0000-000000000005','ar',$$خزائن مطبخ حسب الطلب$$,$$خزائن مطبخ مقاسة ومصنوعة خصيصًا لمساحتك.$$),
  ('00000000-0000-0000-0000-000000000005','tr',$$Özel Mutfak Dolabı$$,$$Mekanına özel ölçülüp yapılan mutfak dolapları.$$),
  ('00000000-0000-0000-0000-000000000005','ru',$$Кухонные шкафы на заказ$$,$$Кухонная мебель, изготовленная по индивидуальным размерам.$$),
  ('00000000-0000-0000-0000-000000000005','zh',$$定制厨柜$$,$$根据你的空间量身定制并安装的厨房橱柜。$$),

  ('00000000-0000-0000-0000-000000000006','nl',$$Tegelwerken$$,$$Vloer- en wandtegels voor badkamer, keuken en terras.$$),
  ('00000000-0000-0000-0000-000000000006','fr',$$Carrelage$$,$$Carrelage sol et mur pour salle de bain, cuisine et terrasse.$$),
  ('00000000-0000-0000-0000-000000000006','de',$$Fliesenarbeiten$$,$$Boden- und Wandfliesen für Bad, Küche und Terrasse.$$),
  ('00000000-0000-0000-0000-000000000006','en',$$Tiling$$,$$Floor and wall tiling for bathrooms, kitchens, and terraces.$$),
  ('00000000-0000-0000-0000-000000000006','ar',$$أعمال البلاط$$,$$تركيب بلاط الأرضيات والجدران للحمامات والمطابخ والشرفات.$$),
  ('00000000-0000-0000-0000-000000000006','tr',$$Fayans Döşeme$$,$$Banyo, mutfak ve teras için zemin ve duvar fayansı.$$),
  ('00000000-0000-0000-0000-000000000006','ru',$$Укладка плитки$$,$$Напольная и настенная плитка для ванной, кухни и террасы.$$),
  ('00000000-0000-0000-0000-000000000006','zh',$$贴砖服务$$,$$卫生间、厨房和露台的地砖与墙砖铺贴。$$),

  ('00000000-0000-0000-0000-000000000007','nl',$$Meubeltransport$$,$$Transport van losse meubels of toestellen, ook kleine ladingen.$$),
  ('00000000-0000-0000-0000-000000000007','fr',$$Transport de meubles$$,$$Transport de meubles ou d'appareils isolés, même en petite quantité.$$),
  ('00000000-0000-0000-0000-000000000007','de',$$Möbeltransport$$,$$Transport einzelner Möbel oder Geräte, auch kleine Ladungen.$$),
  ('00000000-0000-0000-0000-000000000007','en',$$Furniture Moving$$,$$Single-item or small-load transport for furniture and appliances.$$),
  ('00000000-0000-0000-0000-000000000007','ar',$$نقل الأثاث$$,$$نقل قطعة أثاث واحدة أو حمولة صغيرة للأثاث والأجهزة.$$),
  ('00000000-0000-0000-0000-000000000007','tr',$$Eşya Taşıma$$,$$Tek parça eşya veya küçük yük taşımacılığı.$$),
  ('00000000-0000-0000-0000-000000000007','ru',$$Перевозка мебели$$,$$Перевозка отдельных предметов мебели или техники, даже небольших грузов.$$),
  ('00000000-0000-0000-0000-000000000007','zh',$$家具搬运$$,$$单件家具或小件货物及电器的运输。$$),

  ('00000000-0000-0000-0000-000000000008','nl',$$Engelse bijles (online)$$,$$1-op-1 online Engelse les op elk niveau, op een moment dat jou past.$$),
  ('00000000-0000-0000-0000-000000000008','fr',$$Cours d'anglais (en ligne)$$,$$Cours particuliers d'anglais en ligne à tous les niveaux, à ton rythme.$$),
  ('00000000-0000-0000-0000-000000000008','de',$$Englisch-Nachhilfe (online)$$,$$1:1-Online-Englischunterricht für jedes Niveau, zeitlich flexibel.$$),
  ('00000000-0000-0000-0000-000000000008','en',$$English Tutoring (Online)$$,$$1:1 online English lessons for any level, scheduled around you.$$),
  ('00000000-0000-0000-0000-000000000008','ar',$$دروس اللغة الإنجليزية (عبر الإنترنت)$$,$$دروس فردية عبر الإنترنت لجميع المستويات، بمواعيد تناسبك.$$),
  ('00000000-0000-0000-0000-000000000008','tr',$$İngilizce Özel Ders (Online)$$,$$Her seviyeye uygun, sana uygun saatlerde birebir online İngilizce dersi.$$),
  ('00000000-0000-0000-0000-000000000008','ru',$$Репетитор по английскому (онлайн)$$,$$Индивидуальные онлайн-уроки английского для любого уровня, в удобное время.$$),
  ('00000000-0000-0000-0000-000000000008','zh',$$英语家教（在线）$$,$$适合任何水平的一对一在线英语课程，时间灵活安排。$$),

  ('00000000-0000-0000-0000-000000000009','nl',$$Elektriciteitswerken$$,$$Bekabeling, stopcontacten, verlichting en veiligheidscontroles door erkende elektriciens.$$),
  ('00000000-0000-0000-0000-000000000009','fr',$$Travaux d'électricité$$,$$Câblage, prises, luminaires et contrôles de sécurité par des électriciens agréés.$$),
  ('00000000-0000-0000-0000-000000000009','de',$$Elektroarbeiten$$,$$Verkabelung, Steckdosen, Beleuchtung und Sicherheitsprüfungen durch geprüfte Elektriker.$$),
  ('00000000-0000-0000-0000-000000000009','en',$$Electrical Work$$,$$Wiring, outlets, fixtures, and safety checks by licensed electricians.$$),
  ('00000000-0000-0000-0000-000000000009','ar',$$أعمال الكهرباء$$,$$أسلاك، مقابس، تركيبات، وفحوصات سلامة من قبل كهربائيين معتمدين.$$),
  ('00000000-0000-0000-0000-000000000009','tr',$$Elektrik İşleri$$,$$Lisanslı elektrikçiler tarafından kablolama, priz, aydınlatma ve güvenlik kontrolü.$$),
  ('00000000-0000-0000-0000-000000000009','ru',$$Электромонтажные работы$$,$$Проводка, розетки, освещение и проверка безопасности лицензированными электриками.$$),
  ('00000000-0000-0000-0000-000000000009','zh',$$电气维修$$,$$由持证电工提供的布线、插座、灯具安装及安全检查。$$),

  ('00000000-0000-0000-0000-000000000010','nl',$$Zetel- en tapijtreiniging$$,$$Stoom- en dieptereiniging voor zetels, fauteuils en matrassen.$$),
  ('00000000-0000-0000-0000-000000000010','fr',$$Nettoyage canapé et tapis$$,$$Nettoyage vapeur en profondeur pour canapés, fauteuils et matelas.$$),
  ('00000000-0000-0000-0000-000000000010','de',$$Sofa- und Teppichreinigung$$,$$Dampf- und Tiefenreinigung für Sofas, Sessel und Matratzen.$$),
  ('00000000-0000-0000-0000-000000000010','en',$$Sofa & Carpet Cleaning$$,$$Steam and deep-clean for sofas, armchairs, and mattresses.$$),
  ('00000000-0000-0000-0000-000000000010','ar',$$تنظيف الأرائك والسجاد$$,$$تنظيف بالبخار وتنظيف عميق للأرائك والكراسي والمراتب.$$),
  ('00000000-0000-0000-0000-000000000010','tr',$$Koltuk ve Halı Yıkama$$,$$Koltuk, berjer ve yatak için buharla derin temizlik.$$),
  ('00000000-0000-0000-0000-000000000010','ru',$$Химчистка дивана и ковров$$,$$Паровая глубокая чистка диванов, кресел и матрасов.$$),
  ('00000000-0000-0000-0000-000000000010','zh',$$沙发地毯清洗$$,$$沙发、扶手椅和床垫的蒸汽深度清洁。$$),

  ('00000000-0000-0000-0000-000000000011','nl',$$Loodgieterswerken$$,$$Lekkages, leidingwerk en sanitaire installaties door erkende loodgieters.$$),
  ('00000000-0000-0000-0000-000000000011','fr',$$Plomberie$$,$$Fuites, tuyauterie et installations sanitaires par des plombiers agréés.$$),
  ('00000000-0000-0000-0000-000000000011','de',$$Klempnerarbeiten$$,$$Lecks, Rohrleitungen und Sanitärinstallationen durch geprüfte Klempner.$$),
  ('00000000-0000-0000-0000-000000000011','en',$$Plumbing$$,$$Leaks, pipework, and sanitary installations from licensed plumbers.$$),
  ('00000000-0000-0000-0000-000000000011','ar',$$أعمال السباكة$$,$$تسريبات، أنابيب، وتركيبات صحية من قبل سباكين مرخّصين.$$),
  ('00000000-0000-0000-0000-000000000011','tr',$$Su Tesisatı$$,$$Lisanslı tesisatçılar tarafından kaçak, boru döşeme ve sıhhi tesisat işleri.$$),
  ('00000000-0000-0000-0000-000000000011','ru',$$Сантехнические работы$$,$$Утечки, трубопроводы и сантехнические установки от лицензированных сантехников.$$),
  ('00000000-0000-0000-0000-000000000011','zh',$$水管维修$$,$$由持证水管工提供的漏水处理、管道及卫浴安装服务。$$),

  ('00000000-0000-0000-0000-000000000012','nl',$$Juridisch advies voor buitenlanders$$,$$Hulp bij verblijfsvergunningen, contracten en administratieve procedures door erkende juristen.$$),
  ('00000000-0000-0000-0000-000000000012','fr',$$Conseil juridique pour étrangers$$,$$Aide pour permis de séjour, contrats et démarches administratives par des juristes agréés.$$),
  ('00000000-0000-0000-0000-000000000012','de',$$Rechtsberatung für Ausländer$$,$$Unterstützung bei Aufenthaltstiteln, Verträgen und Behördengängen durch zugelassene Juristen.$$),
  ('00000000-0000-0000-0000-000000000012','en',$$Legal Advice for Foreigners$$,$$Help with residence permits, contracts, and administrative procedures from licensed legal advisors.$$),
  ('00000000-0000-0000-0000-000000000012','ar',$$استشارات قانونية للأجانب$$,$$مساعدة في تصاريح الإقامة والعقود والإجراءات الإدارية من قبل مستشارين قانونيين مرخّصين.$$),
  ('00000000-0000-0000-0000-000000000012','tr',$$Yabancılar için Hukuki Danışmanlık$$,$$Lisanslı hukuk danışmanlarından oturma izni, sözleşmeler ve idari işlemler konusunda destek.$$),
  ('00000000-0000-0000-0000-000000000012','ru',$$Юридическая консультация для иностранцев$$,$$Помощь с видом на жительство, договорами и административными процедурами от лицензированных юристов.$$),
  ('00000000-0000-0000-0000-000000000012','zh',$$外籍人士法律咨询$$,$$由持证法律顾问提供居留许可、合同及行政手续方面的协助。$$),

  ('00000000-0000-0000-0000-000000000013','nl',$$Beëdigde vertaling$$,$$Officiële vertaling van documenten voor overheidsinstanties, erkend door de rechtbank.$$),
  ('00000000-0000-0000-0000-000000000013','fr',$$Traduction assermentée$$,$$Traduction officielle de documents pour les administrations, agréée par le tribunal.$$),
  ('00000000-0000-0000-0000-000000000013','de',$$Beglaubigte Übersetzung$$,$$Amtlich anerkannte Übersetzung von Dokumenten für Behörden.$$),
  ('00000000-0000-0000-0000-000000000013','en',$$Certified Translation$$,$$Official, court-recognised translation of documents for government procedures.$$),
  ('00000000-0000-0000-0000-000000000013','ar',$$ترجمة معتمدة$$,$$ترجمة رسمية للمستندات معتمدة من المحكمة للإجراءات الحكومية.$$),
  ('00000000-0000-0000-0000-000000000013','tr',$$Yeminli Tercüme$$,$$Resmi kurumlar için mahkemece onaylı belge tercümesi.$$),
  ('00000000-0000-0000-0000-000000000013','ru',$$Заверенный перевод$$,$$Официальный, признанный судом перевод документов для государственных процедур.$$),
  ('00000000-0000-0000-0000-000000000013','zh',$$认证翻译$$,$$面向政府手续的官方文件翻译，经法院认可。$$),

  ('00000000-0000-0000-0000-000000000014','nl',$$Asbestverwijdering$$,$$Veilige, wettelijk erkende verwijdering en afvoer van asbesthoudend materiaal.$$),
  ('00000000-0000-0000-0000-000000000014','fr',$$Désamiantage$$,$$Enlèvement et évacuation sécurisés et agréés des matériaux contenant de l'amiante.$$),
  ('00000000-0000-0000-0000-000000000014','de',$$Asbestsanierung$$,$$Sichere, behördlich zugelassene Entfernung und Entsorgung asbesthaltiger Materialien.$$),
  ('00000000-0000-0000-0000-000000000014','en',$$Asbestos Removal$$,$$Safe, legally certified removal and disposal of asbestos-containing materials.$$),
  ('00000000-0000-0000-0000-000000000014','ar',$$إزالة الأسبستوس$$,$$إزالة والتخلص الآمن والمعتمد قانونيًا من المواد المحتوية على الأسبستوس.$$),
  ('00000000-0000-0000-0000-000000000014','tr',$$Asbest Sökümü$$,$$Asbest içeren malzemelerin güvenli ve yasal olarak onaylı şekilde sökülmesi ve bertarafı.$$),
  ('00000000-0000-0000-0000-000000000014','ru',$$Удаление асбеста$$,$$Безопасное, юридически сертифицированное удаление и утилизация асбестосодержащих материалов.$$),
  ('00000000-0000-0000-0000-000000000014','zh',$$石棉清除$$,$$安全、具备法定资质的石棉材料清除与处理服务。$$),

  ('00000000-0000-0000-0000-000000000015','nl',$$EPC-certificatie$$,$$Verplicht energieprestatiecertificaat opgesteld door een erkende EPC-deskundige.$$),
  ('00000000-0000-0000-0000-000000000015','fr',$$Certification PEB$$,$$Certificat de performance énergétique obligatoire établi par un expert agréé.$$),
  ('00000000-0000-0000-0000-000000000015','de',$$EPC-Zertifizierung$$,$$Vorgeschriebener Energieausweis, erstellt von einem zugelassenen Sachverständigen.$$),
  ('00000000-0000-0000-0000-000000000015','en',$$EPC Certification$$,$$Mandatory energy performance certificate prepared by a licensed EPC assessor.$$),
  ('00000000-0000-0000-0000-000000000015','ar',$$شهادة الأداء الطاقي (EPC)$$,$$شهادة الأداء الطاقي الإلزامية يعدها خبير معتمد.$$),
  ('00000000-0000-0000-0000-000000000015','tr',$$EPC Sertifikası$$,$$Lisanslı bir uzman tarafından hazırlanan zorunlu enerji performans sertifikası.$$),
  ('00000000-0000-0000-0000-000000000015','ru',$$Сертификация EPC$$,$$Обязательный сертификат энергоэффективности, подготовленный лицензированным экспертом.$$),
  ('00000000-0000-0000-0000-000000000015','zh',$$EPC能效认证$$,$$由持证EPC评估师出具的强制性能效证书。$$);
