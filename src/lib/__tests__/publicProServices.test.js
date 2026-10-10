import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("../supabaseClient", () => ({ supabase: { schema: () => ({ rpc: (...a) => rpc(...a) }), from: vi.fn() } }));

import { fetchPublicProServices } from "../pros.js";

beforeEach(() => { rpc.mockReset(); });

describe("fetchPublicProServices", () => {
  it("returns this professional's service ids", async () => {
    rpc.mockResolvedValue({ data: [{ pro_id: "p1", service_id: "s1" }, { pro_id: "p2", service_id: "s9" }, { pro_id: "p1", service_id: "s2" }], error: null });
    expect(await fetchPublicProServices("p1")).toEqual(["s1", "s2"]);
    expect(rpc).toHaveBeenCalledWith("public_pro_services", { p_pro_ids: ["p1"] });
  });
  it("never throws on an error result (e.g. the migration is not applied yet): empty list", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("function does not exist") });
    expect(await fetchPublicProServices("p1")).toEqual([]);
  });

  it("never throws on a rejected call either: empty list", async () => {
    rpc.mockImplementation(async () => { throw new Error("network"); });
    await expect(fetchPublicProServices("p1")).resolves.toEqual([]);
  });
});
