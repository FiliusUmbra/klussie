-- Document Understanding slice (Phase 4 of the Item Detail & Property Memory work) — the
-- only schema change this slice needs. Everything else reuses existing contracts:
--
--   * property.assets.source/ai_suggestion (0048) is documented as immutable after
--     creation (0139's own comment on update_asset(): "never source/ai_suggestion
--     (provenance, immutable after creation)") — it records how a row came to EXIST, not
--     a place to stage a later suggestion about an EXISTING row. Reusing it here would
--     mean quietly breaking a documented invariant. Confirmed facts from a document
--     therefore become ordinary values through the existing api.update_asset() — no
--     different from the homeowner having typed them into the edit form themselves.
--   * api.create_maintenance_obligation() (0142) already accepts an asset_id and a due
--     date and is already membership-checked; a suggested maintenance interval becomes
--     one concrete obligation through it, not a new recurrence engine the schema has
--     nowhere to hold today.
--   * The extraction call itself is api/_lib/aiGateway.js's existing reason() capability
--     (documents param, tool-forced structured output) — already live-verified in the
--     Item Detail slice's "ask Klussie about this appliance." Nothing new to invent
--     there either.
--
-- The one real gap: ai_usage_log.endpoint (0010) has a check constraint (widened once
-- already, 0199, for 'ask-about-item') that does not yet know this slice's new endpoint
-- name. Widened here with the same dynamically-resolved-constraint-name idiom 0199 and
-- 0061_document_dual_write.sql both already established, rather than assuming Postgres'
-- auto-generated name.

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
  check (endpoint in ('ai-intake', 'translate-message', 'ask-about-item', 'suggest-item-details'));
