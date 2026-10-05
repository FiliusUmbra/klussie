-- Run after migration 0236, inside a transaction, then ROLLBACK. No real accounts used.
-- Structural checks only: the behavioural proof (a professional sees the address only after
-- the customer's consent, an unrelated provider never does) needs a full request / quote /
-- engagement / disclosure fixture and is listed as a manual staging check in
-- docs/engineering/LIVE_REVIEW_2026-10-04_STATUS.md (item 6).
do $$
begin
  if has_function_privilege('anon', 'api.disclosed_location_for_job(uuid)', 'EXECUTE') then
    raise exception 'anon must not be able to read a disclosed job location';
  end if;
  if not has_function_privilege('authenticated', 'api.disclosed_location_for_job(uuid)', 'EXECUTE') then
    raise exception 'authenticated must be able to call api.disclosed_location_for_job';
  end if;
  if has_function_privilege('anon', 'api.my_quote_messages(uuid)', 'EXECUTE') then
    raise exception 'anon must not be able to read quote messages';
  end if;
  if not has_function_privilege('authenticated', 'api.my_quote_messages(uuid)', 'EXECUTE') then
    raise exception 'authenticated must be able to call api.my_quote_messages';
  end if;
  -- The only columns the address read may expose: no coordinates, no access instructions.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.proname = 'disclosed_location_for_job'
      and pg_get_function_result(p.oid) ~* '(latitude|longitude|access_instructions)'
  ) then
    raise exception 'api.disclosed_location_for_job must not return coordinates or access instructions';
  end if;
end $$;
