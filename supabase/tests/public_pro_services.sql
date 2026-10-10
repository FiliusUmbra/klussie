-- Run after migration 0237, inside a transaction, then ROLLBACK. No real accounts used.
do $$
begin
  if has_function_privilege('anon', 'api.public_pro_services(uuid[])', 'EXECUTE') then
    raise exception 'anon must not be able to read professionals'' services';
  end if;
  if not has_function_privilege('authenticated', 'api.public_pro_services(uuid[])', 'EXECUTE') then
    raise exception 'authenticated must be able to call api.public_pro_services';
  end if;
  -- The function may expose only (pro_id, service_id) — nothing about workspaces, prices or cities.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.proname = 'public_pro_services'
      and pg_get_function_result(p.oid) !~* '^TABLE\(pro_id uuid, service_id uuid\)$'
  ) then
    raise exception 'api.public_pro_services must return exactly (pro_id, service_id)';
  end if;
end $$;
