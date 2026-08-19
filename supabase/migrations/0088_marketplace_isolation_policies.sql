-- Epic 12 WP04 — the RLS isolation policies for requests, quotes and engagements.
--
-- REQUESTS — ORDINARY DIRECT MEMBERSHIP
--
-- work.requests carries requesting_workspace_id directly — the same shape work.
-- workflow_instances (migration 0068) and work.maintenance_obligations (migration 0073)
-- already use.
--
-- QUOTES — VISIBLE TO EITHER PARTY, THE SAME COMBINED SHAPE work.service_records
-- ESTABLISHED (EPIC 11), APPLIED HERE FOR A SECOND TIME
--
-- A quote is visible to the offering workspace that wrote it (ordinary ownership) OR the
-- requesting workspace whose request it answers (the customer must see every quote to
-- compare and accept one — this is the whole point of the aggregate). Two independent
-- relationships combined with `or`, resolved by two different resolvers this time: direct
-- membership for the offeror, and a join through work.requests for the requester.
--
-- ENGAGEMENTS — VISIBLE TO EITHER PARTY, BOTH SIDES DIRECT
--
-- Simpler than quotes: work.engagements denormalises both requesting_workspace_id and
-- performing_workspace_id directly (0087's own header), so both halves of the OR are
-- ordinary direct-membership checks, no join needed for either side.

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
  'Either party (§19): the offering workspace directly, or the requesting workspace via its own request — a customer must see every quote on their request to compare and accept one.';

drop policy if exists "workspace members can view engagements" on work.engagements;
create policy "workspace members can view engagements"
  on work.engagements for select
  to authenticated
  using (
    requesting_workspace_id in (select workspace_id from api.current_workspace_memberships())
    or performing_workspace_id in (select workspace_id from api.current_workspace_memberships())
  );
