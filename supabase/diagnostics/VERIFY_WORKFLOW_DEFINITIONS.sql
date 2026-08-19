-- Verifies 0066_workflow_definitions.sql and 0070_booking_workflow_definition.sql: the
-- real booking-lifecycle definition seeded correctly, and immutability holds — every
-- column but deprecated_at is frozen once published, and no row is ever deletable.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_WORKFLOW_DEFINITIONS.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_definition_id  uuid;
  v_stage_count    integer;
  v_rule_count     integer;
  v_terminal_count integer;
begin
  -- =========================================================================
  -- 1 · The seeded definition exists exactly once, platform-scoped, version 1

  select id into v_definition_id
  from work.workflow_definitions
  where definition_key = 'booking_request_lifecycle' and version = 1;

  if v_definition_id is null then
    raise exception '1 · booking_request_lifecycle v1 was not seeded by 0070';
  end if;

  if exists (
    select 1 from work.workflow_definitions
    where definition_key = 'booking_request_lifecycle' and workspace_id is not null
  ) then
    raise exception '1 · booking_request_lifecycle has a workspace-scoped row — it must be platform-scoped (workspace_id null)';
  end if;
  raise notice '1 · booking_request_lifecycle v1 seeded once, platform-scoped';

  -- =========================================================================
  -- 2 · Exactly five stages, exactly one terminal (reviewed)

  select count(*), count(*) filter (where is_terminal) into v_stage_count, v_terminal_count
  from work.workflow_stages where definition_id = v_definition_id;

  if v_stage_count <> 5 then
    raise exception '2 · expected 5 stages, found %', v_stage_count;
  end if;
  if v_terminal_count <> 1 then
    raise exception '2 · expected exactly 1 terminal stage, found %', v_terminal_count;
  end if;
  if not exists (
    select 1 from work.workflow_stages
    where definition_id = v_definition_id and stage_key = 'reviewed' and is_terminal
  ) then
    raise exception '2 · reviewed is not marked terminal';
  end if;
  raise notice '2 · five stages, exactly one terminal (reviewed)';

  -- =========================================================================
  -- 3 · Exactly six transition rules, including the instance-start rule and the
  -- quotes_ready self-loop this migration's own header explains

  select count(*) into v_rule_count
  from work.workflow_transition_rules where definition_id = v_definition_id;
  if v_rule_count <> 6 then
    raise exception '3 · expected 6 transition rules, found %', v_rule_count;
  end if;

  if not exists (
    select 1 from work.workflow_transition_rules
    where definition_id = v_definition_id and from_stage is null and to_stage = 'collecting'
      and event_key = 'RequestCreated'
  ) then
    raise exception '3 · missing the instance-start rule';
  end if;

  if not exists (
    select 1 from work.workflow_transition_rules
    where definition_id = v_definition_id and from_stage = 'quotes_ready' and to_stage = 'quotes_ready'
      and event_key = 'QuoteSubmitted'
  ) then
    raise exception '3 · missing the quotes_ready self-loop rule for a second QuoteSubmitted';
  end if;
  raise notice '3 · six transition rules present, including the start rule and the self-loop';

  -- =========================================================================
  -- 4 · Immutability: every column but deprecated_at is frozen once published

  update work.workflow_definitions set deprecated_at = now() where id = v_definition_id;
  raise notice '4a · deprecated_at accepted an update, as designed';
  update work.workflow_definitions set deprecated_at = null where id = v_definition_id;

  begin
    update work.workflow_definitions set name = 'renamed' where id = v_definition_id;
    raise exception '4b · updating name on a published definition did not raise';
  exception when others then
    if sqlerrm not like '%immutable once published%' then raise; end if;
  end;
  raise notice '4b · updating any column but deprecated_at correctly raises';

  begin
    delete from work.workflow_definitions where id = v_definition_id;
    raise exception '4c · deleting a published definition did not raise';
  exception when others then
    if sqlerrm not like '%never deleted%' then raise; end if;
  end;
  raise notice '4c · deleting a definition correctly raises';

  begin
    update work.workflow_stages set is_terminal = true
    where definition_id = v_definition_id and stage_key = 'collecting';
    raise exception '4d · updating a published stage did not raise';
  exception when others then
    if sqlerrm not like '%append-only once its definition is published%' then raise; end if;
  end;
  raise notice '4d · a definition''s stages are append-only once published';

  begin
    delete from work.workflow_transition_rules
    where id = (select id from work.workflow_transition_rules where definition_id = v_definition_id limit 1);
    raise exception '4e · deleting a published transition rule did not raise';
  exception when others then
    if sqlerrm not like '%append-only once its definition is published%' then raise; end if;
  end;
  raise notice '4e · a definition''s transition rules are append-only once published';

  raise notice 'VERIFY_WORKFLOW_DEFINITIONS: all checks passed';
end;
$$;

rollback;
