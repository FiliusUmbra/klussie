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

import {
  fetchHomeProfile, knownFactsFrom, buildLocationTree, createPropertyForCaller,
  fetchMyProperties, setPropertyAddress, hasConfirmedAddress,
} from "../homeInventory";

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

  it("resolves the property, including the address/quote-prep columns migration 0185 added", async () => {
    apiRpc.mockResolvedValue({ data: [PROPERTY_ROW], error: null });

    const profile = await fetchHomeProfile();

    expect(profile.property).toEqual({
      id: PROPERTY_ROW.id,
      name: "My Home",
      street: "",
      houseNumber: "",
      postcode: "",
      municipality: "",
      country: "BE",
      propertyType: null,
      quotePrepNotes: "",
    });
  });

  it("shapes a fully-addressed property row (0182's own columns) into the client's own field names", async () => {
    apiRpc.mockResolvedValue({
      data: [{
        ...PROPERTY_ROW,
        street: "Kerkstraat", house_number: "12", postcode: "2000", municipality: "Antwerpen",
        country: "BE", property_type: "apartment", quote_prep_notes: "Bel aan bij nr. 4",
      }],
      error: null,
    });

    const profile = await fetchHomeProfile();

    expect(profile.property).toEqual({
      id: PROPERTY_ROW.id,
      name: "My Home",
      street: "Kerkstraat",
      houseNumber: "12",
      postcode: "2000",
      municipality: "Antwerpen",
      country: "BE",
      propertyType: "apartment",
      quotePrepNotes: "Bel aan bij nr. 4",
    });
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

// Platform Activation Slice 1, WP 1.10 — Option B's own lazy-creation trigger: a
// Professional workspace's "My Business" tab, opened for the first time with no
// property yet.
describe("createPropertyForCaller", () => {
  it("calls api.create_property with the workspace, name and person actor type", async () => {
    apiRpc.mockResolvedValue({ error: null });

    const result = await createPropertyForCaller({ workspaceId: "ws-1", actorRef: "owner-1", name: "My Business" });

    expect(apiRpc).toHaveBeenCalledWith("api", "create_property", expect.objectContaining({
      p_property_id: result.id,
      p_steward_workspace_id: "ws-1",
      p_name: "My Business",
      p_actor_type: "person",
      p_actor_ref: "owner-1",
    }));
  });

  it("throws the real Supabase error instead of swallowing it", async () => {
    apiRpc.mockResolvedValue({ error: new Error("insufficient_privilege") });

    await expect(createPropertyForCaller({ workspaceId: "ws-1", actorRef: "owner-1", name: "My Business" }))
      .rejects.toThrow("insufficient_privilege");
  });
});

// Migration 0185 — the service-location picker's own data source: the full list of
// properties the caller stewards, not just the first one fetchHomeProfile() picks.
describe("fetchMyProperties", () => {
  it("shapes every row the caller stewards, not only the first", async () => {
    apiRpc.mockResolvedValue({
      data: [
        PROPERTY_ROW,
        { ...PROPERTY_ROW, id: "p2", name: "Vakantiehuis", street: "Zeedijk", house_number: "1", postcode: "8400", municipality: "Oostende" },
      ],
      error: null,
    });

    const properties = await fetchMyProperties();

    expect(apiRpc).toHaveBeenCalledWith("api", "my_properties");
    expect(properties.map((p) => p.id)).toEqual([PROPERTY_ROW.id, "p2"]);
    expect(properties[1]).toMatchObject({ name: "Vakantiehuis", street: "Zeedijk", municipality: "Oostende" });
  });

  it("throws the real Supabase error instead of swallowing it", async () => {
    apiRpc.mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(fetchMyProperties()).rejects.toThrow("boom");
  });
});

describe("setPropertyAddress", () => {
  it("calls api.set_property_address with every field, defaulting country to BE", async () => {
    apiRpc.mockResolvedValue({ error: null });

    await setPropertyAddress({
      propertyId: "p1", street: "Kerkstraat", houseNumber: "12", postcode: "2000", municipality: "Antwerpen",
      propertyType: "apartment", quotePrepNotes: "Bel aan bij nr. 4",
    });

    expect(apiRpc).toHaveBeenCalledWith("api", "set_property_address", {
      p_property_id: "p1",
      p_street: "Kerkstraat",
      p_house_number: "12",
      p_postcode: "2000",
      p_municipality: "Antwerpen",
      p_country: "BE",
      p_property_type: "apartment",
      p_quote_prep_notes: "Bel aan bij nr. 4",
    });
  });

  it("throws the real Supabase error instead of swallowing it", async () => {
    apiRpc.mockResolvedValue({ error: new Error("insufficient_privilege") });
    await expect(setPropertyAddress({ propertyId: "p1", street: "x", postcode: "y", municipality: "z" }))
      .rejects.toThrow("insufficient_privilege");
  });
});

describe("hasConfirmedAddress", () => {
  it("requires street, postcode and municipality — house number and country alone are not enough", () => {
    expect(hasConfirmedAddress({ street: "Kerkstraat", postcode: "2000", municipality: "Antwerpen" })).toBe(true);
    expect(hasConfirmedAddress({ street: "Kerkstraat", postcode: "2000" })).toBe(false);
    expect(hasConfirmedAddress(null)).toBe(false);
    expect(hasConfirmedAddress({})).toBe(false);
  });
});
