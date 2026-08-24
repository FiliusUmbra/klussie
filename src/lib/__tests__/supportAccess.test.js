// Support access, WP S.1 — same mocking shape as workspaceLookup.test.js/
// trustSafety.test.js deliberately: this module's read fallback idiom is the same one
// every other read switch in this codebase already uses.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiRpc = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: {
    schema: (name) => ({ rpc: (...args) => apiRpc(name, ...args) }),
  },
}));

import { fetchSupportAccessGrants, grantSupportAccess, endSupportAccess } from "../supportAccess.js";

const GRANT_ROW = {
  membership_id: "mem-1",
  operator_name: "Otto Operator",
  purpose: "Investigating a billing dispute",
  granted_at: "2026-08-24T00:00:00Z",
  expires_at: "2026-08-24T08:00:00Z",
  status: "active",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchSupportAccessGrants", () => {
  it("calls api.support_access_grants with the workspace id", async () => {
    apiRpc.mockResolvedValue({ data: [], error: null });

    await fetchSupportAccessGrants("ws-1");

    expect(apiRpc).toHaveBeenCalledWith("api", "support_access_grants", { p_workspace_id: "ws-1" });
  });

  it("reshapes rows into camelCase, one per real column", async () => {
    apiRpc.mockResolvedValue({ data: [GRANT_ROW], error: null });

    const [g] = await fetchSupportAccessGrants("ws-1");

    expect(g).toEqual({
      membershipId: GRANT_ROW.membership_id,
      operatorName: GRANT_ROW.operator_name,
      purpose: GRANT_ROW.purpose,
      grantedAt: GRANT_ROW.granted_at,
      expiresAt: GRANT_ROW.expires_at,
      status: GRANT_ROW.status,
    });
  });

  it("returns an empty page rather than throwing when the resolver is unavailable — the same EXISTS-gated behaviour a non-operator sees", async () => {
    apiRpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const results = await fetchSupportAccessGrants("ws-1");

    expect(results).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns an empty page rather than throwing when the client itself throws", async () => {
    apiRpc.mockRejectedValue(new Error("network unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const results = await fetchSupportAccessGrants("ws-1");

    expect(results).toEqual([]);
    warn.mockRestore();
  });
});

describe("grantSupportAccess", () => {
  it("calls api.grant_support_access with fresh ids, actor_type 'person', and the given fields", async () => {
    apiRpc.mockResolvedValue({ data: null, error: null });

    await grantSupportAccess({ workspaceId: "ws-1", purpose: "Billing dispute", durationHours: 8, actorRef: "operator-auth-1" });

    expect(apiRpc).toHaveBeenCalledWith(
      "api",
      "grant_support_access",
      expect.objectContaining({
        p_workspace_id: "ws-1",
        p_purpose: "Billing dispute",
        p_duration_hours: 8,
        p_actor_type: "person",
        p_actor_ref: "operator-auth-1",
      })
    );
    const args = apiRpc.mock.calls[0][2];
    for (const idField of ["p_membership_id", "p_audit_id", "p_event_id", "p_correlation_id"]) {
      expect(typeof args[idField]).toBe("string");
    }
  });

  it("throws on a real error rather than swallowing it — a failed grant must be visible", async () => {
    apiRpc.mockResolvedValue({ data: null, error: { message: "a real stated purpose is required" } });

    await expect(
      grantSupportAccess({ workspaceId: "ws-1", purpose: "", durationHours: 8, actorRef: "operator-auth-1" })
    ).rejects.toThrow("purpose is required");
  });
});

describe("endSupportAccess", () => {
  it("calls api.end_support_access with the membership id and fresh ids", async () => {
    apiRpc.mockResolvedValue({ data: null, error: null });

    await endSupportAccess({ membershipId: "mem-1", actorRef: "operator-auth-1" });

    expect(apiRpc).toHaveBeenCalledWith(
      "api",
      "end_support_access",
      expect.objectContaining({ p_membership_id: "mem-1", p_actor_type: "person", p_actor_ref: "operator-auth-1" })
    );
  });

  it("throws on a real error rather than swallowing it", async () => {
    apiRpc.mockResolvedValue({ data: null, error: { message: "not an active support-access grant" } });

    await expect(endSupportAccess({ membershipId: "mem-1", actorRef: "operator-auth-1" })).rejects.toThrow("not an active");
  });
});
