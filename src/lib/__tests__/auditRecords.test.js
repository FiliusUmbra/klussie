// Platform Activation Slice 0, WP 0.6 — same mocking shape as operatorContext.test.js
// and workspaceContext.test.js deliberately: this module's fallback idiom is the same
// one every other read switch in this codebase already uses.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiRpc = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: {
    schema: (name) => ({ rpc: (...args) => apiRpc(name, ...args) }),
  },
}));

import { fetchAuditRecords, AUDIT_PAGE_SIZE } from "../auditRecords";

const ROW = {
  audit_id: "11111111-1111-4111-8111-000000000040",
  occurred_at: "2026-08-19T09:00:00Z",
  workspace_id: "11111111-1111-4111-8111-000000000041",
  actor_type: "person",
  actor_ref: "11111111-1111-4111-8111-000000000042",
  action: "workspace.membership.granted",
  subject_type: "membership",
  subject_id: "11111111-1111-4111-8111-000000000043",
  outcome: "permitted",
  authority: "Support",
  correlation_id: "11111111-1111-4111-8111-000000000044",
  detail: { note: "example" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchAuditRecords", () => {
  it("calls api.list_audit_records with the page size and every filter, empty fields normalised to null", async () => {
    apiRpc.mockResolvedValue({ data: [], error: null });

    await fetchAuditRecords({ actorRef: "someone", actionPrefix: "", occurredFrom: undefined });

    expect(apiRpc).toHaveBeenCalledWith("api", "list_audit_records", {
      p_workspace_id: null,
      p_actor_ref: "someone",
      p_action_prefix: null,
      p_occurred_from: null,
      p_occurred_to: null,
      p_limit: AUDIT_PAGE_SIZE,
      p_offset: 0,
    });
  });

  it("passes the given offset through for pagination", async () => {
    apiRpc.mockResolvedValue({ data: [], error: null });

    await fetchAuditRecords({ offset: 25 });

    expect(apiRpc).toHaveBeenCalledWith("api", "list_audit_records", expect.objectContaining({ p_offset: 25 }));
  });

  it("reshapes rows into camelCase, one per real column", async () => {
    apiRpc.mockResolvedValue({ data: [ROW], error: null });

    const [record] = await fetchAuditRecords();

    expect(record).toEqual({
      id: ROW.audit_id,
      occurredAt: ROW.occurred_at,
      workspaceId: ROW.workspace_id,
      actorType: ROW.actor_type,
      actorRef: ROW.actor_ref,
      action: ROW.action,
      subjectType: ROW.subject_type,
      subjectId: ROW.subject_id,
      outcome: ROW.outcome,
      authority: ROW.authority,
      correlationId: ROW.correlation_id,
      detail: ROW.detail,
    });
  });

  it("returns an empty page rather than throwing when the resolver is unavailable — the same EXISTS-gated behaviour a non-operator sees", async () => {
    apiRpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const records = await fetchAuditRecords();

    expect(records).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns an empty page rather than throwing when the client itself throws", async () => {
    apiRpc.mockRejectedValue(new Error("network unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const records = await fetchAuditRecords();

    expect(records).toEqual([]);
    warn.mockRestore();
  });
});
