-- Found live during a UX review, 2026-09-11: every `pro_services` row written through the
-- live app since Epic 03 shipped has `workspace_id is null`, because
-- src/lib/pros.js's updateProServices() never set it on insert. fetchProServices() (the same
-- file, immediately above it) reads `pro_services` scoped to `workspace_id` whenever the
-- caller has an active workspace -- which ProApp.jsx's own refreshServices() always does for
-- any real pro using the app. The write and the read have been silently incompatible since
-- the workspace-scoped read landed (WP 03.09): a pro selects their offered services, saves,
-- and the very next load shows none selected, because the row the save produced can never
-- match the filter the read applies. Reproduced live against staging before writing this
-- migration -- not assumed from reading the code.
--
-- THIS IS THE SAME SHAPE AS 0034/0135/0168 — A GAP DISCOVERED BY LOOKING PAST A ONE-TIME
-- BACKFILL'S OWN COVERAGE, NOT A NEW KIND OF BUG
--
-- 0035_backfill_workspace_ids.sql already ran this exact statement for `pro_services` once,
-- for whatever rows existed at Epic 03's own backfill moment (roadmap §14, WP 03.06). It was
-- never repeated, and nothing since has kept new rows in sync -- an ordinary one-time backfill
-- doing exactly its documented, narrower job, followed by a live write path (added later, or
-- simply never revisited) that assumed the column would keep populating itself. The
-- companion fix for the write path itself lives in the same PR that adds this migration
-- (src/lib/pros.js's updateProServices() now takes and sets workspace_id).
--
-- SAME STATEMENT AS 0035's OWN pro_services BLOCK, IDEMPOTENT THE SAME WAY
--
-- `where workspace_id is null` means a second run updates zero rows -- safe to apply
-- alongside the client fix without worrying about run order between the two.

update public.pro_services psv
set workspace_id = w.id
from public.pro_profiles pp
join identity.identities i on i.auth_user_id = pp.profile_id
join workspace.memberships m on m.person_ref = i.person_ref
join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional' and m.role = 'owner'
where psv.pro_id = pp.profile_id
  and psv.workspace_id is null;
