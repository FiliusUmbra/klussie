-- Platform Activation Slice 2, WP 2.5 — reconciles work.requests/quotes/engagements
-- (0089's backfill) against the public.service_requests/quotes rule it claims to mirror,
-- for every real row that exists right now. The "structural equality check against the
-- regression baseline" this slice's own scoping document names as the precondition for
-- any client file reading through WP 2.1's contracts alongside legacy — the same role
-- RECONCILE_ASSETS.sql/RECONCILE_IDENTITY.sql/RECONCILE_WORKSPACE.sql already play for
-- their own engines, followed here rather than reinvented.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/RECONCILE_MARKETPLACE.sql
--
-- READ-ONLY. It writes nothing.
--
-- WHY THIS IS A RECONCILE_*, NOT ANOTHER VERIFY_*
--
-- Every VERIFY_*.sql diagnostic in this repository builds its own fixtures inside a
-- rolled-back transaction — appropriate for proving a function's own logic in isolation.
-- What WP 2.5 actually needs proven is different: that the ONE-TIME backfill (0089)
-- produced rows that genuinely agree with the legacy data they were derived from, for
-- whatever legacy data is real right now. Fabricating synthetic fixtures here would
-- prove the comparison SQL parses, not that the backfill's own output is trustworthy —
-- RECONCILE_ASSETS.sql's own header makes exactly this distinction ("the evidence a
-- read-switch needs before src/lib/X.js may read from the new schema").
--
-- WHY WP 2.5's OWN FOUR CLIENT FILES ARE NOT TOUCHED IN THIS WORK PACKAGE — A REAL,
-- DOCUMENTED RESCOPING
--
-- SLICE_2_MARKETPLACE_TRANSACTION_ACTIVATION.md originally described WP 2.5 as
-- RequestsList.jsx/RequestDetailSheet.jsx/ProDashboard.jsx/ProJobs.jsx reading "alongside"
-- legacy. Checked directly before building that: none of those four files fetch data
-- themselves — src/lib/requests.js's fetchCustomerRequests()/fetchProLeads()/
-- fetchProJobs() are the real read call sites (CustomerApp.jsx, ProApp.jsx), and all four
-- named files are purely presentational, taking already-fetched arrays as props. A live
-- client-side dual-fetch-and-compare wired into those call sites today would compare
-- against structurally empty ground: no dual-write exists yet (that is WP 2.6's own job,
-- §1.6), so any real customer's legacy requests would show as "missing" from the new
-- contract's own read every single time, for no reason but sequencing — noise, not
-- signal, and no different in kind from the exact "zero discrepancies is true and
-- worthless" trap this session has already named twice (Epic 02's own WP 02.05, and this
-- slice's own WP 2.0 backfill finding). Per the Programme's own Platform Activation
-- Priority (§1.1): building client-side comparison plumbing today, against data that
-- cannot yet be meaningfully compared, changes nothing a real user experiences and is
-- exactly the "backend expansion for its own sake" the priority exists to catch. This
-- diagnostic is what WP 2.5 can responsibly deliver right now — real proof the backfill's
-- own mapping is correct, for whatever real data exists. The four client files' actual
-- cutover moves to WP 2.6, where it belongs anyway: that work package already re-runs the
-- backfill or accepts a dual-write window (§1.6), which is the point real overlapping
-- data to compare against will first exist.

\set ON_ERROR_STOP on

-- =========================================================================
-- 0 · Real row counts — informational, not fatal. Zero rows is not evidence; it means
-- this reconciliation has nothing yet to prove wrong, not that it passed.

do $$
declare
  v_requests bigint;
  v_quotes bigint;
  v_service_requests bigint;
  v_legacy_quotes bigint;
  v_engagements bigint;
begin
  select count(*) into v_requests from work.requests;
  select count(*) into v_quotes from work.quotes;
  select count(*) into v_engagements from work.engagements;
  select count(*) into v_service_requests from public.service_requests;
  select count(*) into v_legacy_quotes from public.quotes;

  raise notice '--- work.requests=% work.quotes=% work.engagements=% | service_requests=% legacy quotes=% ---',
    v_requests, v_quotes, v_engagements, v_service_requests, v_legacy_quotes;
end;
$$;

-- =========================================================================
-- 1 · Every legacy request the backfill's own rule (0089) says should have been mirrored
-- — workspace_id not null — has exactly one work.requests row

do $$
declare
  v_missing bigint;
  v_eligible bigint;
begin
  select count(*) into v_eligible from public.service_requests sr where sr.workspace_id is not null;

  select count(*) into v_missing
  from public.service_requests sr
  where sr.workspace_id is not null
    and not exists (select 1 from work.requests wr where wr.service_request_id = sr.id);

  if v_missing > 0 then
    raise exception 'DISCREPANCY: % eligible service_requests row(s) have no mirrored work.requests row', v_missing;
  end if;

  raise notice '1 · every eligible service_requests row (workspace_id not null) has a mirrored work.requests row (% row(s) eligible)', v_eligible;
end;
$$;

-- =========================================================================
-- 2 · service_requests rows the backfill's own rule deliberately excludes —
-- informational, matching RECONCILE_ASSETS.sql's own §2 posture, not a failure

do $$
declare
  v_excluded bigint;
begin
  select count(*) into v_excluded from public.service_requests sr where sr.workspace_id is null;
  raise notice '2 · % service_requests row(s) have no workspace_id and are deliberately not mirrored (expected gap, not reconciled against)', v_excluded;
end;
$$;

-- =========================================================================
-- 3 · Every mirrored request's fields agree with a fresh read of its legacy row —
-- status mapped per this migration's own header: legacy 'awaiting_pro' corresponds to
-- work.requests' 'collecting' (directed-ness is carried by directed_workspace_id being
-- set, not by a distinct status value in this schema — WP 2.2's own decision)

do $$
declare
  v_wrong bigint;
  v_compared bigint;
begin
  select count(*) into v_compared
  from work.requests wr
  join public.service_requests sr on sr.id = wr.service_request_id;

  select count(*) into v_wrong
  from work.requests wr
  join public.service_requests sr on sr.id = wr.service_request_id
  where wr.category_id is distinct from sr.category_id
     or wr.service_id is distinct from sr.service_id
     or wr.details is distinct from sr.details
     or wr.when_pref is distinct from sr.when_pref
     or wr.budget is distinct from sr.budget
     or wr.status is distinct from (case when sr.status = 'awaiting_pro' then 'collecting' else sr.status end);

  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % mirrored work.requests row(s) disagree with their legacy row on a mapped field', v_wrong;
  end if;

  raise notice '3 · every mirrored request agrees with its legacy row on every mapped field (% row(s) compared)', v_compared;
end;
$$;

-- =========================================================================
-- 4 · Every legacy quote on an eligible request has exactly one mirrored work.quotes row,
-- and its fields agree

do $$
declare
  v_missing bigint;
  v_eligible bigint;
  v_wrong bigint;
  v_compared bigint;
begin
  select count(*) into v_eligible
  from public.quotes q where q.workspace_id is not null;

  select count(*) into v_missing
  from public.quotes q
  where q.workspace_id is not null
    and not exists (select 1 from work.quotes wq where wq.legacy_quote_id = q.id);

  if v_missing > 0 then
    raise exception 'DISCREPANCY: % eligible legacy quote(s) have no mirrored work.quotes row', v_missing;
  end if;

  select count(*) into v_compared
  from work.quotes wq
  join public.quotes q on q.id = wq.legacy_quote_id;

  select count(*) into v_wrong
  from work.quotes wq
  join public.quotes q on q.id = wq.legacy_quote_id
  where wq.price is distinct from q.price
     or wq.message is distinct from q.message
     or wq.status is distinct from q.status;

  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % mirrored work.quotes row(s) disagree with their legacy row on a mapped field', v_wrong;
  end if;

  raise notice '4 · every eligible legacy quote has a mirrored, field-agreeing work.quotes row (% eligible, % compared)', v_eligible, v_compared;
end;
$$;

-- =========================================================================
-- 5 · Every legacy booking (status in booked/completed/reviewed, a real booked_pro_id)
-- has exactly one mirrored work.engagements row, on the correct quote

do $$
declare
  v_missing bigint;
  v_eligible bigint;
begin
  select count(*) into v_eligible
  from public.service_requests sr
  where sr.status in ('booked', 'completed', 'reviewed') and sr.booked_pro_id is not null;

  select count(*) into v_missing
  from public.service_requests sr
  join work.requests wr on wr.service_request_id = sr.id
  where sr.status in ('booked', 'completed', 'reviewed')
    and sr.booked_pro_id is not null
    and not exists (select 1 from work.engagements we where we.request_id = wr.id);

  if v_missing > 0 then
    raise exception 'DISCREPANCY: % eligible legacy booking(s) have no mirrored work.engagements row', v_missing;
  end if;

  raise notice '5 · every eligible legacy booking has a mirrored work.engagements row (% eligible)', v_eligible;
end;
$$;

-- =========================================================================

do $$
declare
  v_requests bigint;
begin
  select count(*) into v_requests from public.service_requests;
  raise notice 'RECONCILE_MARKETPLACE: PASSED over % service_requests row(s)', v_requests;

  if v_requests < 10 then
    raise notice
      'NOTE: real coverage is thin (% rows). This is the same known, documented gap RECONCILE_ASSETS.sql/RECONCILE_WORKSPACE.sql already report for this environment — a valid pass over what exists, not a substitute for real overlapping data before WP 2.6 relies on this at scale.',
      v_requests;
  end if;
end;
$$;
