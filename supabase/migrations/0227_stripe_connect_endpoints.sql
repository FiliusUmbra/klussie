-- api/stripe-connect-onboarding.js and api/stripe-connect-status.js both call
-- checkAndLogUsage() before their first real request — the same dynamically-resolved-
-- constraint-name idiom 0061, 0199, 0202, 0217 and 0222 all already established, widened
-- once more, before either endpoint is ever called live (0222's own restraint, not
-- 0217's "found live" shape).

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
  check (endpoint in (
    'ai-intake', 'translate-message', 'ask-about-item', 'suggest-item-details',
    'source-providers', 'suggest-service', 'stripe-connect-onboarding', 'stripe-connect-status'
  ));
