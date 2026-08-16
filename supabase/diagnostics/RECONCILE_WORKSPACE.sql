-- Epic 03 WP07 — reconciles the workspace_id backfilled by 0035 against the rule stated
-- and cited in 0032, for all thirteen tables.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/RECONCILE_WORKSPACE.sql
--
-- Step 4 of the migration pattern (IMPLEMENTATION_ROADMAP.md §3), and a **hard gate**:
-- §3 says "a read-switch without a passing reconciliation is not permitted," and this is
-- the evidence WP 03.09/03.10/03.12 need before any read becomes workspace-scoped.
--
-- READ-ONLY. It writes nothing.
--
-- WHAT THIS FILE DOES NOT PRETEND
--
-- Ten of the thirteen tables hold zero rows on staging — no marketplace fixtures were ever
-- seeded (a gap this repository has already recorded in more than one place). Zero
-- discrepancies over zero rows is not evidence, the same principle RECONCILE_IDENTITY.sql
-- states for a single table, applied here across thirteen. So this file reports, per table,
-- how many real rows it actually compared — an honest count, not a silent zero passed off
-- as coverage. WP 03.06's own diagnostic already exercised every one of the thirteen tables
-- against a synthetic population; this file's job is different: it is the check against
-- *real* data, however much of it exists in the environment it runs against, re-run every
-- time real data grows.
--
-- WHAT COUNTS AS A DISCREPANCY
--
-- For each table, the stored `workspace_id` must equal the value the table's own stated
-- rule (0032's header) would compute fresh, right now, from the tables it depends on. Not
-- "is not null" — a wrong-but-present value is the failure mode most likely to go unnoticed
-- otherwise, and the one WP 03.10's RLS depends on this file having ruled out.

\set ON_ERROR_STOP on

-- =========================================================================
-- 0 · Real row counts per table — informational, not fatal
--
-- Unlike RECONCILE_IDENTITY.sql's single hard gate, a table reporting zero here is an
-- already-documented, expected condition (WP 03.06 finding: staging has no marketplace
-- fixtures) rather than a sign of a broken environment. Printed so the gap is visible
-- every time this runs, not just in the work package record that first found it.

do $$
declare
  v_counts text;
begin
  select string_agg(format('%s=%s', t, c), ', ' order by t) into v_counts
  from (
    select 'pro_profiles' t, count(*) c from public.pro_profiles
    union all select 'pro_stats', count(*) from public.pro_stats
    union all select 'pro_services', count(*) from public.pro_services
    union all select 'portfolio_items', count(*) from public.portfolio_items
    union all select 'testimonials', count(*) from public.testimonials
    union all select 'service_requests', count(*) from public.service_requests
    union all select 'service_request_photos', count(*) from public.service_request_photos
    union all select 'conversations', count(*) from public.conversations
    union all select 'messages', count(*) from public.messages
    union all select 'reviews', count(*) from public.reviews
    union all select 'reports', count(*) from public.reports
    union all select 'quotes', count(*) from public.quotes
    union all select 'household_items', count(*) from public.household_items
  ) x;

  raise notice '--- real row counts: % ---', v_counts;
end;
$$;

-- =========================================================================
-- 1 · Professional Workspace group — pro_profiles, pro_stats, pro_services,
-- portfolio_items, testimonials

do $$
declare
  v_wrong bigint;
  v_compared bigint;
begin
  select count(*) into v_compared from public.pro_profiles;
  select count(*) into v_wrong
  from public.pro_profiles pp
  left join (
    select i.auth_user_id, w.id as expected
    from identity.identities i
    join workspace.memberships m on m.person_ref = i.person_ref
    join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional' and m.role = 'owner'
  ) expected on expected.auth_user_id = pp.profile_id
  where pp.workspace_id is distinct from expected.expected;

  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % pro_profiles row(s) have a workspace_id that does not match their owner''s Professional Workspace', v_wrong;
  end if;

  select count(*) into v_wrong
  from public.pro_stats ps
  left join public.pro_profiles pp on pp.profile_id = ps.pro_id
  where ps.workspace_id is distinct from pp.workspace_id;
  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % pro_stats row(s) disagree with their pro_profiles workspace', v_wrong;
  end if;

  select count(*) into v_wrong
  from public.pro_services psv
  left join public.pro_profiles pp on pp.profile_id = psv.pro_id
  where psv.workspace_id is distinct from pp.workspace_id;
  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % pro_services row(s) disagree with their pro_profiles workspace', v_wrong;
  end if;

  select count(*) into v_wrong
  from public.portfolio_items pi
  left join public.pro_profiles pp on pp.profile_id = pi.pro_id
  where pi.workspace_id is distinct from pp.workspace_id;
  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % portfolio_items row(s) disagree with their pro_profiles workspace', v_wrong;
  end if;

  select count(*) into v_wrong
  from public.testimonials t
  left join public.pro_profiles pp on pp.profile_id = t.pro_id
  where t.workspace_id is distinct from pp.workspace_id;
  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % testimonials row(s) disagree with their pro_profiles workspace', v_wrong;
  end if;

  raise notice '1 · Professional Workspace group agrees (% pro_profiles row(s) compared)', v_compared;
end;
$$;

-- =========================================================================
-- 2 · Offering workspace — quotes

do $$
declare
  v_wrong bigint;
  v_compared bigint;
begin
  select count(*) into v_compared from public.quotes;
  select count(*) into v_wrong
  from public.quotes q
  left join (
    select i.auth_user_id, w.id as expected
    from identity.identities i
    join workspace.memberships m on m.person_ref = i.person_ref
    join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional' and m.role = 'owner'
  ) expected on expected.auth_user_id = q.pro_id
  where q.workspace_id is distinct from expected.expected;

  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % quotes row(s) have a workspace_id that does not match the offering pro''s Professional Workspace', v_wrong;
  end if;

  raise notice '2 · offering workspace agrees on quotes (% row(s) compared)', v_compared;
end;
$$;

-- =========================================================================
-- 3 · Requesting workspace group — service_requests, and its dependents

do $$
declare
  v_wrong bigint;
  v_compared bigint;
begin
  select count(*) into v_compared from public.service_requests;
  select count(*) into v_wrong
  from public.service_requests sr
  left join (
    select i.auth_user_id, w.id as expected
    from identity.identities i
    join workspace.memberships m on m.person_ref = i.person_ref
    join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal' and m.role = 'owner'
  ) expected on expected.auth_user_id = sr.customer_id
  where sr.workspace_id is distinct from expected.expected;

  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % service_requests row(s) have a workspace_id that does not match the customer''s Personal Workspace', v_wrong;
  end if;

  raise notice '3 · requesting workspace agrees on service_requests (% row(s) compared)', v_compared;
end;
$$;

do $$
declare
  v_wrong bigint;
  v_compared bigint;
begin
  select count(*) into v_compared from public.service_request_photos;
  select count(*) into v_wrong
  from public.service_request_photos srp
  join public.service_requests sr on sr.id = srp.request_id
  where srp.workspace_id is distinct from sr.workspace_id;
  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % service_request_photos row(s) disagree with their service_requests workspace', v_wrong;
  end if;
  raise notice '4 · service_request_photos agrees with its parent request (% row(s) compared)', v_compared;
end;
$$;

do $$
declare
  v_wrong bigint;
  v_compared bigint;
begin
  select count(*) into v_compared from public.conversations;
  select count(*) into v_wrong
  from public.conversations c
  join public.service_requests sr on sr.id = c.request_id
  where c.workspace_id is distinct from sr.workspace_id;
  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % conversations row(s) disagree with their service_requests workspace', v_wrong;
  end if;
  raise notice '5 · conversations agrees with its bound request (% row(s) compared)', v_compared;
end;
$$;

do $$
declare
  v_wrong bigint;
  v_compared bigint;
begin
  select count(*) into v_compared from public.messages;
  select count(*) into v_wrong
  from public.messages msg
  join public.conversations c on c.id = msg.conversation_id
  where msg.workspace_id is distinct from c.workspace_id;
  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % messages row(s) disagree with their conversation''s workspace', v_wrong;
  end if;
  raise notice '6 · messages agrees with its conversation (% row(s) compared)', v_compared;
end;
$$;

do $$
declare
  v_wrong bigint;
  v_compared bigint;
begin
  select count(*) into v_compared from public.reviews;
  select count(*) into v_wrong
  from public.reviews r
  left join (
    select i.auth_user_id, w.id as expected
    from identity.identities i
    join workspace.memberships m on m.person_ref = i.person_ref
    join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal' and m.role = 'owner'
  ) expected on expected.auth_user_id = r.customer_id
  where r.workspace_id is distinct from expected.expected;
  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % reviews row(s) have a workspace_id that does not match the reviewing customer''s Personal Workspace', v_wrong;
  end if;
  raise notice '7 · reviews agrees on the reviewing workspace (% row(s) compared)', v_compared;
end;
$$;

do $$
declare
  v_wrong bigint;
  v_compared bigint;
begin
  select count(*) into v_compared from public.reports;
  select count(*) into v_wrong
  from public.reports rp
  left join (
    select i.auth_user_id, w.id as expected
    from identity.identities i
    join workspace.memberships m on m.person_ref = i.person_ref
    join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal' and m.role = 'owner'
  ) expected on expected.auth_user_id = rp.reporter_id
  where rp.workspace_id is distinct from expected.expected;
  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % reports row(s) have a workspace_id that does not match the reporting workspace', v_wrong;
  end if;
  raise notice '8 · reports agrees on the reporting workspace (% row(s) compared)', v_compared;
end;
$$;

-- =========================================================================
-- 9 · Owner's Personal Workspace — household_items

do $$
declare
  v_wrong bigint;
  v_compared bigint;
begin
  select count(*) into v_compared from public.household_items;
  select count(*) into v_wrong
  from public.household_items hi
  left join (
    select i.auth_user_id, w.id as expected
    from identity.identities i
    join workspace.memberships m on m.person_ref = i.person_ref
    join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal' and m.role = 'owner'
  ) expected on expected.auth_user_id = hi.owner_id
  where hi.workspace_id is distinct from expected.expected;
  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % household_items row(s) have a workspace_id that does not match the owner''s Personal Workspace', v_wrong;
  end if;
  raise notice '9 · household_items agrees on the owner''s Personal Workspace (% row(s) compared)', v_compared;
end;
$$;

-- =========================================================================
-- 10 · No row in any of the thirteen tables was left with a null workspace_id
--
-- Distinct from every check above: those compare a stored value against an expected one
-- when a matching identity/membership exists. This catches the case none of them would —
-- a row whose owner never resolved to any workspace at all.

do $$
declare
  v_nulls text[] := '{}';
  t text;
begin
  foreach t in array array[
    'pro_profiles', 'pro_stats', 'pro_services', 'portfolio_items', 'testimonials',
    'service_requests', 'service_request_photos', 'conversations', 'messages',
    'reviews', 'reports', 'quotes', 'household_items'
  ] loop
    if (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = t and column_name = 'workspace_id') = 1 then
      declare
        v_null_count bigint;
      begin
        execute format('select count(*) from public.%I where workspace_id is null', t) into v_null_count;
        if v_null_count > 0 then
          v_nulls := v_nulls || format('%s=%s', t, v_null_count);
        end if;
      end;
    end if;
  end loop;

  if array_length(v_nulls, 1) is not null then
    raise exception 'DISCREPANCY: unresolved (still-null) workspace_id remains in: %', array_to_string(v_nulls, ', ');
  end if;

  raise notice '10 · no row in any of the thirteen tables has an unresolved workspace_id';
end;
$$;

-- =========================================================================

do $$
declare
  v_total bigint;
begin
  select
    (select count(*) from public.pro_profiles) + (select count(*) from public.pro_stats) +
    (select count(*) from public.pro_services) + (select count(*) from public.portfolio_items) +
    (select count(*) from public.testimonials) + (select count(*) from public.service_requests) +
    (select count(*) from public.service_request_photos) + (select count(*) from public.conversations) +
    (select count(*) from public.messages) + (select count(*) from public.reviews) +
    (select count(*) from public.reports) + (select count(*) from public.quotes) +
    (select count(*) from public.household_items)
  into v_total;

  raise notice 'RECONCILE_WORKSPACE: PASSED over % total row(s) across thirteen tables', v_total;

  if v_total < 10 then
    raise notice
      'NOTE: real coverage is thin (% rows). This is a known, documented gap (WP 03.06 finding) — most tables hold no marketplace fixtures on this environment. This run is a valid pass over what exists, not a substitute for seeding real data before WP 03.09/03.10 rely on it at scale.',
      v_total;
  end if;
end;
$$;
