// Platform Activation Slice 0, WP 0.6 — the real Audit viewer's own tests: it fetches
// on mount, refetches from the start when a filter is applied (never appends), and
// paginates by appending only when "Load more" is pressed explicitly.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiRpc = vi.fn();

vi.mock("../../lib/supabaseClient", () => ({
  supabase: {
    schema: (name) => ({ rpc: (...args) => apiRpc(name, ...args) }),
  },
}));

import { AuditLog } from "../AuditLog.jsx";
import { AUDIT_PAGE_SIZE } from "../../lib/auditRecords";

const PERMITTED = {
  audit_id: "11111111-1111-4111-8111-000000000050",
  occurred_at: "2026-08-19T09:00:00Z",
  workspace_id: "11111111-1111-4111-8111-000000000051",
  actor_type: "person",
  actor_ref: "operator-one",
  action: "workspace.membership.granted",
  subject_type: "membership",
  subject_id: "11111111-1111-4111-8111-000000000052",
  outcome: "permitted",
  authority: "Support",
  correlation_id: "11111111-1111-4111-8111-000000000053",
  detail: {},
};

const DENIED = { ...PERMITTED, audit_id: "11111111-1111-4111-8111-000000000054", outcome: "denied", action: "workspace.membership.revoked" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AuditLog", () => {
  it("fetches and shows a real record's action and outcome on mount", async () => {
    apiRpc.mockResolvedValue({ data: [PERMITTED], error: null });

    render(<AuditLog />);

    await waitFor(() => expect(screen.getByText("workspace.membership.granted")).toBeTruthy());
    expect(screen.getByText("permitted")).toBeTruthy();
  });

  it("shows the empty state when nothing matches", async () => {
    apiRpc.mockResolvedValue({ data: [], error: null });

    render(<AuditLog />);

    await waitFor(() => expect(screen.getByText("No matching audit records.")).toBeTruthy());
  });

  it("distinguishes a denied outcome visibly from a permitted one", async () => {
    apiRpc.mockResolvedValue({ data: [DENIED], error: null });

    render(<AuditLog />);

    await waitFor(() => expect(screen.getByText("denied")).toBeTruthy());
  });

  it("applying a filter refetches from offset 0, not a fresh append", async () => {
    apiRpc.mockResolvedValue({ data: [PERMITTED], error: null });
    render(<AuditLog />);
    await waitFor(() => expect(apiRpc).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Filter by actor"), { target: { value: "someone" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => expect(apiRpc).toHaveBeenCalledTimes(2));
    expect(apiRpc).toHaveBeenLastCalledWith("api", "list_audit_records", expect.objectContaining({
      p_actor_ref: "someone",
      p_offset: 0,
    }));
  });

  it("Load more appends the next page instead of replacing the current one", async () => {
    // A full first page (exactly AUDIT_PAGE_SIZE) is what makes hasMore true at all —
    // see AuditLog's own "a full page implies there might be more" heuristic.
    const fullPage = Array.from({ length: AUDIT_PAGE_SIZE }, (_, i) => ({
      ...PERMITTED, audit_id: `11111111-1111-4111-8111-0000000005${String(i).padStart(2, "0")}`,
    }));
    apiRpc.mockResolvedValueOnce({ data: fullPage, error: null });
    render(<AuditLog />);
    await waitFor(() => expect(screen.getAllByText("workspace.membership.granted")).toHaveLength(AUDIT_PAGE_SIZE));

    apiRpc.mockResolvedValueOnce({ data: [DENIED], error: null });
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    await waitFor(() => expect(screen.getByText("workspace.membership.revoked")).toBeTruthy());
    // The first page's rows are still present — the second page was appended, not
    // swapped in for it.
    expect(screen.getAllByText("workspace.membership.granted")).toHaveLength(AUDIT_PAGE_SIZE);
  });

  it("does not offer Load more when a page comes back short of a full page", async () => {
    apiRpc.mockResolvedValue({ data: [PERMITTED], error: null });

    render(<AuditLog />);

    await waitFor(() => expect(screen.getByText("workspace.membership.granted")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
  });
});
