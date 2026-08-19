// Platform Activation Slice 1, WP 1.3 — a workspace's own maintenance obligations, for
// My Home's due/overdue list.
//
// A SEPARATE FILE FROM homeInventory.js, DELIBERATELY
//
// Maintenance obligations are workspace-scoped (api.my_maintenance_obligations(),
// migration 0137, takes p_workspace_id), not property-scoped — unlike Locations and
// Documents, which homeInventory.js fetches once a property_id resolves. Folding this
// into fetchHomeProfile() would mean threading a workspaceId through a function whose
// entire existing contract is "resolve the property," which useHomeContext.js already
// keeps separate for exactly this reason (see how `items`/fetchHouseholdItems() is its
// own effect there, not part of fetchHomeProfile()).
import { supabase } from "./supabaseClient";

/**
 * Every open and recently-settled obligation for a workspace, is_overdue already computed
 * server-side (work.my_maintenance_obligations(), Epic 10) — no client-side date math to
 * get wrong. Open obligations first (overdue before not-yet-due, by due date), settled
 * ones after — a customer opening this list wants to see what needs attention before what
 * is already handled.
 *
 * Never throws. A caller with no real membership in the workspace sees an empty list —
 * the same EXISTS-gated behaviour every read switch since WP 0.4 already produces — and so
 * does any other failure (an unresolved schema, a missing function).
 */
export async function fetchMaintenanceObligations(workspaceId) {
  if (!workspaceId) return [];
  try {
    const { data, error } = await supabase.schema("api").rpc("my_maintenance_obligations", { p_workspace_id: workspaceId });
    if (error) {
      console.warn("maintenance obligations unavailable, continuing without them:", error.message);
      return [];
    }
    const rows = (data ?? []).map((row) => ({
      id: row.id,
      assetId: row.asset_id,
      locationId: row.location_id,
      scheduleId: row.schedule_id,
      title: row.title,
      description: row.description,
      source: row.source,
      dueOn: row.due_on,
      status: row.status,
      isOverdue: row.is_overdue,
      completedAt: row.completed_at,
      cancelledAt: row.cancelled_at,
    }));
    return rows.sort((a, b) => {
      if (a.status === "open" && b.status !== "open") return -1;
      if (a.status !== "open" && b.status === "open") return 1;
      if (a.status === "open") return new Date(a.dueOn) - new Date(b.dueOn);
      return 0;
    });
  } catch (err) {
    console.warn("maintenance obligations unavailable, continuing without them:", err.message);
    return [];
  }
}
