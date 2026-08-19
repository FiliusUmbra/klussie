// Platform Activation Slice 0, WP 0.5 — mirrors workspaceContext.test.js's mocking
// shape deliberately: same fallback idiom (never throw, never fail open), same reason
// (a resolver an environment might not have yet must not break sign-in) — extended here
// to a check that must additionally never fail *open* toward operator UI.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiRpc = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: {
    schema: (name) => ({ rpc: (...args) => apiRpc(name, ...args) }),
  },
}));

import { isOperatorWorkspace } from "../operatorContext";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isOperatorWorkspace", () => {
  it("returns false without calling anything when there is no workspace id", async () => {
    const result = await isOperatorWorkspace(null);

    expect(result).toBe(false);
    expect(apiRpc).not.toHaveBeenCalled();
  });

  it("calls api.my_workspace_has_capability with the workspace id and the platform_operations key", async () => {
    apiRpc.mockResolvedValue({ data: true, error: null });

    await isOperatorWorkspace("11111111-1111-4111-8111-000000000030");

    expect(apiRpc).toHaveBeenCalledWith("api", "my_workspace_has_capability", {
      p_workspace_id: "11111111-1111-4111-8111-000000000030",
      p_capability_key: "platform_operations",
    });
  });

  it("returns true only when the RPC itself returns true", async () => {
    apiRpc.mockResolvedValue({ data: true, error: null });

    expect(await isOperatorWorkspace("ws-1")).toBe(true);
  });

  it("returns false when the RPC returns false", async () => {
    apiRpc.mockResolvedValue({ data: false, error: null });

    expect(await isOperatorWorkspace("ws-1")).toBe(false);
  });

  it("fails closed (false), not open, when the resolver is unavailable", async () => {
    apiRpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await isOperatorWorkspace("ws-1");

    expect(result).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("fails closed (false), not open, when the client throws", async () => {
    apiRpc.mockRejectedValue(new Error("network unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await isOperatorWorkspace("ws-1");

    expect(result).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
