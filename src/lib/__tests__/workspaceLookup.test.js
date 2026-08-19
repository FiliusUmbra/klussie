// Platform Activation Slice 1, WP 1.1a — same mocking shape as auditRecords.test.js
// deliberately: this module's fallback idiom is the same one every other read switch in
// this codebase already uses.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiRpc = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: {
    schema: (name) => ({ rpc: (...args) => apiRpc(name, ...args) }),
  },
}));

import { searchWorkspaces, WORKSPACE_LOOKUP_PAGE_SIZE } from "../workspaceLookup";

const ROW = {
  workspace_id: "11111111-1111-4111-8111-000000000060",
  workspace_name: "Cathy Customer",
  workspace_type: "personal",
  created_at: "2026-01-01T00:00:00Z",
  archived_at: null,
  owner_name: "Cathy Customer",
  owner_email: "cathy@example.com",
  property_count: 1,
  membership_count: 1,
  capability_keys: ["premium_home"],
  last_activity_at: "2026-08-18T09:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchWorkspaces", () => {
  it("calls api.search_workspaces with the page size, an empty query normalised to null", async () => {
    apiRpc.mockResolvedValue({ data: [], error: null });

    await searchWorkspaces({ query: "" });

    expect(apiRpc).toHaveBeenCalledWith("api", "search_workspaces", {
      p_query: null,
      p_limit: WORKSPACE_LOOKUP_PAGE_SIZE,
      p_offset: 0,
    });
  });

  it("passes a real query straight through", async () => {
    apiRpc.mockResolvedValue({ data: [], error: null });

    await searchWorkspaces({ query: "Cathy" });

    expect(apiRpc).toHaveBeenCalledWith("api", "search_workspaces", expect.objectContaining({ p_query: "Cathy" }));
  });

  it("passes the given offset through for pagination", async () => {
    apiRpc.mockResolvedValue({ data: [], error: null });

    await searchWorkspaces({ offset: 20 });

    expect(apiRpc).toHaveBeenCalledWith("api", "search_workspaces", expect.objectContaining({ p_offset: 20 }));
  });

  it("reshapes rows into camelCase, one per real column", async () => {
    apiRpc.mockResolvedValue({ data: [ROW], error: null });

    const [profile] = await searchWorkspaces({});

    expect(profile).toEqual({
      id: ROW.workspace_id,
      name: ROW.workspace_name,
      type: ROW.workspace_type,
      createdAt: ROW.created_at,
      archivedAt: ROW.archived_at,
      ownerName: ROW.owner_name,
      ownerEmail: ROW.owner_email,
      propertyCount: ROW.property_count,
      membershipCount: ROW.membership_count,
      capabilityKeys: ROW.capability_keys,
      lastActivityAt: ROW.last_activity_at,
    });
  });

  it("defaults capabilityKeys to an empty array rather than null", async () => {
    apiRpc.mockResolvedValue({ data: [{ ...ROW, capability_keys: null }], error: null });

    const [profile] = await searchWorkspaces({});

    expect(profile.capabilityKeys).toEqual([]);
  });

  it("returns an empty page rather than throwing when the resolver is unavailable — the same EXISTS-gated behaviour a non-operator sees", async () => {
    apiRpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const results = await searchWorkspaces({});

    expect(results).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns an empty page rather than throwing when the client itself throws", async () => {
    apiRpc.mockRejectedValue(new Error("network unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const results = await searchWorkspaces({});

    expect(results).toEqual([]);
    warn.mockRestore();
  });
});
