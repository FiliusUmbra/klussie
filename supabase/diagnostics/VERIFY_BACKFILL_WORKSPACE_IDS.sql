-- Verifies the backfill in 0035_backfill_workspace_ids.sql (Epic 03 WP06).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_BACKFILL_WORKSPACE_IDS.sql
--
-- Check 1 verifies real data: staging's three pro_profiles rows and their pro_stats and
-- pro_services children. Ten of the thirteen tables are empty on staging (marketplace
-- fixtures were never seeded), so checks 2-6 build a full synthetic scenario — a customer,
-- a pro, a request, a quote, a conversation, a message, a review, a report and a household
-- item — covering every one of the thirteen tables and the derived chain's ordering, then
-- roll the whole thing back.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · Real data — the Professional Workspace group, against staging's three pro_profiles

do $$
declare
  v_wrong bigint;
begin
  select count(*) into v_wrong
  from public.pro_profiles pp
  join identity.identities i on i.auth_user_id = pp.profile_id
  join workspace.memberships m on m.person_ref = i.person_ref
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional' and m.role = 'owner'
  where pp.workspace_id is distinct from w.id;

  if v_wrong > 0 then
    raise exception '% pro_profiles row(s) have the wrong workspace_id', v_wrong;
  end if;

  select count(*) into v_wrong from public.pro_profiles where workspace_id is null;
  if v_wrong > 0 then
    raise exception '% pro_profiles row(s) still have a null workspace_id', v_wrong;
  end if;

  select count(*) into v_wrong from public.pro_stats where workspace_id is null;
  if v_wrong > 0 then
    raise exception '% pro_stats row(s) still have a null workspace_id', v_wrong;
  end if;

  select count(*) into v_wrong from public.pro_services where workspace_id is null;
  if v_wrong > 0 then
    raise exception '% pro_services row(s) still have a null workspace_id', v_wrong;
  end if;

  raise notice '1 · every real pro_profiles/pro_stats/pro_services row has the correct workspace_id';
end;
$$;

-- =========================================================================
-- 2 · A full synthetic scenario — every table, the derived chain, and its ordering

begin;

set local session_replication_role = replica;

-- Two identities: a customer and a pro.
insert into identity.identities (person_ref, auth_user_id, full_name, locale, created_at, updated_at) values
  ('01930000-0000-7000-8000-00000000e001', '01930000-0000-7000-8000-0000000fe001', 'Wp Customer', 'nl', '2024-01-01 08:00:00+00', now()),
  ('01930000-0000-7000-8000-00000000e002', '01930000-0000-7000-8000-0000000fe002', 'Wp Pro',      'fr', '2024-02-01 08:00:00+00', now());

insert into public.profiles (id, full_name, locale, created_at) values
  ('01930000-0000-7000-8000-0000000fe001', 'Wp Customer', 'nl', '2024-01-01 08:00:00+00'),
  ('01930000-0000-7000-8000-0000000fe002', 'Wp Pro',      'fr', '2024-02-01 08:00:00+00');

insert into public.pro_profiles (profile_id, pro_type, created_at) values
  ('01930000-0000-7000-8000-0000000fe002', 'flexi', '2024-02-01 08:00:00+00');

-- Personal Workspace for the customer, Professional Workspace for the pro — the same
-- backfills WP 03.03/03.04 perform, built directly here so this check does not depend on
-- those migrations having already run against these specific synthetic rows.
insert into workspace.workspaces (id, type, name, created_at, updated_at) values
  ('01930000-0000-7000-8000-00000000e0aa', 'personal',     'My Home',   '2024-01-01 08:00:00+00', now()),
  ('01930000-0000-7000-8000-00000000e0bb', 'professional', 'Wp Pro Co', '2024-02-01 08:00:00+00', now());
insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at) values
  ('01930000-0000-7000-8000-00000000e0ac', '01930000-0000-7000-8000-00000000e0aa',
   '01930000-0000-7000-8000-00000000e001', 'owner', 'active', '2024-01-01 08:00:00+00', now()),
  ('01930000-0000-7000-8000-00000000e0bc', '01930000-0000-7000-8000-00000000e0bb',
   '01930000-0000-7000-8000-00000000e002', 'owner', 'active', '2024-02-01 08:00:00+00', now());

-- One row in every remaining table: portfolio_items, testimonials (professional group,
-- otherwise untested by real data); service_requests, service_request_photos,
-- conversations, messages, reviews, reports (requesting group); quotes (offering group);
-- household_items (owner's personal group).
insert into public.portfolio_items (pro_id, image_url, storage_path) values
  ('01930000-0000-7000-8000-0000000fe002', 'https://example.test/wp-probe.jpg', 'wp/probe/portfolio.jpg');
insert into public.testimonials (pro_id, client_name, quote_text) values
  ('01930000-0000-7000-8000-0000000fe002', 'Someone', 'Great work');

insert into public.categories (id, icon) values ('wp-probe-cat', 'Wrench') on conflict (id) do nothing;
insert into public.services (id, category_id, mode, base_price) values
  ('01930000-0000-7000-8000-00000000e05e', 'wp-probe-cat', 'quote', 100) on conflict (id) do nothing;

-- directed_until explicitly null: it defaults to now() + 24h (migration 0014), and
-- service_requests_directed_complete (0013) requires directed_pro_id, directed_until and
-- auto_accept_max to be either all null or all set together.
insert into public.service_requests (id, customer_id, service_id, category_id, when_pref, directed_until, created_at) values
  ('01930000-0000-7000-8000-00000000e05c', '01930000-0000-7000-8000-0000000fe001', '01930000-0000-7000-8000-00000000e05e', 'wp-probe-cat', 'flexible', null, '2024-03-01 08:00:00+00');

insert into public.service_request_photos (request_id, storage_path) values
  ('01930000-0000-7000-8000-00000000e05c', 'wp/probe/photo.jpg');

insert into public.quotes (id, request_id, pro_id, price, sent_at) values
  ('01930000-0000-7000-8000-00000000e09a', '01930000-0000-7000-8000-00000000e05c', '01930000-0000-7000-8000-0000000fe002', 150, '2024-03-02 08:00:00+00');

insert into public.conversations (id, request_id, customer_id, pro_id, created_at) values
  ('01930000-0000-7000-8000-00000000e0c1', '01930000-0000-7000-8000-00000000e05c', '01930000-0000-7000-8000-0000000fe001', '01930000-0000-7000-8000-0000000fe002', '2024-03-03 08:00:00+00');

insert into public.messages (id, conversation_id, sender_id, body, created_at) values
  ('01930000-0000-7000-8000-00000000e05d', '01930000-0000-7000-8000-00000000e0c1', '01930000-0000-7000-8000-0000000fe001', 'Hello', '2024-03-03 09:00:00+00');

insert into public.reviews (id, request_id, customer_id, pro_id, stars, created_at) values
  ('01930000-0000-7000-8000-00000000e07e', '01930000-0000-7000-8000-00000000e05c', '01930000-0000-7000-8000-0000000fe001', '01930000-0000-7000-8000-0000000fe002', 5, '2024-03-10 08:00:00+00');

insert into public.reports (id, reporter_id, pro_id, reason, created_at) values
  ('01930000-0000-7000-8000-00000000e07f', '01930000-0000-7000-8000-0000000fe001', '01930000-0000-7000-8000-0000000fe002', 'other', '2024-03-11 08:00:00+00');

insert into public.household_items (id, owner_id, name, category, source, created_at) values
  ('01930000-0000-7000-8000-00000000e041', '01930000-0000-7000-8000-0000000fe001', 'Wp Boiler', 'appliance', 'manual', '2024-01-15 08:00:00+00');

-- The real backfill statement, run against this synthetic population.
update public.pro_profiles pp set workspace_id = w.id
  from identity.identities i join workspace.memberships m on m.person_ref = i.person_ref
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional' and m.role = 'owner'
  where i.auth_user_id = pp.profile_id and pp.workspace_id is null;
update public.portfolio_items pi set workspace_id = w.id
  from public.pro_profiles pp join identity.identities i on i.auth_user_id = pp.profile_id
  join workspace.memberships m on m.person_ref = i.person_ref
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional' and m.role = 'owner'
  where pi.pro_id = pp.profile_id and pi.workspace_id is null;
update public.testimonials t set workspace_id = w.id
  from public.pro_profiles pp join identity.identities i on i.auth_user_id = pp.profile_id
  join workspace.memberships m on m.person_ref = i.person_ref
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional' and m.role = 'owner'
  where t.pro_id = pp.profile_id and t.workspace_id is null;
update public.quotes q set workspace_id = w.id
  from identity.identities i join workspace.memberships m on m.person_ref = i.person_ref
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional' and m.role = 'owner'
  where i.auth_user_id = q.pro_id and q.workspace_id is null;
update public.service_requests sr set workspace_id = w.id
  from identity.identities i join workspace.memberships m on m.person_ref = i.person_ref
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal' and m.role = 'owner'
  where i.auth_user_id = sr.customer_id and sr.workspace_id is null;
update public.service_request_photos srp set workspace_id = sr.workspace_id
  from public.service_requests sr where srp.request_id = sr.id and srp.workspace_id is null and sr.workspace_id is not null;
update public.conversations c set workspace_id = sr.workspace_id
  from public.service_requests sr where c.request_id = sr.id and c.workspace_id is null and sr.workspace_id is not null;
update public.messages msg set workspace_id = c.workspace_id
  from public.conversations c where msg.conversation_id = c.id and msg.workspace_id is null and c.workspace_id is not null;
update public.reviews r set workspace_id = w.id
  from identity.identities i join workspace.memberships m on m.person_ref = i.person_ref
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal' and m.role = 'owner'
  where i.auth_user_id = r.customer_id and r.workspace_id is null;
update public.reports rp set workspace_id = w.id
  from identity.identities i join workspace.memberships m on m.person_ref = i.person_ref
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal' and m.role = 'owner'
  where i.auth_user_id = rp.reporter_id and rp.workspace_id is null;
update public.household_items hi set workspace_id = w.id
  from identity.identities i join workspace.memberships m on m.person_ref = i.person_ref
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal' and m.role = 'owner'
  where i.auth_user_id = hi.owner_id and hi.workspace_id is null;

do $$
declare
  v_personal uuid := '01930000-0000-7000-8000-00000000e0aa';
  v_professional uuid := '01930000-0000-7000-8000-00000000e0bb';
  v_problems text[] := '{}';
begin
  if (select workspace_id from public.pro_profiles where profile_id = '01930000-0000-7000-8000-0000000fe002') is distinct from v_professional then
    v_problems := v_problems || 'pro_profiles';
  end if;
  if (select workspace_id from public.portfolio_items where pro_id = '01930000-0000-7000-8000-0000000fe002') is distinct from v_professional then
    v_problems := v_problems || 'portfolio_items';
  end if;
  if (select workspace_id from public.testimonials where pro_id = '01930000-0000-7000-8000-0000000fe002') is distinct from v_professional then
    v_problems := v_problems || 'testimonials';
  end if;
  if (select workspace_id from public.quotes where id = '01930000-0000-7000-8000-00000000e09a') is distinct from v_professional then
    v_problems := v_problems || 'quotes';
  end if;
  if (select workspace_id from public.service_requests where id = '01930000-0000-7000-8000-00000000e05c') is distinct from v_personal then
    v_problems := v_problems || 'service_requests';
  end if;
  if (select workspace_id from public.service_request_photos where request_id = '01930000-0000-7000-8000-00000000e05c') is distinct from v_personal then
    v_problems := v_problems || 'service_request_photos';
  end if;
  if (select workspace_id from public.conversations where id = '01930000-0000-7000-8000-00000000e0c1') is distinct from v_personal then
    v_problems := v_problems || 'conversations';
  end if;
  if (select workspace_id from public.messages where id = '01930000-0000-7000-8000-00000000e05d') is distinct from v_personal then
    v_problems := v_problems || 'messages';
  end if;
  if (select workspace_id from public.reviews where id = '01930000-0000-7000-8000-00000000e07e') is distinct from v_personal then
    v_problems := v_problems || 'reviews';
  end if;
  if (select workspace_id from public.reports where id = '01930000-0000-7000-8000-00000000e07f') is distinct from v_personal then
    v_problems := v_problems || 'reports';
  end if;
  if (select workspace_id from public.household_items where id = '01930000-0000-7000-8000-00000000e041') is distinct from v_personal then
    v_problems := v_problems || 'household_items';
  end if;

  if array_length(v_problems, 1) is not null then
    raise exception 'Wrong workspace_id resolved for: %', array_to_string(v_problems, ', ');
  end if;

  raise notice '2 · every one of the thirteen tables resolved to the correct workspace, including the derived chain';
end;
$$;

-- =========================================================================
-- 3 · Re-running is a no-op

do $$
declare
  v_before uuid[];
  v_after uuid[];
begin
  select array_agg(workspace_id order by id) into v_before from (
    select id, workspace_id from public.service_requests where id = '01930000-0000-7000-8000-00000000e05c'
    union all select id, workspace_id from public.messages where id = '01930000-0000-7000-8000-00000000e05d'
  ) x;

  update public.service_requests sr set workspace_id = w.id
    from identity.identities i join workspace.memberships m on m.person_ref = i.person_ref
    join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal' and m.role = 'owner'
    where i.auth_user_id = sr.customer_id and sr.workspace_id is null;
  update public.messages msg set workspace_id = c.workspace_id
    from public.conversations c where msg.conversation_id = c.id and msg.workspace_id is null and c.workspace_id is not null;

  select array_agg(workspace_id order by id) into v_after from (
    select id, workspace_id from public.service_requests where id = '01930000-0000-7000-8000-00000000e05c'
    union all select id, workspace_id from public.messages where id = '01930000-0000-7000-8000-00000000e05d'
  ) x;

  if v_before is distinct from v_after then
    raise exception 'Re-running the backfill changed an already-populated workspace_id';
  end if;

  raise notice '3 · re-running updates nothing already populated';
end;
$$;

rollback;

-- =========================================================================
-- 4 · Nothing was left behind

do $$
declare
  v_synthetic bigint;
begin
  select count(*) into v_synthetic from identity.identities
  where person_ref::text like '01930000-0000-7000-8000-00000000e%';

  if v_synthetic > 0 then
    raise exception 'The verification left % synthetic identity row(s) behind', v_synthetic;
  end if;

  raise notice '4 · no synthetic rows remain';
end;
$$;

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_BACKFILL_WORKSPACE_IDS: all checks passed';
end;
$$;
