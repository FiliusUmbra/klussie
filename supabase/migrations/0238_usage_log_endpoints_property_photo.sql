-- Widens public.ai_usage_log's endpoint check for two endpoints that call
-- checkAndLogUsage() and are not in the list 0227 left behind:
--
--   * 'property-photo'  — api/property-photo.js (this change): the Street View hero for a
--     customer's own home. It is rate limited like every other endpoint here because each real
--     image fetch is billed by Google.
--   * 'stripe-subscription-checkout' — api/stripe-subscription-checkout.js (Payments Slice B)
--     has called checkAndLogUsage() since it shipped, but 0227 widened the constraint for the
--     two Stripe *Connect* endpoints only. Its first real call would have failed the check on
--     the usage-log insert and returned a 500 before ever reaching Stripe — never noticed
--     because Stripe is inert (no key configured). Fixed here, before it is ever called live
--     (0222/0227's own restraint), and guarded by a unit test that compares every
--     `const ENDPOINT` in api/*.js against this list so the next endpoint cannot repeat it.
--
-- Same dynamically-resolved-constraint-name idiom 0061, 0199, 0202, 0217, 0222 and 0227 used.

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
    'source-providers', 'suggest-service', 'stripe-connect-onboarding', 'stripe-connect-status',
    'stripe-subscription-checkout', 'property-photo'
  ));
