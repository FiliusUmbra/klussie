-- Epic 03 WP9 — directed requests, implementing ADR-0012 ("one-tap booking commits the
-- customer, not the professional").
--
-- The conversation canvas recommends exactly one professional. Tapping book must be one
-- action for the customer and must still not commit the professional to anything they
-- haven't agreed to. quotes.price is NOT NULL and the canvas holds only an AI estimate
-- range, so the platform cannot write a quote on the professional's behalf without
-- inventing their price — the shortcut PRODUCT_CONSTITUTION.md Rule 9 rules out.
--
-- So one tap creates a *directed* request instead: addressed to one professional,
-- carrying the ceiling the customer pre-authorized when they accepted the estimate.
-- The professional still sends their own quote. If it lands at or under that ceiling,
-- the customer's earlier consent is applied automatically and the request books through
-- the existing handle_quote_accepted() path — unchanged, with every trigger and domain
-- event firing for real reasons.
--
-- No new "booked" writer is introduced. That is the point: one path to 'booked', and it
-- still runs through a real quote from a real professional.

-- Re-runnable on purpose. This repository keeps no migration ledger — 0001_init.sql's
-- own header says "paste this into the SQL Editor" — so there is nothing recording which
-- files have already been applied, and the honest failure mode is somebody re-running one
-- and hitting `column "directed_pro_id" ... already exists` with no way to tell whether
-- the rest of the file landed. Every statement *in this file* is therefore guarded, so
-- applying it twice is a no-op rather than an error. Run supabase/diagnostics/CHECK_STATE.sql
-- to see what is actually present.
--
-- Scope warning: 0013, 0014 and 0015 are guarded. 0001–0012 are NOT — they still use bare
-- `create table` / `add column` / `create index`, so re-running any of those fails exactly
-- the way described above. Do not read this file as evidence that the migration set as a
-- whole is replayable.
--
-- Edited in place rather than corrected by a follow-up, which is the opposite of what
-- 0014's header describes (and of how 0005 corrected 0004). The distinction: a follow-up
-- is required when the *schema outcome* changes, because production already has the old
-- outcome. Nothing here changes the outcome — a fresh database ends up with the same
-- columns, the same constraint names and the same constraint definitions either way — so
-- this is a replayability change to the file, not a correction to the schema, and
-- splitting it into 0016 would leave the un-runnable version as the one people find first.

-- =========================================================================
-- COLUMNS
--
-- Constraints are declared separately below rather than inline on the columns. With
-- `add column if not exists`, Postgres skips the *entire* column definition when the
-- column already exists — including any inline REFERENCES or CHECK. A database where the
-- column landed but its constraint didn't is precisely the partially-applied state this
-- guarding exists to repair, and inline constraints would silently leave it unrepaired
-- while reporting success.
alter table public.service_requests
  add column if not exists directed_pro_id uuid,
  -- When the exclusive window closes. ADR-0012 named the unanswered directed request as
  -- a real failure mode and left the answer to this package: the request falls back to
  -- open quoting. Expiry is evaluated lazily by pro_matches_request() rather than by a
  -- scheduled job — no cron or external scheduler exists in this project, and a
  -- visibility rule that expires on read needs neither.
  add column if not exists directed_until timestamptz,
  -- The customer's pre-authorization: the most they agreed to before seeing a quote.
  -- Not a payment hold — no money moves until Epic 04 (ADR-0005 gates it).
  add column if not exists auto_accept_max numeric(10,2);

-- Both carry the exact names Postgres would have generated for the inline forms
-- (<table>_<column>_fkey, <table>_<column>_check), so a database built from the earlier
-- version of this file and one built from this version are indistinguishable.
alter table public.service_requests drop constraint if exists service_requests_directed_pro_id_fkey;
alter table public.service_requests
  add constraint service_requests_directed_pro_id_fkey
  foreign key (directed_pro_id) references public.pro_profiles (profile_id);

alter table public.service_requests drop constraint if exists service_requests_auto_accept_max_check;
alter table public.service_requests
  add constraint service_requests_auto_accept_max_check check (auto_accept_max > 0);

comment on column public.service_requests.directed_pro_id is
  'ADR-0012: the one professional this request is addressed to. Null for ordinary open requests.';
comment on column public.service_requests.auto_accept_max is
  'ADR-0012: ceiling the customer pre-authorized. A quote from directed_pro_id at or below this, inside directed_until, is accepted automatically.';

-- All three travel together. A request directed at nobody, or directed with no ceiling,
-- is not a state this feature has any meaning in — better rejected by the database than
-- handled defensively in three places.
alter table public.service_requests drop constraint if exists service_requests_directed_complete;
alter table public.service_requests
  add constraint service_requests_directed_complete check (
    (directed_pro_id is null and directed_until is null and auto_accept_max is null)
    or (directed_pro_id is not null and directed_until is not null and auto_accept_max is not null)
  );

-- 'awaiting_pro' — placed by the customer, waiting on one named professional. Distinct
-- from 'collecting' (open, waiting on anyone) and from 'quotes_ready' (something to
-- decide). Inserted inline in 0001_init.sql, so the constraint carries the default name.
alter table public.service_requests drop constraint if exists service_requests_status_check;
alter table public.service_requests
  add constraint service_requests_status_check check (
    status in ('collecting','awaiting_pro','quotes_ready','booked','completed','reviewed','cancelled')
  );

-- The pro's own lead list filters on this; partial because directed requests are the
-- minority and an index over mostly-nulls earns nothing.
create index if not exists service_requests_directed_pro_idx
  on public.service_requests (directed_pro_id)
  where directed_pro_id is not null;

-- =========================================================================
-- VISIBILITY
--
-- pro_matches_request() is the single gate for both "may this pro see this request?"
-- (service_requests select policy, 0004) and "may this pro quote on it?" (quotes insert
-- policy, 0004), plus the request-photo policies in 0007. Extending it here rather than
-- amending each policy keeps that one source of truth — and means a directed request is
-- invisible to other professionals at the database, not merely unlisted by the client.
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
      -- ADR-0012: while the window is open a directed request belongs to one pro alone.
      -- Once it lapses the row becomes an ordinary open request and every matching pro
      -- can see it — the fallback, with no job needed to perform it.
      and (
        sr.directed_pro_id is null
        or sr.directed_pro_id = p_pro_id
        or sr.directed_until <= now()
      )
  );
$$;

-- =========================================================================
-- AUTO-ACCEPT
--
-- Extends handle_quote_sent() (0001_init.sql, last touched by 0012 for QuoteSubmitted).
-- Two changes: 'awaiting_pro' now also advances to 'quotes_ready', and a directed quote
-- within the pre-authorized ceiling is accepted on the customer's behalf.
--
-- The acceptance is an UPDATE, deliberately: handle_quote_accepted() is a BEFORE UPDATE
-- trigger, so inserting a row already marked 'accepted' would silently skip booking the
-- request, declining siblings, and opening the conversation. Routing through the update
-- keeps exactly one implementation of what acceptance means. It recurses one level and
-- no further — handle_quote_sent fires on INSERT only.
create or replace function public.handle_quote_sent()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  req public.service_requests%rowtype;
begin
  select * into req from public.service_requests where id = new.request_id;

  update public.service_requests
  set status = 'quotes_ready'
  where id = new.request_id and status in ('collecting','awaiting_pro');

  perform public.emit_domain_event('QuoteSubmitted', jsonb_build_object(
    'requestId', new.request_id,
    'quoteId', new.id,
    'proId', new.pro_id,
    'price', new.price
  ));

  -- Every condition is required. The pre-authorization was given to one professional,
  -- for one window, up to one number: a quote from anyone else, or after the window
  -- lapsed, or over the ceiling, goes back to the customer to decide the ordinary way.
  if req.directed_pro_id is not null
     and req.directed_pro_id = new.pro_id
     and req.directed_until > now()
     and new.price <= req.auto_accept_max
  then
    update public.quotes set status = 'accepted' where id = new.id and status = 'sent';
  end if;

  return new;
end;
$$;
