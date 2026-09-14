// Platform Activation Slice 1, WP 1.3 — the client side of api.my_maintenance_obligations()
// (migration 0137). Mirrors homeInventory.test.js's mocking shape: same supabase.schema()
// stub, same "never throws" idiom every read switch since WP 0.4 already holds.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiRpc = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: {
    schema: (name) => ({ rpc: (...args) => apiRpc(name, ...args) }),
  },
}));

import {
  fetchMaintenanceObligations, createMaintenanceObligation, completeMaintenanceObligation, cancelMaintenanceObligation,
  fetchMaintenanceSchedules, createMaintenanceSchedule, cancelMaintenanceSchedule, mergeMaintenanceWithSchedules,
} from "../maintenance.js";

const WORKSPACE_ID = "11111111-1111-4111-8111-000000000020";

const OPEN_SOON_ROW = {
  id: "ob-1",
  asset_id: null,
  location_id: "loc-1",
  schedule_id: "sch-1",
  title: "Boiler service",
  description: null,
  source: "schedule",
  due_on: "2026-09-01",
  status: "open",
  is_overdue: false,
  completed_at: null,
  cancelled_at: null,
};

const OPEN_OVERDUE_ROW = {
  ...OPEN_SOON_ROW,
  id: "ob-2",
  title: "Smoke detector check",
  due_on: "2026-01-01",
  is_overdue: true,
};

const COMPLETED_ROW = {
  ...OPEN_SOON_ROW,
  id: "ob-3",
  title: "Gutter clean",
  status: "completed",
  is_overdue: false,
  completed_at: "2026-06-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchMaintenanceObligations", () => {
  it("returns an empty list without calling the api for a null workspace id", async () => {
    const rows = await fetchMaintenanceObligations(null);

    expect(rows).toEqual([]);
    expect(apiRpc).not.toHaveBeenCalled();
  });

  it("calls the api schema's delegate with the workspace id", async () => {
    apiRpc.mockResolvedValue({ data: [], error: null });

    await fetchMaintenanceObligations(WORKSPACE_ID);

    expect(apiRpc).toHaveBeenCalledWith("api", "my_maintenance_obligations", { p_workspace_id: WORKSPACE_ID });
  });

  it("reshapes rows to camelCase, including the server-computed is_overdue flag", async () => {
    apiRpc.mockResolvedValue({ data: [OPEN_SOON_ROW], error: null });

    const rows = await fetchMaintenanceObligations(WORKSPACE_ID);

    expect(rows).toEqual([
      {
        id: "ob-1",
        assetId: null,
        locationId: "loc-1",
        scheduleId: "sch-1",
        title: "Boiler service",
        description: null,
        source: "schedule",
        dueOn: "2026-09-01",
        status: "open",
        isOverdue: false,
        completedAt: null,
        cancelledAt: null,
      },
    ]);
  });

  // Maintenance resolution slice (0203) — present in the table since 0072, never read
  // back until now.
  it("reshapes a cancelled row's cancellation_reason", async () => {
    apiRpc.mockResolvedValue({
      data: [{ ...OPEN_SOON_ROW, status: "cancelled", cancelled_at: "2026-06-01T00:00:00Z", cancellation_reason: "No longer needed" }],
      error: null,
    });

    const rows = await fetchMaintenanceObligations(WORKSPACE_ID);

    expect(rows[0].cancellationReason).toBe("No longer needed");
  });

  it("sorts open obligations before settled ones, and overdue/soonest first within open", async () => {
    apiRpc.mockResolvedValue({ data: [COMPLETED_ROW, OPEN_SOON_ROW, OPEN_OVERDUE_ROW], error: null });

    const rows = await fetchMaintenanceObligations(WORKSPACE_ID);

    expect(rows.map((r) => r.id)).toEqual(["ob-2", "ob-1", "ob-3"]);
  });

  it("returns an empty list, never throwing, on an rpc error", async () => {
    apiRpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const rows = await fetchMaintenanceObligations(WORKSPACE_ID);

    expect(rows).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns an empty list, never throwing, when the client throws synchronously", async () => {
    apiRpc.mockImplementation(() => {
      throw new Error("schema is not a function");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(fetchMaintenanceObligations(WORKSPACE_ID)).resolves.toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// Document Understanding slice — the first real client caller of a contract
// (api.create_maintenance_obligation(), 0142) that has existed since WP 1.7 with none
// named.
describe("createMaintenanceObligation", () => {
  it("calls the api schema's delegate with a single concrete due date, no recurrence", async () => {
    apiRpc.mockResolvedValue({ error: null });

    await createMaintenanceObligation({
      workspaceId: WORKSPACE_ID, assetId: "asset-1", actorRef: "owner-1",
      title: "Descale the machine", description: "Every 3 months per the manual.", dueOn: "2026-12-01",
    });

    expect(apiRpc).toHaveBeenCalledWith("api", "create_maintenance_obligation", expect.objectContaining({
      p_workspace_id: WORKSPACE_ID, p_asset_id: "asset-1", p_location_id: null,
      p_title: "Descale the machine", p_description: "Every 3 months per the manual.", p_due_on: "2026-12-01",
      p_actor_type: "person", p_actor_ref: "owner-1",
    }));
  });

  it("sends null, not an empty string, when no description is given", async () => {
    apiRpc.mockResolvedValue({ error: null });

    await createMaintenanceObligation({ workspaceId: WORKSPACE_ID, assetId: "asset-1", actorRef: "owner-1", title: "Descale", dueOn: "2026-12-01" });

    expect(apiRpc).toHaveBeenCalledWith("api", "create_maintenance_obligation", expect.objectContaining({ p_description: null }));
  });

  it("throws the real error rather than swallowing it -- a write, not a read", async () => {
    apiRpc.mockResolvedValue({ error: { message: "insufficient_privilege" } });

    await expect(createMaintenanceObligation({
      workspaceId: WORKSPACE_ID, assetId: "asset-1", actorRef: "owner-1", title: "Descale", dueOn: "2026-12-01",
    })).rejects.toThrow("insufficient_privilege");
  });
});

// Maintenance resolution slice — the first real client callers of api.complete_
// maintenance_obligation()/api.cancel_maintenance_obligation() (0203).
describe("completeMaintenanceObligation", () => {
  it("calls the api schema's delegate with the obligation id and actor ref", async () => {
    apiRpc.mockResolvedValue({ error: null });

    await completeMaintenanceObligation("ob-1", "owner-1");

    expect(apiRpc).toHaveBeenCalledWith("api", "complete_maintenance_obligation", expect.objectContaining({
      p_obligation_id: "ob-1", p_actor_type: "person", p_actor_ref: "owner-1",
    }));
  });

  it("throws the real error rather than swallowing it -- a write, not a read", async () => {
    apiRpc.mockResolvedValue({ error: { message: "insufficient_privilege" } });

    await expect(completeMaintenanceObligation("ob-1", "owner-1")).rejects.toThrow("insufficient_privilege");
  });
});

describe("cancelMaintenanceObligation", () => {
  it("calls the api schema's delegate with the obligation id, reason and actor ref", async () => {
    apiRpc.mockResolvedValue({ error: null });

    await cancelMaintenanceObligation("ob-1", "No longer needed", "owner-1");

    expect(apiRpc).toHaveBeenCalledWith("api", "cancel_maintenance_obligation", expect.objectContaining({
      p_obligation_id: "ob-1", p_reason: "No longer needed", p_actor_type: "person", p_actor_ref: "owner-1",
    }));
  });

  it("does not validate the reason itself -- that stays the contract's own job", async () => {
    apiRpc.mockResolvedValue({ error: { message: "a cancellation reason is required" } });

    await expect(cancelMaintenanceObligation("ob-1", "", "owner-1")).rejects.toThrow("a cancellation reason is required");
  });

  it("throws the real error rather than swallowing it -- a write, not a read", async () => {
    apiRpc.mockResolvedValue({ error: { message: "insufficient_privilege" } });

    await expect(cancelMaintenanceObligation("ob-1", "No longer needed", "owner-1")).rejects.toThrow("insufficient_privilege");
  });
});

// Recurring Maintenance Activation slice — the first real client callers of
// api.my_maintenance_schedules() (0137)/api.create_maintenance_schedule()/
// api.cancel_maintenance_schedule() (0205).
describe("fetchMaintenanceSchedules", () => {
  const SCHEDULE_ROW = {
    id: "sch-1", asset_id: "asset-1", location_id: null, title: "Descale the machine",
    description: "Every 3 months.", recurrence: "3 mons", next_due_on: "2026-12-01", active: true,
  };

  it("returns an empty list without calling the api for a null workspace id", async () => {
    const rows = await fetchMaintenanceSchedules(null);

    expect(rows).toEqual([]);
    expect(apiRpc).not.toHaveBeenCalled();
  });

  it("reshapes rows to camelCase", async () => {
    apiRpc.mockResolvedValue({ data: [SCHEDULE_ROW], error: null });

    const rows = await fetchMaintenanceSchedules(WORKSPACE_ID);

    expect(rows).toEqual([{
      id: "sch-1", assetId: "asset-1", locationId: null, title: "Descale the machine",
      description: "Every 3 months.", recurrence: "3 mons", nextDueOn: "2026-12-01", active: true,
    }]);
  });

  it("returns an empty list, never throwing, on an rpc error", async () => {
    apiRpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const rows = await fetchMaintenanceSchedules(WORKSPACE_ID);

    expect(rows).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("createMaintenanceSchedule", () => {
  it("calls the api schema's delegate with the recurrence as a plain interval literal", async () => {
    apiRpc.mockResolvedValue({ error: null });

    await createMaintenanceSchedule({
      workspaceId: WORKSPACE_ID, assetId: "asset-1", actorRef: "owner-1",
      title: "Descale the machine", description: "Every 3 months.", recurrence: "3 months", firstDueOn: "2026-12-01",
    });

    expect(apiRpc).toHaveBeenCalledWith("api", "create_maintenance_schedule", expect.objectContaining({
      p_workspace_id: WORKSPACE_ID, p_asset_id: "asset-1", p_location_id: null,
      p_title: "Descale the machine", p_description: "Every 3 months.",
      p_recurrence: "3 months", p_first_due_on: "2026-12-01",
      p_actor_type: "person", p_actor_ref: "owner-1",
    }));
  });

  it("always mints a real seed-obligation id, even though the server decides whether to use it", async () => {
    apiRpc.mockResolvedValue({ error: null });

    await createMaintenanceSchedule({
      workspaceId: WORKSPACE_ID, assetId: "asset-1", actorRef: "owner-1",
      title: "Descale", recurrence: "1 month", firstDueOn: "2099-01-01",
    });

    const call = apiRpc.mock.calls.find(([, name]) => name === "create_maintenance_schedule");
    expect(typeof call[2].p_seed_obligation_id).toBe("string");
    expect(call[2].p_seed_obligation_id.length).toBeGreaterThan(0);
  });

  it("sends null, not an empty string, when no description is given", async () => {
    apiRpc.mockResolvedValue({ error: null });

    await createMaintenanceSchedule({ workspaceId: WORKSPACE_ID, assetId: "asset-1", actorRef: "owner-1", title: "Descale", recurrence: "1 month", firstDueOn: "2026-12-01" });

    expect(apiRpc).toHaveBeenCalledWith("api", "create_maintenance_schedule", expect.objectContaining({ p_description: null }));
  });

  it("throws the real error rather than swallowing it -- a write, not a read", async () => {
    apiRpc.mockResolvedValue({ error: { message: "insufficient_privilege" } });

    await expect(createMaintenanceSchedule({
      workspaceId: WORKSPACE_ID, assetId: "asset-1", actorRef: "owner-1", title: "Descale", recurrence: "1 month", firstDueOn: "2026-12-01",
    })).rejects.toThrow("insufficient_privilege");
  });
});

describe("cancelMaintenanceSchedule", () => {
  it("calls the api schema's delegate with the schedule id and actor ref -- 'stop future reminders,' never an obligation call", async () => {
    apiRpc.mockResolvedValue({ error: null });

    await cancelMaintenanceSchedule("sch-1", "owner-1");

    expect(apiRpc).toHaveBeenCalledWith("api", "cancel_maintenance_schedule", expect.objectContaining({
      p_schedule_id: "sch-1", p_actor_type: "person", p_actor_ref: "owner-1",
    }));
  });

  it("throws the real error rather than swallowing it -- a write, not a read", async () => {
    apiRpc.mockResolvedValue({ error: { message: "schedule does not exist or is already cancelled" } });

    await expect(cancelMaintenanceSchedule("sch-1", "owner-1")).rejects.toThrow("schedule does not exist or is already cancelled");
  });
});

// Found live, 2026-09-14: MyItemsPanel.jsx's own workspace-wide "Onderhoud" summary
// (usePropertyTwin.js, obligations only) never included a schedule whose first
// occurrence hadn't yet become a real obligation -- ItemDetailSheet.jsx already solved
// this correctly for its own per-item view (its own upcomingSchedules); this generalizes
// that same rule for a workspace-wide caller.
describe("mergeMaintenanceWithSchedules", () => {
  const schedule = (over) => ({
    id: "sch-1", assetId: "asset-1", locationId: null, title: "Descale the machine",
    description: null, recurrence: "3 mons", nextDueOn: "2026-12-01", active: true, ...over,
  });

  it("adds a synthetic entry for an active schedule with no open obligation of its own", () => {
    const merged = mergeMaintenanceWithSchedules([], [schedule()]);

    expect(merged).toEqual([{
      id: "sch-1", assetId: "asset-1", locationId: null, scheduleId: "sch-1",
      title: "Descale the machine", description: null, source: "schedule",
      dueOn: "2026-12-01", status: "open", isOverdue: false,
      completedAt: null, cancelledAt: null, cancellationReason: null,
    }]);
  });

  it("never duplicates a schedule that already has its own open obligation", () => {
    const openObligation = { id: "ob-1", status: "open", scheduleId: "sch-1", dueOn: "2026-09-01", title: "Descale the machine" };

    const merged = mergeMaintenanceWithSchedules([openObligation], [schedule()]);

    expect(merged).toEqual([openObligation]);
  });

  it("skips a cancelled (inactive) schedule entirely", () => {
    const merged = mergeMaintenanceWithSchedules([], [schedule({ active: false })]);

    expect(merged).toEqual([]);
  });

  it("does not treat a schedule's own SETTLED obligation as already representing it -- a completed occurrence still needs its next one shown", () => {
    const settledObligation = { id: "ob-1", status: "completed", scheduleId: "sch-1", dueOn: "2026-06-01", title: "Descale the machine" };

    const merged = mergeMaintenanceWithSchedules([settledObligation], [schedule()]);

    // The synthetic entry is "open," so it sorts ahead of the already-settled row --
    // matches the existing open-before-settled ordering, not append order.
    expect(merged.map((m) => m.id)).toEqual(["sch-1", "ob-1"]);
  });

  it("interleaves the synthetic entry into the existing open-first, soonest-first ordering rather than always appending it", () => {
    const overdue = { id: "ob-1", status: "open", scheduleId: null, dueOn: "2026-01-01", title: "Smoke detector check" };
    const settled = { id: "ob-2", status: "completed", scheduleId: null, dueOn: "2026-02-01", title: "Gutter clean" };
    // Due sooner than the schedule's own nextDueOn (2026-12-01), so it must sort ahead.
    const soonOpen = { id: "ob-3", status: "open", scheduleId: null, dueOn: "2026-10-01", title: "Filter check" };

    const merged = mergeMaintenanceWithSchedules([overdue, settled, soonOpen], [schedule()]);

    expect(merged.map((m) => m.id)).toEqual(["ob-1", "ob-3", "sch-1", "ob-2"]);
  });

  it("returns the original list untouched (same reference-safe shape) when there is nothing to add", () => {
    const obligations = [{ id: "ob-1", status: "open", scheduleId: null, dueOn: "2026-09-01" }];

    expect(mergeMaintenanceWithSchedules(obligations, [])).toEqual(obligations);
    expect(mergeMaintenanceWithSchedules(obligations, null)).toEqual(obligations);
  });

  it("treats a null/undefined maintenance list the same as empty, never throwing", () => {
    expect(mergeMaintenanceWithSchedules(null, [schedule()])).toEqual([{
      id: "sch-1", assetId: "asset-1", locationId: null, scheduleId: "sch-1",
      title: "Descale the machine", description: null, source: "schedule",
      dueOn: "2026-12-01", status: "open", isOverdue: false,
      completedAt: null, cancelledAt: null, cancellationReason: null,
    }]);
  });
});
