-- Phase 1 foundation tables (Klussie Core: Permissions groundwork, AI Gateway usage
-- tracking, feature flags, audit trail, domain events). See the architecture roadmap
-- for the full phase plan — this migration covers only what's needed for the security
-- hardening slice of Phase 1: authenticated + rate-limited AI endpoints.

-- =========================================================================
-- AI USAGE LOG — backs per-user rate limiting on the AI endpoints. Each endpoint call
-- (successful or not) writes one row here before/after doing the actual work; the
-- rate limiter counts recent rows for the calling user.
create table public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null check (endpoint in ('ai-intake', 'translate-message')),
  created_at timestamptz not null default now()
);

create index ai_usage_log_user_created_idx on public.ai_usage_log (user_id, created_at desc);

alter table public.ai_usage_log enable row level security;

-- The API functions authenticate as the calling user (via their access token, not a
-- service role key) and write/read only their own usage rows here.
create policy "users can log their own AI usage"
  on public.ai_usage_log for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can read their own AI usage"
  on public.ai_usage_log for select
  to authenticated
  using (auth.uid() = user_id);

-- =========================================================================
-- FEATURE FLAGS — public read (client and server both need to evaluate flags),
-- no client write policy: managed via the Supabase dashboard until the Phase 6 admin
-- surface exists to manage them properly.
create table public.feature_flags (
  key text primary key,
  enabled_globally boolean not null default false,
  enabled_countries jsonb not null default '[]'::jsonb,
  enabled_user_ids jsonb not null default '[]'::jsonb,
  rollout_percentage integer not null default 0 check (rollout_percentage between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;

create policy "anyone can read feature flags"
  on public.feature_flags for select
  to anon, authenticated
  using (true);

-- =========================================================================
-- AUDIT LOG — every sensitive mutation (email change, quote edit, refund, etc.) will
-- write here starting in the phases that introduce those mutations. Deliberately no
-- RLS policies at all yet: nothing in the client should ever write directly to an audit
-- trail (that defeats the point), so this stays locked down until a security-definer
-- function or service-role server code needs it.
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);

alter table public.audit_log enable row level security;
-- No policies — see comment above.

-- =========================================================================
-- DOMAIN EVENTS — the seed of the Core event bus. Individual event types get emitted
-- as the phase that owns that action ships; the AI endpoints emit the first two
-- (ai_intake.analyzed, message.translated) as of this migration. Same locked-down
-- posture as audit_log: no client policies, written only by trusted server code.
create table public.domain_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index domain_events_type_created_idx on public.domain_events (event_type, created_at desc);

alter table public.domain_events enable row level security;
-- No direct table policies — inserts go through emit_domain_event() below, so a caller
-- can add narrowly-shaped events but can't write arbitrary rows to a system log table.

-- security definer (same pattern as the trigger functions in 0001_init.sql): runs with
-- the owner's privileges, bypassing domain_events' otherwise-empty RLS, while still
-- only doing the one narrow thing this function is written to do.
create or replace function public.emit_domain_event(p_event_type text, p_payload jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.domain_events (event_type, payload) values (p_event_type, p_payload);
$$;

grant execute on function public.emit_domain_event(text, jsonb) to authenticated;
