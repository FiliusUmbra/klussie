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
import { uuidv7 } from "./ids.js";

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
      // Maintenance resolution slice (0203) — present in the table since 0072, never
      // read back until now (§16: "Cancelled ones retain their cancellation and its
      // reason" only means something if the reason can actually be shown again).
      cancellationReason: row.cancellation_reason,
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

/**
 * Creates one manual maintenance obligation for an asset (`api.create_maintenance_
 * obligation()`, migration 0142) — the first real client caller of a contract that has
 * existed since WP 1.7 with none named. `dueOn` is a single concrete date: nothing in
 * this schema can hold a recurring interval ("every 6 months"), so the Document
 * Understanding slice's own suggestion flow always resolves a stated interval to one
 * upcoming date before this is ever called, rather than this function inventing
 * recurrence. Throws the real error for the caller to show, matching every other write
 * in this codebase (moveAsset, retireAsset) — never swallowed.
 */
export async function createMaintenanceObligation({ workspaceId, assetId, actorRef, title, description, dueOn }) {
  const { error } = await supabase.schema("api").rpc("create_maintenance_obligation", {
    p_obligation_id: uuidv7(),
    p_workspace_id: workspaceId,
    p_asset_id: assetId,
    p_location_id: null,
    p_title: title,
    p_description: description || null,
    p_due_on: dueOn,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}

/**
 * Marks an open maintenance obligation done (`api.complete_maintenance_obligation()`,
 * migration 0203) — the first real client caller. That contract's own work-layer
 * function (0074) does no authorization check at all by itself; 0203's own
 * *_for_caller() wrapper is what makes calling this safe (see that migration's header).
 * Throws the real error (already settled, not the caller's obligation) for the caller to
 * show, matching every other write in this codebase — never swallowed.
 */
export async function completeMaintenanceObligation(obligationId, actorRef) {
  const { error } = await supabase.schema("api").rpc("complete_maintenance_obligation", {
    p_obligation_id: obligationId,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}

/**
 * Cancels an open maintenance obligation with a required reason
 * (`api.cancel_maintenance_obligation()`, migration 0203) — the first real client
 * caller. `reason` is required at the contract level (work.cancel_maintenance_
 * obligation()'s own check, 0074) before it ever reaches the table's own
 * not-null-when-cancelled constraint (0072); this function does not duplicate that
 * validation, matching completeMaintenanceObligation()'s own restraint.
 */
export async function cancelMaintenanceObligation(obligationId, reason, actorRef) {
  const { error } = await supabase.schema("api").rpc("cancel_maintenance_obligation", {
    p_obligation_id: obligationId,
    p_reason: reason,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}

/**
 * Every recurring schedule for a workspace, active or cancelled
 * (`api.my_maintenance_schedules()`, migration 0137) — the first real client caller of a
 * contract that has existed since WP 1.2 with none named. Mirrors
 * fetchMaintenanceObligations()'s own "never throws" idiom: a caller with no real
 * membership sees an empty list, and so does any other failure.
 */
export async function fetchMaintenanceSchedules(workspaceId) {
  if (!workspaceId) return [];
  try {
    const { data, error } = await supabase.schema("api").rpc("my_maintenance_schedules", { p_workspace_id: workspaceId });
    if (error) {
      console.warn("maintenance schedules unavailable, continuing without them:", error.message);
      return [];
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      assetId: row.asset_id,
      locationId: row.location_id,
      title: row.title,
      description: row.description,
      recurrence: row.recurrence,
      nextDueOn: row.next_due_on,
      active: row.active,
    }));
  } catch (err) {
    console.warn("maintenance schedules unavailable, continuing without them:", err.message);
    return [];
  }
}

/**
 * Creates a recurring maintenance schedule for an asset (`api.create_maintenance_
 * schedule()`, Recurring Maintenance Activation slice) — the first real client caller.
 * `recurrence` is a plain interval literal Postgres already understands ("1 month",
 * "3 months", "6 months", "1 year") — the UI's own cadence chips map directly to these,
 * never a count-and-unit pair this function would have to interpret itself.
 *
 * Always mints a seed-obligation id, even though it goes unused whenever `firstDueOn`
 * is still in the future: the server decides whether to actually use it (only when the
 * first occurrence is already due), but the id itself must come from the application
 * for the same reason every other real write in this codebase does (see
 * api/suggest-item-details.js's own header for the general rule; the nightly generation
 * job that produces every LATER occurrence is a different, system-initiated case,
 * documented in migration 0205's own header, and is not this function's concern).
 */
export async function createMaintenanceSchedule({ workspaceId, assetId, actorRef, title, description, recurrence, firstDueOn }) {
  const { error } = await supabase.schema("api").rpc("create_maintenance_schedule", {
    p_schedule_id: uuidv7(),
    p_workspace_id: workspaceId,
    p_asset_id: assetId,
    p_location_id: null,
    p_title: title,
    p_description: description || null,
    p_recurrence: recurrence,
    p_first_due_on: firstDueOn,
    p_seed_obligation_id: uuidv7(),
    p_schedule_event_id: uuidv7(),
    p_seed_obligation_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}

/**
 * Stops a recurring schedule from generating any further obligation
 * (`api.cancel_maintenance_schedule()`, Recurring Maintenance Activation slice) —
 * "stop future reminders," a real, separate action from cancelling one occurrence
 * (cancelMaintenanceObligation() above). Never touches any obligation the schedule has
 * already generated, and is a one-way transition — cancelling an already-cancelled
 * schedule is a real error, not a silent no-op (work.cancel_maintenance_schedule()'s own
 * comment, 0074).
 */
export async function cancelMaintenanceSchedule(scheduleId, actorRef) {
  const { error } = await supabase.schema("api").rpc("cancel_maintenance_schedule", {
    p_schedule_id: scheduleId,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}
