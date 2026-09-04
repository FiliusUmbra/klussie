-- Two small, independent findings from resuming the negative-authorization probe queue
-- (Beta mission checkpoint), bundled here because both are quick, low-risk grant/policy
-- restorations discovered in the same run.

-- =========================================================================
-- 1 · Restore 0037's own workspace-isolation backstop policy on 13 legacy public.* tables
--
-- 0037_workspace_isolation_policies.sql (Epic 03 WP10, ADR-0025) added one permissive
-- SELECT policy per table -- "a live member of this row's workspace may read it" -- to all
-- thirteen tables WP 03.05 gave a workspace_id column. No later migration drops or
-- supersedes any of the thirteen; staging currently has none of them.
--
-- Every pre-existing, more specific policy on these tables is intact (checked live) --
-- "customers manage own requests," "pro profiles are publicly viewable," and so on all
-- still work exactly as before. What's missing is only the ADDITIONAL backstop: a SECOND
-- member of the same household/workspace (not the literal owner_id a table's own
-- pre-existing policy is keyed to) currently cannot see another member's household items,
-- service requests, quotes, conversations, messages, reviews, or reports. This is a
-- functionality gap in the fail-safe direction -- nobody gains inappropriate access,
-- someone who SHOULD see shared household data currently can't -- not a privacy exposure.
--
-- Bodies are byte-identical to 0037's own -- the single uniform predicate,
-- `workspace_id in (select workspace_id from api.current_workspace_memberships())`,
-- SELECT-only, `to authenticated`, per table. Grants and columns already match what 0037
-- expects (checked live before writing this).

drop policy if exists "workspace members can view pro_profiles" on public.pro_profiles;
create policy "workspace members can view pro_profiles"
  on public.pro_profiles for select
  to authenticated
  using (workspace_id in (select workspace_id from api.current_workspace_memberships()));

drop policy if exists "workspace members can view pro_stats" on public.pro_stats;
create policy "workspace members can view pro_stats"
  on public.pro_stats for select
  to authenticated
  using (workspace_id in (select workspace_id from api.current_workspace_memberships()));

drop policy if exists "workspace members can view pro_services" on public.pro_services;
create policy "workspace members can view pro_services"
  on public.pro_services for select
  to authenticated
  using (workspace_id in (select workspace_id from api.current_workspace_memberships()));

drop policy if exists "workspace members can view portfolio_items" on public.portfolio_items;
create policy "workspace members can view portfolio_items"
  on public.portfolio_items for select
  to authenticated
  using (workspace_id in (select workspace_id from api.current_workspace_memberships()));

drop policy if exists "workspace members can view testimonials" on public.testimonials;
create policy "workspace members can view testimonials"
  on public.testimonials for select
  to authenticated
  using (workspace_id in (select workspace_id from api.current_workspace_memberships()));

drop policy if exists "workspace members can view service_requests" on public.service_requests;
create policy "workspace members can view service_requests"
  on public.service_requests for select
  to authenticated
  using (workspace_id in (select workspace_id from api.current_workspace_memberships()));

drop policy if exists "workspace members can view service_request_photos" on public.service_request_photos;
create policy "workspace members can view service_request_photos"
  on public.service_request_photos for select
  to authenticated
  using (workspace_id in (select workspace_id from api.current_workspace_memberships()));

drop policy if exists "workspace members can view conversations" on public.conversations;
create policy "workspace members can view conversations"
  on public.conversations for select
  to authenticated
  using (workspace_id in (select workspace_id from api.current_workspace_memberships()));

drop policy if exists "workspace members can view messages" on public.messages;
create policy "workspace members can view messages"
  on public.messages for select
  to authenticated
  using (workspace_id in (select workspace_id from api.current_workspace_memberships()));

drop policy if exists "workspace members can view reviews" on public.reviews;
create policy "workspace members can view reviews"
  on public.reviews for select
  to authenticated
  using (workspace_id in (select workspace_id from api.current_workspace_memberships()));

drop policy if exists "workspace members can view reports" on public.reports;
create policy "workspace members can view reports"
  on public.reports for select
  to authenticated
  using (workspace_id in (select workspace_id from api.current_workspace_memberships()));

drop policy if exists "workspace members can view quotes" on public.quotes;
create policy "workspace members can view quotes"
  on public.quotes for select
  to authenticated
  using (workspace_id in (select workspace_id from api.current_workspace_memberships()));

drop policy if exists "workspace members can view household_items" on public.household_items;
create policy "workspace members can view household_items"
  on public.household_items for select
  to authenticated
  using (workspace_id in (select workspace_id from api.current_workspace_memberships()));

-- =========================================================================
-- 2 · Revoke authenticated's USAGE on schema workspace
--
-- ADR-0026's own explicit, absolute invariant (VERIFY_MEMBERSHIP_HELPER.sql check 2's own
-- words): "workspace stays closed to authenticated... this holds without authenticated
-- ever gaining USAGE on workspace itself." No migration ever grants this to
-- `authenticated` -- only to the specific engine/consumer roles that legitimately own or
-- read inside this schema (klussie_engine_platform, klussie_engine_commerce,
-- klussie_consumer_workspace). Checked live before writing this: `authenticated` has zero
-- table-level and zero function-level grants anywhere inside schema workspace, so this
-- USAGE is currently inert -- nothing is actually reachable through it today. Restoring
-- the invariant anyway: `workspace` is meant to be reachable only through its own
-- SECURITY DEFINER api.* delegates (api.current_workspace_memberships() and its
-- siblings), never directly.

revoke usage on schema workspace from authenticated;
