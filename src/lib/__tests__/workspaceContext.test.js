// Epic 03 WP09 — the first real caller of the Workspace engine's client-facing contract.
//
// Mirrors identityReadPath.test.js's shape deliberately: same fallback idiom
// (`mergeIdentityIntoProfile`), same reason for it (a database missing the migrations that
// created the resolver — production, today, for Epic 03's migrations specifically), so the
// same test shape proves it.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiRpc = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: {
    schema: (name) => ({ rpc: (...args) => apiRpc(name, ...args) }),
  },
}));

import { loadWorkspaceMemberships, resolveActiveWorkspace } from "../workspaceContext";

const MEMBERSHIP = {
  membership_id: "11111111-1111-4111-8111-000000000010",
  workspace_id: "11111111-1111-4111-8111-000000000020",
  role: "owner",
  scope: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadWorkspaceMemberships", () => {
  it("calls the api schema's parameterless delegate, not workspace directly", async () => {
    // The parameterless shape is load-bearing (ADR-0026 "As implemented") — a version
    // taking an argument cannot achieve once-per-statement evaluation. Pinning the call
    // shape here catches a regression a type system would not.
    apiRpc.mockResolvedValue({ data: [MEMBERSHIP], error: null });

    await loadWorkspaceMemberships();

    expect(apiRpc).toHaveBeenCalledWith("api", "current_workspace_memberships");
  });

  it("returns the caller's memberships", async () => {
    apiRpc.mockResolvedValue({ data: [MEMBERSHIP], error: null });

    const memberships = await loadWorkspaceMemberships();

    expect(memberships).toEqual([MEMBERSHIP]);
  });

  it("falls back to an empty list when the resolver is unavailable", async () => {
    // A database without Epic 03's migrations, or an environment where `api` has not yet
    // been added to Data API's exposed schemas (ADR-0026) — both true of production today.
    apiRpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const memberships = await loadWorkspaceMemberships();

    expect(memberships).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns an empty list for a person backfilled with no membership yet", async () => {
    apiRpc.mockResolvedValue({ data: [], error: null });

    const memberships = await loadWorkspaceMemberships();

    expect(memberships).toEqual([]);
  });
});

describe("resolveActiveWorkspace", () => {
  it("picks the sole membership for a single-workspace person", () => {
    expect(resolveActiveWorkspace([MEMBERSHIP])).toEqual(MEMBERSHIP);
  });

  it("picks nothing for a person with no membership", () => {
    // Reachable today only via the fallback above, or a person not yet backfilled.
    expect(resolveActiveWorkspace([])).toBeNull();
  });

  it("picks nothing for a person with more than one workspace", () => {
    // The dual-role case WP 03.04 backfills for (customer + pro): deciding which is active
    // is WP 03.12's switcher, not this function — picking one here would be exactly the
    // client-side permission decision ADR-0024 rules out.
    const second = { ...MEMBERSHIP, membership_id: "second", workspace_id: "second-ws", role: "member" };
    expect(resolveActiveWorkspace([MEMBERSHIP, second])).toBeNull();
  });
});
