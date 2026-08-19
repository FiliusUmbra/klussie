-- Epic 03 WP10 — the RLS isolation backstop (roadmap §14, narrowed in flight by ADR-0025).
--
-- Roadmap §14 wrote WP 03.10 as "reshape RLS policies to isolation and membership. The 58
-- existing policies simplify; richer logic moves to the engine." ADR-0025 (accepted) found
-- two classes of existing policy that cannot be reshaped that way without deleting the
-- mechanism that makes the marketplace work — see "THE NAMED EXCEPTIONS" below — and
-- decided: "WP 03.10 adds workspace isolation; it removes no existing policy."
--
-- WHAT THIS MIGRATION DOES, MECHANICALLY
--
-- One new permissive SELECT policy per table, on all thirteen tables WP 03.05 gave a
-- workspace_id column: "a live member of this row's workspace may read it" —
-- SUPABASE_ARCHITECTURE.md §6's isolation predicate, using the uncorrelated-subquery shape
-- ADR-0026 "As implemented" requires: `workspace_id in (select workspace_id from
-- api.current_workspace_memberships())`, never `api.is_workspace_member(workspace_id)`,
-- which does not exist and must not be reintroduced (0031's own regression guard).
--
-- Nothing is dropped. Nothing existing is replaced. PostgreSQL OR-combines permissive
-- policies for the same command, so a new one changes what is *additionally* allowed and
-- narrows nothing already allowed (ADR-0025 property 3). Concretely, today: every workspace
-- this predicate can match has exactly the same one member as the row's existing owner
-- column already names (WP 03.03/03.04's backfill), so this migration is not observed by
-- any current user — its value is that WP 03.11's read switch, and every later epic that
-- adds a member beyond the sole owner (starting with household invites), lands on a table
-- already carrying the isolation policy it needs, rather than a migration remembering to
-- add one at the same time behaviour changes.
--
-- WHY SELECT ONLY, NOT INSERT/UPDATE/DELETE
--
-- SUPABASE_ARCHITECTURE.md §7 puts reads and writes on different paths deliberately: direct
-- client reads are "the primary gate ... where membership alone is the correct answer,"
-- while writes are gateway-mediated — authorised by an already-correct application decision
-- that RLS only backstops. There is no gateway yet (ADR-0024), so writes continue exactly
-- as before, through the same bespoke policies this migration does not touch: "customers
-- manage own requests," "pros manage own service list," and every other business-action
-- predicate in migrations 0001–0016. A workspace-membership WITH CHECK would be
-- architecturally premature here — write authorization for anything beyond membership
-- management belongs to the engine that owns the business action (ADR-0027 scoped Epic 03's
-- own permission vocabulary the same way, to workspace lifecycle and membership only) — and
-- practically inert today, since no insert path sets workspace_id yet (WP 03.06 backfilled
-- existing rows only). Read-path scoping is what WP 03.11 needs; that is what this builds.
--
-- THE NAMED EXCEPTIONS (ADR-0025) — SURVIVE UNCHANGED, NOT REPLACED BY THIS MIGRATION
--
--   Pre-engagement discovery: "pros can view matching requests" (service_requests),
--   "pros can send quotes on matching requests" (quotes), public.pro_matches_request().
--   No engagement exists yet, so no scoped membership exists to carry a professional's
--   access to a request they do not yet hold a relationship with (PLATFORM_DOMAIN_MODEL.md
--   §8). Epic 12 replaces these when engagements produce scoped memberships; until then a
--   browsing professional's access comes entirely from these policies, not from this one.
--
--   Professional publication: "pro profiles/stats/services are publicly viewable",
--   "portfolio items are publicly viewable", "testimonials are publicly viewable", "reviews
--   are publicly viewable" — `to anon, authenticated using (true)`. Visibility to signed-out
--   visitors cannot be expressed by any membership predicate. Adding the isolation policy to
--   these tables anyway is intentional, not an oversight: it is subsumed by the existing
--   `using (true)` (true OR anything is true) and costs nothing, and it keeps the invariant
--   uniform — every workspace-scoped table carries the same isolation policy, whether or
--   not another policy already makes it redundant on that particular table.
--
--   Bilateral crossings not named by ADR-0025: "participants can view own conversations"
--   and "participants can view messages" admit BOTH sides — `customer_id = auth.uid() or
--   pro_id = auth.uid()`. A conversation is homed with the requesting workspace
--   (DATABASE_ARCHITECTURE.md §6, the Crossing Registry), so the isolation policy this
--   migration adds covers the customer side; the professional's side continues to come
--   entirely from the existing bilateral policy, exactly as it does today. This is the same
--   shape as the two named classes — a party with no membership in the workspace that owns
--   the row — arising from the same cause (Epic 12's engagements do not exist yet). Not
--   listed in ADR-0025 because it requires no exception: unlike Class 1 and Class 2, nothing
--   here needed reshaping in a way ADR-0025 had to rule out, so there was nothing to decide.
--
-- RE-RUNNABILITY
--
-- `create policy` has no `if not exists` form. `drop policy if exists ... ; create policy
-- ...` is the guarded pattern this repository already uses (0016, 0022) for exactly this
-- gap.

-- =========================================================================
-- PROFESSIONAL WORKSPACE

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

-- =========================================================================
-- REQUESTING WORKSPACE

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

-- =========================================================================
-- OFFERING WORKSPACE

drop policy if exists "workspace members can view quotes" on public.quotes;
create policy "workspace members can view quotes"
  on public.quotes for select
  to authenticated
  using (workspace_id in (select workspace_id from api.current_workspace_memberships()));

-- =========================================================================
-- OWNER'S PERSONAL WORKSPACE

drop policy if exists "workspace members can view household_items" on public.household_items;
create policy "workspace members can view household_items"
  on public.household_items for select
  to authenticated
  using (workspace_id in (select workspace_id from api.current_workspace_memberships()));
