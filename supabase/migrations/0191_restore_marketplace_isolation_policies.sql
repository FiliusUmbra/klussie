-- Restores 0088_marketplace_isolation_policies.sql's own three RLS policies on
-- work.requests / work.quotes / work.engagements. Staging currently has zero policies on
-- any of the three (`select * from pg_policies where schemaname = 'work'` returns 0 rows),
-- despite RLS being enabled on all three (relrowsecurity = t) and 0088 never being
-- superseded or dropped by any later migration -- grep across every migration file for
-- "workspace members can view requests/quotes/engagements" finds only 0088's own
-- idempotent drop-then-create, nothing after it.
--
-- WHY THIS IS A REAL GAP, NOT A COSMETIC ONE
--
-- `authenticated` genuinely holds direct SELECT + schema USAGE on all three tables --
-- confirmed live: `set local role authenticated; select 1 from work.quotes;` succeeds
-- with no permission error (0088's own grants, still present and never revoked). With RLS
-- enabled and zero policies, that currently means default-deny -- a direct query returns
-- zero rows, so today this is fail-safe, not a leak: no customer/pro data is exposed by
-- the missing policies as they stand. But it is a real drift from migration history, in
-- the same "Missing RLS" family as the four gaps already found and repaired under the
-- earlier authorization-audit checkpoint (property.my_properties() et al, migration
-- 0189) -- restored here as defense-in-depth before it becomes load-bearing.
--
-- Found while re-running VERIFY_MARKETPLACE_ISOLATION.sql: its own section 1
-- (work.my_requests()/quotes_for_request()/my_quotes() called unimpersonated) was
-- separately stale and masked this -- the diagnostic's `do $$` block raised its first
-- exception there, so execution never reached section 2's pg_policies check until section
-- 1 was fixed to call the real client read path (api.* under a real impersonated session).
--
-- WP 2.1 (migration 0145) separately added an equivalent membership check *inside* the
-- work.my_requests()/quotes_for_request()/my_quotes() function bodies themselves, and
-- every real client read already goes through those functions (or their api.* delegates,
-- which are SECURITY DEFINER and bypass RLS entirely as their owner) -- so restoring these
-- table-level policies changes no behaviour the app exercises today. It closes the one
-- path that was never meant to be open: a direct, unmediated query against work.requests/
-- work.quotes/work.engagements as `authenticated`.
--
-- Bodies are byte-identical to 0088's own -- nothing added, nothing dropped except the
-- policies being recreated (via 0088's own `drop policy if exists` idempotency pattern),
-- no grant or table structure touched.

drop policy if exists "workspace members can view requests" on work.requests;
create policy "workspace members can view requests"
  on work.requests for select
  to authenticated
  using (
    requesting_workspace_id in (select workspace_id from api.current_workspace_memberships())
  );

drop policy if exists "workspace members can view quotes" on work.quotes;
create policy "workspace members can view quotes"
  on work.quotes for select
  to authenticated
  using (
    offering_workspace_id in (select workspace_id from api.current_workspace_memberships())
    or request_id in (
      select r.id from work.requests r
      where r.requesting_workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
  );

comment on policy "workspace members can view quotes" on work.quotes is
  'Either party (§19): the offering workspace directly, or the requesting workspace via its own request -- a customer must see every quote on their request to compare and accept one.';

drop policy if exists "workspace members can view engagements" on work.engagements;
create policy "workspace members can view engagements"
  on work.engagements for select
  to authenticated
  using (
    requesting_workspace_id in (select workspace_id from api.current_workspace_memberships())
    or performing_workspace_id in (select workspace_id from api.current_workspace_memberships())
  );
