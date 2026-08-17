// Epic 05 WP06 — the first real caller of the property engine's client-facing contract
// (api.my_properties(), migration 0041). Mirrors workspaceContext.test.js's shape: same
// fallback idiom, same reason for it (a database missing Epic 05's migrations, or an
// environment where `api` hasn't been re-exposed after gaining new functions).
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiRpc = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: {
    schema: (name) => ({ rpc: (...args) => apiRpc(name, ...args) }),
  },
}));

import { fetchHomeProfile, knownFactsFrom } from "../homeInventory";

const PROPERTY_ROW = {
  id: "11111111-1111-4111-8111-000000000030",
  name: "My Home",
  jurisdiction: null,
  steward_workspace_id: "11111111-1111-4111-8111-000000000020",
  steward_since: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchHomeProfile", () => {
  it("calls the api schema's parameterless discovery function", async () => {
    apiRpc.mockResolvedValue({ data: [PROPERTY_ROW], error: null });

    await fetchHomeProfile();

    expect(apiRpc).toHaveBeenCalledWith("api", "my_properties");
  });

  it("resolves the property, taking only the id and name", async () => {
    apiRpc.mockResolvedValue({ data: [PROPERTY_ROW], error: null });

    const profile = await fetchHomeProfile();

    expect(profile.property).toEqual({ id: PROPERTY_ROW.id, name: "My Home" });
  });

  it("falls back to a null property when the resolver is unavailable", async () => {
    // A database without Epic 05's migrations — production, today.
    apiRpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const profile = await fetchHomeProfile();

    expect(profile.property).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("falls back to a null property when nothing has been backfilled yet", async () => {
    apiRpc.mockResolvedValue({ data: [], error: null });

    const profile = await fetchHomeProfile();

    expect(profile.property).toBeNull();
  });

  it("tolerates a client with no schema() method without throwing", async () => {
    // Belt-and-braces, same as workspaceContext.js's loadWorkspaceMemberships().
    apiRpc.mockImplementation(() => {
      throw new Error("schema is not a function");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(fetchHomeProfile()).resolves.toMatchObject({ property: null });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("still returns every field the pre-Epic-05 stub had, all empty, alongside property", async () => {
    apiRpc.mockResolvedValue({ data: [], error: null });

    const profile = await fetchHomeProfile();

    expect(profile).toEqual({
      summary: null,
      rooms: [],
      installations: [],
      upcomingMaintenance: [],
      documents: [],
      property: null,
    });
  });
});

describe("knownFactsFrom", () => {
  it("does not treat a resolved property as a known fact — nothing downstream reads it yet", () => {
    // Deliberate: WP 05.06's own acceptance criterion is that nothing renders differently.
    // knownFactsFrom decides whether a follow-up question is skipped, and property has no
    // question to skip.
    const facts = knownFactsFrom({ rooms: [], installations: [], upcomingMaintenance: [], property: { id: "p1", name: "My Home" } });
    expect(facts.size).toBe(0);
  });
});
