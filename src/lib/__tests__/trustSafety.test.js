// Slice 5, WP 5.2 — same mocking shape as workspaceLookup.test.js deliberately: this
// module's read fallback idiom is the same one every other read switch in this codebase
// already uses.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiRpc = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: {
    schema: (name) => ({ rpc: (...args) => apiRpc(name, ...args) }),
  },
}));

import { fetchTrustSafetyQueue, fetchCaseDetail, recordDecision, fileCase, TRUST_SAFETY_QUEUE_PAGE_SIZE } from "../trustSafety.js";

const QUEUE_ROW = {
  case_id: "case-1",
  reporter_name: "Cathy Customer",
  reported_workspace_id: "pro-ws-1",
  reported_workspace_name: "Pierre's Painting",
  category: "poor_quality",
  status: "open",
  created_at: "2026-08-01T00:00:00Z",
};

const CASE_DETAIL_ROW = {
  case_id: "case-1",
  reporter_name: "Cathy Customer",
  reported_workspace_id: "pro-ws-1",
  reported_workspace_name: "Pierre's Painting",
  category: "poor_quality",
  details: "Never showed up.",
  subject_type: null,
  subject_id: null,
  status: "open",
  created_at: "2026-08-01T00:00:00Z",
  decisions: [
    { id: "d1", operatorName: "Otto Operator", action: "warn", reason: "First offense", capabilityKey: null, decidedAt: "2026-08-02T00:00:00Z" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchTrustSafetyQueue", () => {
  it("calls api.trust_safety_queue with the page size and offset", async () => {
    apiRpc.mockResolvedValue({ data: [], error: null });

    await fetchTrustSafetyQueue({ offset: 10 });

    expect(apiRpc).toHaveBeenCalledWith("api", "trust_safety_queue", { p_limit: TRUST_SAFETY_QUEUE_PAGE_SIZE, p_offset: 10 });
  });

  it("reshapes rows into camelCase, one per real column", async () => {
    apiRpc.mockResolvedValue({ data: [QUEUE_ROW], error: null });

    const [c] = await fetchTrustSafetyQueue();

    expect(c).toEqual({
      id: QUEUE_ROW.case_id,
      reporterName: QUEUE_ROW.reporter_name,
      reportedWorkspaceId: QUEUE_ROW.reported_workspace_id,
      reportedWorkspaceName: QUEUE_ROW.reported_workspace_name,
      category: QUEUE_ROW.category,
      status: QUEUE_ROW.status,
      createdAt: QUEUE_ROW.created_at,
    });
  });

  it("returns an empty page rather than throwing when the resolver is unavailable — the same EXISTS-gated behaviour a non-operator sees", async () => {
    apiRpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const results = await fetchTrustSafetyQueue();

    expect(results).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns an empty page rather than throwing when the client itself throws", async () => {
    apiRpc.mockRejectedValue(new Error("network unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const results = await fetchTrustSafetyQueue();

    expect(results).toEqual([]);
    warn.mockRestore();
  });
});

describe("fetchCaseDetail", () => {
  it("calls api.case_detail with the case id and reshapes the row, including its own decision history", async () => {
    apiRpc.mockResolvedValue({ data: [CASE_DETAIL_ROW], error: null });

    const detail = await fetchCaseDetail("case-1");

    expect(apiRpc).toHaveBeenCalledWith("api", "case_detail", { p_case_id: "case-1" });
    expect(detail.id).toBe("case-1");
    expect(detail.reportedWorkspaceName).toBe("Pierre's Painting");
    expect(detail.decisions).toEqual([
      { id: "d1", operatorName: "Otto Operator", action: "warn", reason: "First offense", capabilityKey: null, decidedAt: "2026-08-02T00:00:00Z" },
    ]);
  });

  it("returns null when the case does not exist or the caller is not an operator", async () => {
    apiRpc.mockResolvedValue({ data: [], error: null });

    expect(await fetchCaseDetail("case-missing")).toBeNull();
  });

  it("throws on a real error rather than swallowing it", async () => {
    apiRpc.mockResolvedValue({ data: null, error: { message: "denied" } });

    await expect(fetchCaseDetail("case-1")).rejects.toThrow("denied");
  });
});

describe("recordDecision", () => {
  it("calls api.record_decision with fresh ids, actor_type 'person', and the given action", async () => {
    apiRpc.mockResolvedValue({ data: null, error: null });

    await recordDecision({ caseId: "case-1", action: "warn", reason: "Be careful", actorRef: "operator-auth-1" });

    expect(apiRpc).toHaveBeenCalledWith(
      "api",
      "record_decision",
      expect.objectContaining({
        p_case_id: "case-1",
        p_action: "warn",
        p_reason: "Be careful",
        p_capability_key: null,
        p_actor_type: "person",
        p_actor_ref: "operator-auth-1",
      })
    );
    const args = apiRpc.mock.calls[0][2];
    for (const idField of ["p_decision_id", "p_withdrawal_history_id", "p_withdrawal_event_id", "p_decided_event_id", "p_correlation_id"]) {
      expect(typeof args[idField]).toBe("string");
    }
  });

  it("passes the capability key through only for a suspend action, null otherwise even if one was given", async () => {
    apiRpc.mockResolvedValue({ data: null, error: null });

    await recordDecision({ caseId: "case-1", action: "suspend", capabilityKey: "marketplace_participation", actorRef: "operator-auth-1" });
    expect(apiRpc).toHaveBeenCalledWith("api", "record_decision", expect.objectContaining({ p_action: "suspend", p_capability_key: "marketplace_participation" }));

    apiRpc.mockClear();
    await recordDecision({ caseId: "case-1", action: "warn", capabilityKey: "marketplace_participation", actorRef: "operator-auth-1" });
    expect(apiRpc).toHaveBeenCalledWith("api", "record_decision", expect.objectContaining({ p_action: "warn", p_capability_key: null }));
  });

  it("throws on a real error rather than swallowing it — a failed enforcement action must be visible", async () => {
    apiRpc.mockResolvedValue({ data: null, error: { message: "case already resolved" } });

    await expect(recordDecision({ caseId: "case-1", action: "warn", actorRef: "operator-auth-1" })).rejects.toThrow("case already resolved");
  });
});

describe("fileCase", () => {
  it("calls api.file_case with fresh ids, actor_type 'person', and the given fields", async () => {
    apiRpc.mockResolvedValue({ data: null, error: null });

    await fileCase({ reportedWorkspaceId: "pro-ws-1", category: "poor_quality", details: "Never showed up.", actorRef: "customer-auth-1" });

    expect(apiRpc).toHaveBeenCalledWith(
      "api",
      "file_case",
      expect.objectContaining({
        p_reported_workspace_id: "pro-ws-1",
        p_category: "poor_quality",
        p_details: "Never showed up.",
        p_actor_type: "person",
        p_actor_ref: "customer-auth-1",
      })
    );
  });

  it("throws on a real error rather than swallowing it", async () => {
    apiRpc.mockResolvedValue({ data: null, error: { message: "no real engagement" } });

    await expect(fileCase({ reportedWorkspaceId: "pro-ws-1", category: "other", actorRef: "customer-auth-1" })).rejects.toThrow("no real engagement");
  });
});
