-- Epic 16 WP01 — the audit write path: platform.write_audit_record(), the piece
-- 0022_audit.sql's own header named as deliberately unallocated.
--
-- "Every promotion is an explicit, recorded, audited operation" (DATABASE_ARCHITECTURE.md
-- §6/§33) is this epic's own binding requirement for knowledge.promote_fact() (WP 16.06).
-- Nothing can honour that today: 0022's own header states plainly "the privileged write
-- path itself is NOT in this package" and revokes INSERT on platform.audit_records from
-- every application role, leaving only the table owner able to write it — tracked since
-- Epic 01 as unallocated debt (MASTER_CONTEXT.md §12), with its own suggested shape
-- already written down: "A SECURITY DEFINER function owned by a role that can write,
-- callable by engines that cannot — the same shape as platform.emit_event()." This
-- migration is that function, built the epic that first genuinely needs it, exactly as
-- the debt row anticipated.
--
-- MIRRORS platform.emit_event() DELIBERATELY, NOT A NEW PATTERN
--
-- Same schema (`platform`), same reasoning for SECURITY DEFINER (0023's own header: an
-- engine does not own `platform`, and giving it direct write access to another engine's
-- schema is exactly what §9 exists to prevent — SECURITY DEFINER lets every engine reach
-- a shared, privileged contract rather than around it), same identifier discipline
-- (ADR-0022: audit_id is a required, caller-supplied parameter, never minted here), same
-- "revoke from PUBLIC first, grant to named engines after" access shape. The one
-- structural difference is `p_action`'s format: platform.audit_records' own check
-- constraint is `^[a-z_]+\.[a-z_]+$` — TWO dotted segments, not three like event_type —
-- so callers get it right from this function's own signature rather than by copying
-- event_type's shape and being wrong the way every engine contract was until Epic 15's
-- own finding (implementation/epic-15/COMPLETION.md §6) corrected it.
--
-- GRANTED TO klussie_engine_knowledge ONLY, FOR NOW — THE SAME RESTRAINT emit_event()'S
-- OWN HEADER STATES
--
-- "A consumer emitting a derived event is a real case... but no such consumer exists" —
-- 0023's own words for why it grants only engines, not consumers, at the time it shipped.
-- Identical restraint here: klussie_engine_knowledge is the one real caller this epic
-- gives it (knowledge.promote_fact(), WP 16.06). Any other engine that later has a real
-- audited action to record is a one-line grant addition to this function, not a redesign.

create or replace function platform.write_audit_record(
  p_audit_id       uuid,
  p_workspace_id   uuid,
  p_actor_type     platform.actor_type,
  p_actor_ref      text,
  p_action         text,
  p_subject_type   text,
  p_subject_id     uuid,
  p_outcome        platform.audit_outcome,
  p_authority      text,
  p_correlation_id uuid,
  p_detail         jsonb       default '{}'::jsonb,
  p_occurred_at    timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into platform.audit_records (
    audit_id, occurred_at, workspace_id, actor_type, actor_ref, action,
    subject_type, subject_id, outcome, authority, correlation_id, detail
  ) values (
    p_audit_id, p_occurred_at, p_workspace_id, p_actor_type, p_actor_ref, p_action,
    p_subject_type, p_subject_id, p_outcome, p_authority, p_correlation_id, p_detail
  );
end;
$$;

comment on function platform.write_audit_record(
  uuid, uuid, platform.actor_type, text, text, text, uuid,
  platform.audit_outcome, text, uuid, jsonb, timestamptz
) is
  'The privileged write path for platform.audit_records — 0022''s own "not in this package" gap, closed here because Epic 16''s promotion operation is the first real caller. Mirrors platform.emit_event() (0023): SECURITY DEFINER, application-generated audit_id, revoked from PUBLIC then granted to named engines only. p_action is two dotted segments (platform.audit_records'' own check constraint), not three like event_type.';

-- =========================================================================
-- ACCESS — USAGE on schema platform first (klussie_engine_knowledge never held it —
-- see 0106's own header for why calling ANY schema-qualified function needs this, not
-- just EXECUTE on the function itself), then revoke the default PUBLIC grant, exactly as
-- 0023 does, then name the one real caller.

grant usage on schema platform to klussie_engine_knowledge;

revoke all on function platform.write_audit_record(
  uuid, uuid, platform.actor_type, text, text, text, uuid,
  platform.audit_outcome, text, uuid, jsonb, timestamptz
) from public;

grant execute on function platform.write_audit_record(
  uuid, uuid, platform.actor_type, text, text, text, uuid,
  platform.audit_outcome, text, uuid, jsonb, timestamptz
) to klussie_engine_knowledge;
