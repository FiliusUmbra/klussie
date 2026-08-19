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

import { fetchHomeProfile, knownFactsFrom, buildLocationTree } from "../homeInventory";

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

// Platform Activation Slice 1, WP 1.3 — locations_for_property (migration 0136) and
// my_documents (Epic 08) both only get called once a property has resolved (this file's
// own header, and fetchHomeProfile's own short-circuit above already pin that for the
// no-property case).
describe("fetchHomeProfile — locations and documents (WP 1.3)", () => {
  const LOCATION_ROWS = [
    { id: "loc-1", parent_id: null, name: "Ground floor", type: "floor" },
    { id: "loc-2", parent_id: "loc-1", name: "Kitchen", type: "kitchen" },
  ];
  const DOCUMENT_ROWS = [
    {
      id: "doc-1",
      type_key: "warranty",
      issuer: "Bosch",
      valid_from: "2024-01-01",
      valid_until: "2026-01-01",
      caption: "Boiler warranty",
    },
  ];

  function mockPropertyThenEngines({ locations = LOCATION_ROWS, documents = DOCUMENT_ROWS } = {}) {
    apiRpc.mockImplementation((_schema, fn) => {
      if (fn === "my_properties") return Promise.resolve({ data: [PROPERTY_ROW], error: null });
      if (fn === "locations_for_property") {
        return locations === null
          ? Promise.resolve({ data: null, error: { message: "function does not exist" } })
          : Promise.resolve({ data: locations, error: null });
      }
      if (fn === "my_documents") {
        return documents === null
          ? Promise.resolve({ data: null, error: { message: "function does not exist" } })
          : Promise.resolve({ data: documents, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unexpected call: ${fn}` } });
    });
  }

  it("fetches locations and documents once a property resolves, both keyed to that property's id", async () => {
    mockPropertyThenEngines();

    await fetchHomeProfile();

    expect(apiRpc).toHaveBeenCalledWith("api", "locations_for_property", { p_property_id: PROPERTY_ROW.id });
    expect(apiRpc).toHaveBeenCalledWith("api", "my_documents", { p_property_id: PROPERTY_ROW.id });
  });

  it("assembles the flat location rows into a tree under rooms", async () => {
    mockPropertyThenEngines();

    const profile = await fetchHomeProfile();

    expect(profile.rooms).toEqual([
      {
        id: "loc-1",
        name: "Ground floor",
        type: "floor",
        children: [{ id: "loc-2", name: "Kitchen", type: "kitchen", children: [] }],
      },
    ]);
  });

  it("reshapes documents to camelCase", async () => {
    mockPropertyThenEngines();

    const profile = await fetchHomeProfile();

    expect(profile.documents).toEqual([
      {
        id: "doc-1",
        typeKey: "warranty",
        issuer: "Bosch",
        validFrom: "2024-01-01",
        validUntil: "2026-01-01",
        caption: "Boiler warranty",
      },
    ]);
  });

  it("falls back to an empty list for whichever engine is unavailable, without breaking the other", async () => {
    mockPropertyThenEngines({ locations: null });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const profile = await fetchHomeProfile();

    expect(profile.rooms).toEqual([]);
    expect(profile.documents).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not call either engine when no property resolves", async () => {
    apiRpc.mockResolvedValue({ data: [], error: null });

    await fetchHomeProfile();

    expect(apiRpc).toHaveBeenCalledTimes(1);
    expect(apiRpc).toHaveBeenCalledWith("api", "my_properties");
  });
});

describe("buildLocationTree", () => {
  it("returns an empty tree for an empty list", () => {
    expect(buildLocationTree([])).toEqual([]);
  });

  it("nests children under their parent, preserving multiple roots and multiple children", () => {
    const flat = [
      { id: "a", parentId: null, name: "A", type: null },
      { id: "b", parentId: "a", name: "B", type: null },
      { id: "c", parentId: "a", name: "C", type: null },
      { id: "d", parentId: null, name: "D", type: null },
    ];

    expect(buildLocationTree(flat)).toEqual([
      {
        id: "a",
        name: "A",
        type: null,
        children: [
          { id: "b", name: "B", type: null, children: [] },
          { id: "c", name: "C", type: null, children: [] },
        ],
      },
      { id: "d", name: "D", type: null, children: [] },
    ]);
  });

  it("treats a location whose declared parent is not in the list as a root, rather than dropping it", () => {
    const flat = [{ id: "orphan", parentId: "missing-parent", name: "Orphan", type: null }];

    expect(buildLocationTree(flat)).toEqual([{ id: "orphan", name: "Orphan", type: null, children: [] }]);
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
