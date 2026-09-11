-- Found live, not by reading code: calling api/source-providers.js against a real
-- session (customer@staging.klussie.test, staging) returned a raw, unhandled Postgres
-- error straight to the client -- "new row for relation \"ai_usage_log\" violates check
-- constraint \"ai_usage_log_endpoint_check\"" -- because api/_lib/rateLimit.js's own
-- checkAndLogUsage() tried to log this new endpoint against a constraint that has never
-- heard of it. The same dynamically-resolved-constraint-name idiom 0199, 0202 and
-- 0061_document_dual_write.sql all already established, widened once more.
--
-- THE SEPARATE, PRE-EXISTING BUG THIS EXPOSED, NOT FIXED HERE
--
-- The raw message reaching the client is a real instance of the exact anti-pattern this
-- codebase has repeatedly named and fixed elsewhere (documents.js's own header: "a raw
-- err.message here would be a raw Postgres error... a generic, localized message, never
-- the backend's own words") -- but the leak is in api/ai-intake.js's and
-- api/ask-about-item.js's own shared catch shape (`res.status(status).json({ error:
-- err.message })` for anything that isn't AuthError/RateLimitError), not in this
-- migration. It was latent in both existing endpoints too, just never triggered because
-- their own endpoint names were already in the constraint. Flagged for a separate fix
-- (api/source-providers.js's own handler already avoids it); widening the constraint here
-- is the schema half of unblocking sourcing, not a fix for the client-side leak.

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
  check (endpoint in ('ai-intake', 'translate-message', 'ask-about-item', 'suggest-item-details', 'source-providers'));
