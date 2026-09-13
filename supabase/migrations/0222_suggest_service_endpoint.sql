-- api/suggest-service.js's own checkAndLogUsage() call needs this endpoint name in the
-- constraint before its first real request — the same dynamically-resolved-constraint-
-- name idiom 0061, 0199, 0202 and 0217 all already established, widened once more.
-- Fixed here, in its own migration, before this endpoint is ever called live, rather
-- than found the way 0217's own header describes (a raw Postgres constraint-violation
-- error reaching a real customer first).

do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.ai_usage_log'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%endpoint%';

  if v_constraint_name is not null then
    execute format('alter table public.ai_usage_log drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.ai_usage_log
  add constraint ai_usage_log_endpoint_check
  check (endpoint in ('ai-intake', 'translate-message', 'ask-about-item', 'suggest-item-details', 'source-providers', 'suggest-service'));
