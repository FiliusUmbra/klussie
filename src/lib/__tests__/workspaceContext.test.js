// Epic 03 WP09/WP12 — the first real caller of the Workspace engine's client-facing
// contract, and the switcher's resolution logic.
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

import { loadWorkspaceMemberships, resolveActiveWorkspace, deriveEffectiveRole } from "../workspaceContext";

const PERSONAL = {
  membership_id: "11111111-1111-4111-8111-000000000010",
  workspace_id: "11111111-1111-4111-8111-000000000020",
  role: "owner",
  scope: null,
  workspace_type: "personal",
  workspace_name: "My Home",
};

const PROFESSIONAL = {
  membership_id: "11111111-1111-4111-8111-000000000011",
  workspace_id: "11111111-1111-4111-8111-000000000021",
  role: "owner",
  scope: null,
  workspace_type: "professional",
  workspace_name: "Peter Painter",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadWorkspaceMemberships", () => {
  it("calls the api schema's parameterless delegate, not workspace directly", async () => {
    // The parameterless shape is load-bearing (ADR-0026 "As implemented") — a version
    // taking an argument cannot achieve once-per-statement evaluation. Pinning the call
    // shape here catches a regression a type system would not.
    apiRpc.mockResolvedValue({ data: [PERSONAL], error: null });

    await loadWorkspaceMemberships();

    // Epic 03 WP12 — extended from api.current_workspace_memberships() to
    // api.list_my_workspaces() (migration 0038), which carries type and name for the
    // switcher; still parameterless, still the same fallback shape.
    expect(apiRpc).toHaveBeenCalledWith("api", "list_my_workspaces");
  });

  it("returns the caller's memberships", async () => {
    apiRpc.mockResolvedValue({ data: [PERSONAL], error: null });

    const memberships = await loadWorkspaceMemberships();

    expect(memberships).toEqual([PERSONAL]);
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
  it("picks the sole membership for a single-workspace person, ignoring any preference", () => {
    expect(resolveActiveWorkspace([PERSONAL])).toEqual(PERSONAL);
    expect(resolveActiveWorkspace([PERSONAL], "some-other-id")).toEqual(PERSONAL);
  });

  it("picks nothing for a person with no membership", () => {
    // Reachable today only via the fallback above, or a person not yet backfilled.
    expect(resolveActiveWorkspace([])).toBeNull();
  });

  // Epic 03 WP12 completes what WP09 deliberately left as null: picking among several is
  // no longer undecided, because there is now something real to decide with — a stored
  // preference (the switcher) — and a default that matches AppShell's own pre-Epic-03
  // behaviour (customer view first) when there isn't one.
  describe("with more than one workspace (WP 03.12)", () => {
    it("picks the workspace matching a valid stored preference", () => {
      expect(resolveActiveWorkspace([PERSONAL, PROFESSIONAL], PROFESSIONAL.workspace_id)).toEqual(PROFESSIONAL);
    });

    it("falls back to the personal workspace when there is no stored preference", () => {
      expect(resolveActiveWorkspace([PERSONAL, PROFESSIONAL])).toEqual(PERSONAL);
    });

    it("falls back to the personal workspace when the stored preference no longer matches a live membership", () => {
      // A revoked membership or an archived workspace — the preference is stale, not
      // trusted blindly.
      expect(resolveActiveWorkspace([PERSONAL, PROFESSIONAL], "no-longer-a-member-here")).toEqual(PERSONAL);
    });

    it("falls back to the first membership when none is personal", () => {
      const businessA = { ...PROFESSIONAL, workspace_id: "biz-a", workspace_type: "business" };
      const businessB = { ...PROFESSIONAL, workspace_id: "biz-b", workspace_type: "business" };
      expect(resolveActiveWorkspace([businessA, businessB])).toEqual(businessA);
    });
  });
});

describe("deriveEffectiveRole", () => {
  it("leaves the toggle-controlled role unconsulted for anyone with fewer than two workspaces", () => {
    // multiWorkspace false is AppShell's own signal that this population is entirely
    // untouched — the exact case this function must not regress, since it's every account
    // today (production has none of Epic 03's migrations).
    expect(deriveEffectiveRole({ multiWorkspace: false, activeWorkspace: PROFESSIONAL, role: "customer" })).toBe("customer");
    expect(deriveEffectiveRole({ multiWorkspace: false, activeWorkspace: null, role: "pro" })).toBe("pro");
  });

  it("falls back to the toggle role when multiWorkspace is true but nothing resolved yet", () => {
    // A render before loadWorkspaceMemberships' promise settles, or a resolver that
    // returned rows resolveActiveWorkspace still couldn't place — never render blank.
    expect(deriveEffectiveRole({ multiWorkspace: true, activeWorkspace: null, role: "customer" })).toBe("customer");
  });

  it("derives pro from a professional active workspace", () => {
    expect(deriveEffectiveRole({ multiWorkspace: true, activeWorkspace: PROFESSIONAL, role: "customer" })).toBe("pro");
  });

  it("derives customer from a personal active workspace, regardless of the stale toggle state", () => {
    // The toggle says "pro" (leftover from before Epic 03, or simply unrelated state) but
    // the switcher's own resolution is what must win for this population.
    expect(deriveEffectiveRole({ multiWorkspace: true, activeWorkspace: PERSONAL, role: "pro" })).toBe("customer");
  });
});
