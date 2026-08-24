// Slice 5, WP 5.1 — ReportSheet.jsx's own cutover onto the real Trust & Safety contract
// (migration 0171, WP 5.0). submitReport() keeps its own name (matching this codebase's
// established "same external shape" client-cutover convention — Slice 2 WP 2.6's own
// header states it outright), but reportedWorkspaceId replaces proId: an enforcement
// action acts on a workspace, and legacy public.reports (0004) could never grow one
// without first naming the right thing. See safety.file_case_for_caller()'s own comment
// (0171) for the real-relationship check this now goes through — a caller with no real
// engagement against reportedWorkspaceId is refused, not silently accepted.
import { fileCase } from "./trustSafety.js";

export async function submitReport({ reporterId, reportedWorkspaceId, requestId, reason, details }) {
  await fileCase({
    reportedWorkspaceId,
    category: reason,
    details,
    subjectType: requestId ? "request" : null,
    subjectId: requestId || null,
    actorRef: reporterId,
  });
}
