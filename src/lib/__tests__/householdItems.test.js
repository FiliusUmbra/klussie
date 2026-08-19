// Epic 03 WP11 — the read switch for fetchHouseholdItems, following the same fallback and
// the same reasoning as requests.js's fetchCustomerRequests: workspaceId is undefined until
// WP 03.09's resolver places a caller in exactly one workspace, and a single-workspace
// owner must see identical results whichever filter actually runs.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabaseClient", () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));

import { supabase } from "../supabaseClient";
import { fetchHouseholdItems } from "../householdItems";

function createQueryBuilder(result) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return builder;
}

const ROW = {
  id: "item-1", owner_id: "owner-1", name: "Boiler", category: "appliance", room: "kelder",
  brand: "Vaillant", model: null, photo_path: null, purchased_on: null, notes: null,
  source: "manual", ai_suggestion: null,
  created_at: "2026-08-06T00:00:00Z", updated_at: "2026-08-06T00:00:00Z",
};

beforeEach(() => {
  vi.mocked(supabase.from).mockReset();
});

describe("fetchHouseholdItems", () => {
  it("filters by owner_id when no workspace has been resolved", async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);

    await fetchHouseholdItems("owner-1");

    expect(supabase.from).toHaveBeenCalledWith("household_items");
    expect(builder.eq).toHaveBeenCalledWith("owner_id", "owner-1");
    expect(builder.eq).not.toHaveBeenCalledWith("workspace_id", expect.anything());
  });

  it("filters by workspace_id once a workspace is resolved, not owner_id", async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);

    await fetchHouseholdItems("owner-1", "ws-1");

    expect(builder.eq).toHaveBeenCalledWith("workspace_id", "ws-1");
    expect(builder.eq).not.toHaveBeenCalledWith("owner_id", expect.anything());
  });

  it("reshapes the same row identically whichever filter ran", async () => {
    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ data: [ROW], error: null }));
    const withoutWorkspace = await fetchHouseholdItems("owner-1");

    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ data: [ROW], error: null }));
    const withWorkspace = await fetchHouseholdItems("owner-1", "ws-1");

    expect(withoutWorkspace).toEqual(withWorkspace);
    expect(withoutWorkspace).toEqual([
      expect.objectContaining({ id: "item-1", name: "Boiler", category: "appliance", brand: "Vaillant" }),
    ]);
  });

  it("throws the real Supabase error instead of swallowing it", async () => {
    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ data: null, error: new Error("denied") }));
    await expect(fetchHouseholdItems("owner-1")).rejects.toThrow("denied");
  });

  it("orders newest first regardless of which filter ran", async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);

    await fetchHouseholdItems("owner-1", "ws-1");

    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });
});
