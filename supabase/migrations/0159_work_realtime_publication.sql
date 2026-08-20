-- Platform Activation Slice 2, WP 2.6 (client cutover) — adds the six work.* tables the
-- client rewrite's own Realtime subscriptions listen to into the supabase_realtime
-- publication. Without this, every subscribe*() helper in src/lib/requests.js and
-- src/lib/messages.js installs a real Postgres channel listener that will NEVER fire:
-- logical replication only streams change events for tables actually named in a
-- publication, and none of these six ever were.
--
-- FOUND ONLY BY DRIVING THE REAL APP — INVISIBLE TO EVERY OTHER VERIFICATION METHOD USED
-- THIS SESSION
--
-- Confirmed live: accepting a quote as the customer correctly wrote a real work.engagements
-- row and a real work.conversations row with both real participants (proven directly in
-- Postgres) — the write and the read (a page reload showed the conversation correctly,
-- counterpart name and service resolved right) were both already correct. Only the LIVE
-- push never arrived; the customer's own Messages tab stayed on its empty state until a
-- manual reload. No SQL diagnostic this program has ever run exercises Realtime delivery
-- at all — every VERIFY_*.sql proves a write or a read is correct in one transaction, never
-- that a change event actually reaches a subscribed client. This is exactly the class of
-- gap the client cutover's own explicit "realtime continues working" success criterion
-- exists to catch, and the reason that criterion can only be checked by really driving the
-- app, not by any SQL-level proof.
--
-- WHY THESE SIX, MATCHING EXACTLY WHAT src/lib/requests.js / src/lib/messages.js SUBSCRIBE TO
--
--   work.requests, work.quotes, work.engagements  — subscribeToCustomerRequests(),
--                                                     subscribeToRequestQuotes(),
--                                                     subscribeToProQuoteUpdates()
--   work.conversations, work.conversation_participants,
--   work.messages                                  — subscribeToConversationsForUser(),
--                                                     subscribeToMessages()
--
-- Matches the four legacy tables already in this same publication
-- (public.service_requests, public.quotes, public.conversations, public.messages) —
-- the same mechanism, extended to the tables that replace them.
--
-- PUBLICATION MEMBERSHIP IS ORDINARY SQL, NOT A DASHBOARD-ONLY SETTING
--
-- Unlike PostgREST's exposed-schema list (ADR-0026 — genuinely dashboard-only, no SQL
-- equivalent exists), `ALTER PUBLICATION ... ADD TABLE` is standard, migration-applicable
-- DDL — the same class of change every RLS policy or grant in this programme already is.
-- No table's own RLS changes: Realtime respects each subscriber's existing row-level
-- policies independently: adding a table to the publication only makes the CHANGE STREAM
-- exist at all, it does not widen who may receive any given row's events.
--
-- PUBLICATION MEMBERSHIP ALONE WAS NOT ENOUGH — authenticated NEEDS A REAL BASE GRANT TOO
--
-- Publication membership makes the change STREAM exist; it does not decide who receives
-- any given event. Realtime's own postgres_changes broadcaster re-evaluates each
-- subscriber's row visibility directly against the table, as that subscriber's own role
-- (`authenticated`, carrying their real JWT claims) — never through the SECURITY DEFINER
-- api.* delegates the read/write contract itself uses. This session's own established
-- architecture (ADR-0026) deliberately grants `authenticated` nothing directly on any
-- engine schema table — reachable only through a thin api.* delegate — which is correct
-- for the request/response API path and was, until this migration, simply incompatible
-- with Realtime's own independent authorization model for these six tables. The four
-- legacy tables already in this publication (public.service_requests/quotes/
-- conversations/messages) have always granted `authenticated` full CRUD directly, relying
-- on RLS alone to narrow — the model Realtime expects. `GRANT SELECT` (not the legacy
-- shape's full CRUD — nothing client-side ever writes these six tables directly, only
-- through api.* delegates) plus `USAGE ON SCHEMA work` (referencing a schema-qualified
-- table requires it, independent of any table-level grant — the identical class of gap
-- 0158 already found for platform.actor_type) is the minimum that lets RLS do the actual
-- narrowing, matching the legacy precedent exactly. Confirmed empirically: without this,
-- a direct `authenticated`-role SELECT against work.messages fails outright with
-- `permission denied for schema work` — proof this grant, not merely the publication
-- membership above, was the missing piece.

alter publication supabase_realtime add table
  work.requests,
  work.quotes,
  work.engagements,
  work.conversations,
  work.conversation_participants,
  work.messages;

grant usage on schema work to authenticated;

grant select on
  work.requests,
  work.quotes,
  work.engagements,
  work.conversations,
  work.conversation_participants,
  work.messages
to authenticated;
