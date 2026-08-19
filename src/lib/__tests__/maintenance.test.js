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

import { fetchMaintenanceObligations } from "../maintenance.js";

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
