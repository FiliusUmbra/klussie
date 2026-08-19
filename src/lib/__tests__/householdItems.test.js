// Epic 03 WP11 — the read switch for fetchHouseholdItems, following the same fallback and
// the same reasoning as requests.js's fetchCustomerRequests: workspaceId is undefined until
// WP 03.09's resolver places a caller in exactly one workspace, and a single-workspace
// owner must see identical results whichever filter actually runs.
//
// Epic 07 WP08 adds a third, outermost tier: propertyId, read from property.assets via
// api.my_assets() instead of household_items directly.
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() }, schema: vi.fn() },
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

const ASSET_ROW = {
  id: "asset-1", name: "Boiler", type: "appliance", room_label: "kelder",
  make: "Vaillant", model: null, photo_path: null, acquired_on: null, notes: null,
  source: "manual", ai_suggestion: null,
  created_at: "2026-08-06T00:00:00Z", updated_at: "2026-08-06T00:00:00Z",
};

beforeEach(() => {
  vi.mocked(supabase.from).mockReset();
  rpcMock.mockReset();
  vi.mocked(supabase.schema).mockReset();
  vi.mocked(supabase.schema).mockReturnValue({ rpc: rpcMock });
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

  // Epic 07 WP08 — the outermost tier: propertyId present reads property.assets via
  // api.my_assets() and never touches public.household_items at all.
  it("reads property.assets through api.my_assets() when propertyId is given, not household_items", async () => {
    rpcMock.mockResolvedValue({ data: [ASSET_ROW], error: null });

    const result = await fetchHouseholdItems("owner-1", "ws-1", "prop-1");

    expect(supabase.schema).toHaveBeenCalledWith("api");
    expect(rpcMock).toHaveBeenCalledWith("my_assets", { p_property_id: "prop-1" });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({ id: "asset-1", name: "Boiler", category: "appliance", brand: "Vaillant" }),
    ]);
  });

  it("reshapes a property.assets row identically to a household_items row for the same item", async () => {
    rpcMock.mockResolvedValue({ data: [ASSET_ROW], error: null });
    const fromAsset = await fetchHouseholdItems("owner-1", "ws-1", "prop-1");

    vi.mocked(supabase.from).mockReturnValue(createQueryBuilder({ data: [ROW], error: null }));
    const fromItem = await fetchHouseholdItems("owner-1", "ws-1");

    expect(fromAsset).toEqual([{ ...fromItem[0], id: "asset-1" }]);
  });

  it("throws the real Supabase error from api.my_assets() instead of swallowing it", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("denied") });
    await expect(fetchHouseholdItems("owner-1", "ws-1", "prop-1")).rejects.toThrow("denied");
  });

  it("falls back to workspace/owner scoping when propertyId is not yet resolved", async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    vi.mocked(supabase.from).mockReturnValue(builder);

    await fetchHouseholdItems("owner-1", "ws-1", null);

    expect(rpcMock).not.toHaveBeenCalled();
    expect(supabase.from).toHaveBeenCalledWith("household_items");
    expect(builder.eq).toHaveBeenCalledWith("workspace_id", "ws-1");
  });

  it("orders property.assets results newest first, same as the household_items path", async () => {
    const older = { ...ASSET_ROW, id: "asset-old", created_at: "2026-08-01T00:00:00Z" };
    const newer = { ...ASSET_ROW, id: "asset-new", created_at: "2026-08-10T00:00:00Z" };
    rpcMock.mockResolvedValue({ data: [older, newer], error: null });

    const result = await fetchHouseholdItems("owner-1", "ws-1", "prop-1");

    expect(result.map((r) => r.id)).toEqual(["asset-new", "asset-old"]);
  });
});
