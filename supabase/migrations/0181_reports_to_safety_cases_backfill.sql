-- Production cutover corrective backfill — legacy public.reports into safety.cases.
--
-- Not part of the original 0018-0180 sequence. Written and validated against a local
-- rehearsal copy of real (anonymized) production data during cutover planning
-- (docs/operations/PRODUCTION_CUTOVER_0018_0180.md, if/when saved — §5.2/§11.5). Not
-- applied anywhere yet.
--
-- WHY THIS EXISTS
--
-- safety.cases (0171) was built as reports' own real successor -- its own header names
-- reported_workspace_id, not reported_person_id, as the fix over legacy's own gap. But
-- 0171 only covers the live write path (safety.fileCase(), already the only writer since
-- Slice 5 shipped); nothing backfills the reports rows that predate it. Confirmed empirically,
-- not just by reading 0171: production carries 2 real reports and, absent this migration,
-- 0 safety.cases rows after all of 0018-0180 apply.
--
-- WHY reports.workspace_id IS NOT REUSED HERE, UNLIKE 0089'S OWN PRECEDENT
--
-- 0089's header explains why it reuses 0032/0035's already-resolved workspace_id columns
-- rather than re-deriving the identity -> membership -> workspace chain a third time. That
-- reasoning does not transfer here: checked directly against real data, reports.workspace_id
-- resolves to the *reporter's* Personal Workspace (0032/0035's general convention, workspace_id
-- = the requesting/customer side), not the *reported pro's* Professional Workspace that
-- safety.cases.reported_workspace_id actually needs. Reusing it here would silently misfile
-- every backfilled case against the wrong workspace. The identity -> membership -> workspace
-- chain is re-derived deliberately, once, for the one column that genuinely needs it.
--
-- STATUS MAPPING -- THREE LEGACY STATES INTO safety.cases' OWN THREE, NOT A 1:1 RENAME
--
-- legacy 'open' -> 'open'. legacy 'resolved' -> 'resolved'. legacy 'reviewed' -> 'open',
-- not 'escalated': "reviewed" in the legacy model means an operator looked at it, not that
-- it was formally escalated -- escalation is a real decision safety.decisions records, and
-- no legacy report row carries an equivalent decision to backfill one from.
--
-- Idempotent via legacy_report_id, the same bookkeeping-column idiom every other backfill
-- in this codebase uses (household_items_id, portfolio_item_id, legacy_quote_id, etc.).
-- Re-running is a no-op. Rollback: the two statements below are additive only -- drop the
-- column and its index; no row in public.reports is ever touched.

alter table safety.cases add column if not exists legacy_report_id uuid references public.reports (id) on delete set null;

create unique index if not exists cases_legacy_report_id_uidx
  on safety.cases (legacy_report_id) where legacy_report_id is not null;

with candidates as (
  select
    r.id as report_id,
    r.created_at,
    r.reason,
    r.details,
    r.status,
    platform.uuid_v7_at(r.created_at) as case_id,
    ri.person_ref as reporter_person_ref,
    w.id as reported_workspace_id,
    wr.id as work_request_id
  from public.reports r
  join identity.identities ri on ri.auth_user_id = r.reporter_id
  join identity.identities pi on pi.auth_user_id = r.pro_id
  join workspace.memberships m on m.person_ref = pi.person_ref and m.role = 'owner' and m.state = 'active'
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional'
  left join work.requests wr on wr.service_request_id = r.request_id
  where not exists (select 1 from safety.cases c where c.legacy_report_id = r.id)
)
insert into safety.cases (
  id, reporter_person_ref, reported_workspace_id, category, details,
  subject_type, subject_id, status, legacy_report_id, created_at, updated_at
)
select
  case_id,
  reporter_person_ref,
  reported_workspace_id,
  reason,
  details,
  case when work_request_id is not null then 'request' end,
  work_request_id,
  case status when 'resolved' then 'resolved' else 'open' end,
  report_id,
  created_at,
  now()
from candidates;
