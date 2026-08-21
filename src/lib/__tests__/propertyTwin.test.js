// Platform Activation Slice 2, WP 2.4's real acceptance bar — the client-side read of the
// scoped property twin (0161/0162, merged). No permission logic here: the four api.* calls
// either return rows or they don't, exactly as they do for the property's own owner.
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: { schema: vi.fn() },
}));

import { supabase } from "../supabaseClient";
import { fetchPropertyTwin } from "../propertyTwin.js";

beforeEach(() => {
  rpcMock.mockReset();
  vi.mocked(supabase.schema).mockReset();
  vi.mocked(supabase.schema).mockReturnValue({ rpc: rpcMock });
});

describe("fetchPropertyTwin", () => {
  it("returns nulls/empties without calling anything when there is no property id at all", async () => {
    const result = await fetchPropertyTwin(null);

    expect(result).toEqual({ property: null, locations: [], assets: [], documents: [] });
    expect(supabase.schema).not.toHaveBeenCalled();
  });

  it("calls all four api.* reads with the same property id, and shapes the result", async () => {
    rpcMock.mockImplementation((fn) => {
      if (fn === "resolve_property") return Promise.resolve({ data: [{ id: "prop-1", name: "Kerkstraat 12" }], error: null });
      if (fn === "locations_for_property") return Promise.resolve({ data: [{ id: "loc-1", name: "Kitchen" }], error: null });
      if (fn === "my_assets") return Promise.resolve({ data: [{ id: "asset-1", name: "Boiler" }], error: null });
      if (fn === "my_documents") return Promise.resolve({ data: [{ id: "doc-1", type_key: "warranty" }], error: null });
      throw new Error(`unexpected rpc ${fn}`);
    });

    const result = await fetchPropertyTwin("prop-1");

    expect(rpcMock).toHaveBeenCalledWith("resolve_property", { p_property_id: "prop-1" });
    expect(rpcMock).toHaveBeenCalledWith("locations_for_property", { p_property_id: "prop-1" });
    expect(rpcMock).toHaveBeenCalledWith("my_assets", { p_property_id: "prop-1" });
    expect(rpcMock).toHaveBeenCalledWith("my_documents", { p_property_id: "prop-1" });
    expect(result).toEqual({
      property: { id: "prop-1", name: "Kerkstraat 12" },
      locations: [{ id: "loc-1", name: "Kitchen" }],
      assets: [{ id: "asset-1", name: "Boiler" }],
      documents: [{ id: "doc-1", type_key: "warranty" }],
    });
  });

  it("resolves property to null and every list to empty — the deliberate no-scope-yet case, not an error", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    const result = await fetchPropertyTwin("prop-no-scope");

    expect(result).toEqual({ property: null, locations: [], assets: [], documents: [] });
  });

  it("still throws when any one of the four reads genuinely errors", async () => {
    rpcMock.mockImplementation((fn) =>
      fn === "resolve_property"
        ? Promise.resolve({ data: null, error: new Error("denied") })
        : Promise.resolve({ data: [], error: null })
    );

    await expect(fetchPropertyTwin("prop-1")).rejects.toThrow("denied");
  });
});
