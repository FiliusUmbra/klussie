// Platform Activation Slice 0, WP 0.5/0.6 — the shell now renders the real AuditLog
// (WP 0.6), which fetches on mount; supabaseClient is mocked here for the same reason
// auditRecords.test.js and operatorContext.test.js mock it, not because this file
// exercises the fetch itself — that behaviour is AuditLog's own test's job.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const apiRpc = vi.fn();

vi.mock("../../lib/supabaseClient", () => ({
  supabase: {
    schema: (name) => ({ rpc: (...args) => apiRpc(name, ...args) }),
  },
}));

import { OperatorApp } from "../OperatorApp.jsx";

beforeEach(() => {
  vi.clearAllMocks();
  apiRpc.mockResolvedValue({ data: [], error: null });
});

describe("OperatorApp", () => {
  it("identifies itself as the Operations Workspace, distinctly from Customer/Pro", () => {
    render(<OperatorApp />);

    expect(screen.getByText("Klussie Operations")).toBeTruthy();
  });

  it("shows two tabs, Audit selected by default", () => {
    render(<OperatorApp />);

    expect(screen.getByRole("tab", { name: "Audit" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Workspaces" }).getAttribute("aria-selected")).toBe("false");
  });

  it("renders the real Audit viewer under the Audit tab, not a placeholder", async () => {
    render(<OperatorApp />);

    await waitFor(() => expect(screen.getByText("No matching audit records.")).toBeTruthy());
  });

  // Platform Activation Slice 1, WP 1.1a
  it("renders the real Workspace lookup under the Workspaces tab", async () => {
    render(<OperatorApp />);

    fireEvent.click(screen.getByRole("tab", { name: "Workspaces" }));

    await waitFor(() => expect(screen.getByText("No matching workspaces.")).toBeTruthy());
  });

  it("View audit trail on a workspace switches to Audit, scoped to that workspace", async () => {
    const workspaceId = "11111111-1111-4111-8111-000000000060";
    apiRpc.mockImplementation((_schema, fn) => {
      if (fn === "search_workspaces") {
        return Promise.resolve({
          data: [{
            workspace_id: workspaceId,
            workspace_name: "Cathy Customer",
            workspace_type: "personal",
            created_at: "2026-01-01T00:00:00Z",
            archived_at: null,
            owner_name: "Cathy Customer",
            owner_email: "cathy@example.com",
            property_count: 1,
            membership_count: 1,
            capability_keys: [],
            last_activity_at: null,
          }],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    render(<OperatorApp />);
    fireEvent.click(screen.getByRole("tab", { name: "Workspaces" }));
    await waitFor(() => expect(screen.getByText("Cathy Customer")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /view audit trail/i }));

    await waitFor(() => expect(screen.getByRole("tab", { name: "Audit" }).getAttribute("aria-selected")).toBe("true"));
    expect(screen.getByLabelText("Filter by workspace id").value).toBe(workspaceId);
  });
});
