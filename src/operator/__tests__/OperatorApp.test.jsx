// Platform Activation Slice 0, WP 0.5/0.6 — the shell now renders the real AuditLog
// (WP 0.6), which fetches on mount; supabaseClient is mocked here for the same reason
// auditRecords.test.js and operatorContext.test.js mock it, not because this file
// exercises the fetch itself — that behaviour is AuditLog's own test's job.
//
// UNIFIED_PRODUCT_IA_REVIEW.md §1/§9.5 — rewritten alongside the shell unification:
// BottomNav (the same component Customer/Pro share) replaces the old top segmented
// control, so tabs are switched by their own visible label, not a `role="tab"` query
// that no longer exists; identity/switcher/sign-out moved into their own Profile tab,
// matching CustomerProfile.jsx/ProProfile.jsx's own placement exactly, so those tests
// navigate there first rather than finding them on every screen.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const apiRpc = vi.fn();
const signOut = vi.fn();
const setActiveWorkspaceId = vi.fn();
const useAuthMock = vi.fn();

vi.mock("../../lib/supabaseClient", () => ({
  supabase: {
    schema: (name) => ({ rpc: (...args) => apiRpc(name, ...args) }),
  },
}));

// A real, previously-missing sign-out (and, for a multi-workspace operator, a workspace
// switch) is exactly what this screen was found to have no way to reach at all — see this
// component's own header comment.
vi.mock("../../lib/auth.jsx", () => ({ useAuth: () => useAuthMock() }));

import { OperatorApp } from "../OperatorApp.jsx";

beforeEach(() => {
  vi.clearAllMocks();
  apiRpc.mockResolvedValue({ data: [], error: null });
  // Single membership by default; the dedicated test below overrides this to exercise
  // the multi-workspace branch.
  useAuthMock.mockReturnValue({
    workspaceMemberships: [{ workspace_id: "ops-ws", workspace_name: "Klussie Operations", workspace_type: "business" }],
    activeWorkspace: { workspace_id: "ops-ws" },
    setActiveWorkspaceId,
    signOut,
  });
});

describe("OperatorApp", () => {
  it("shows three tabs on the same BottomNav Customer/Pro share, Audit selected by default", async () => {
    render(<OperatorApp />);

    await waitFor(() => expect(screen.getByText("No matching audit records.")).toBeTruthy());
    expect(screen.getByText("Audit").closest("button").className).toContain("tab-on");
    expect(screen.getByText("Workspaces").closest("button").className).not.toContain("tab-on");
    expect(screen.getByText("Profile").closest("button").className).not.toContain("tab-on");
  });

  it("renders the real Audit viewer under the Audit tab, not a placeholder", async () => {
    render(<OperatorApp />);

    await waitFor(() => expect(screen.getByText("No matching audit records.")).toBeTruthy());
  });

  // Platform Activation Slice 1, WP 1.1a
  it("renders the real Workspace lookup under the Workspaces tab", async () => {
    render(<OperatorApp />);

    fireEvent.click(screen.getByText("Workspaces"));

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
    fireEvent.click(screen.getByText("Workspaces"));
    await waitFor(() => expect(screen.getByText("Cathy Customer")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /view audit trail/i }));

    await waitFor(() => expect(screen.getByText("Audit").closest("button").className).toContain("tab-on"));
    expect(screen.getByLabelText("Filter by workspace id").value).toBe(workspaceId);
  });

  // A real, previously-missing gap — see this component's own header comment: this
  // screen had no way to leave at all, on any device, before this. Now lives in its own
  // Profile tab, the same place Customer/Pro each keep the identical action.
  it("Profile always shows a way to sign out, even with a single membership", () => {
    render(<OperatorApp />);

    fireEvent.click(screen.getByText("Profile"));
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(signOut).toHaveBeenCalled();
  });

  it("no longer shows a page-dominating 'Klussie Operations' heading on every tab — a small label, Profile only", async () => {
    render(<OperatorApp />);
    await waitFor(() => expect(screen.getByText("No matching audit records.")).toBeTruthy());
    expect(screen.queryByText("Klussie Operations")).toBeNull();

    fireEvent.click(screen.getByText("Profile"));
    expect(screen.getByText("Operations")).toBeTruthy();
    expect(screen.getByText("Signed in as an operator")).toBeTruthy();
  });

  it("shows no switcher, in Profile, for a single-membership operator", () => {
    render(<OperatorApp />);
    fireEvent.click(screen.getByText("Profile"));
    expect(screen.queryAllByText("Klussie Operations")).toHaveLength(0); // the workspace's own name, not shown when there's nothing to switch between
  });

  it("shows a real switcher in Profile for an operator who is also a real customer or pro — human names, no 'workspace' label (UNIFIED_PRODUCT_IA_REVIEW.md §3)", () => {
    useAuthMock.mockReturnValue({
      workspaceMemberships: [
        { workspace_id: "ops-ws", workspace_name: "Klussie Operations", workspace_type: "business" },
        { workspace_id: "personal-ws", workspace_name: "My Home", workspace_type: "personal" },
      ],
      activeWorkspace: { workspace_id: "ops-ws" },
      setActiveWorkspaceId,
      signOut,
    });

    render(<OperatorApp />);
    fireEvent.click(screen.getByText("Profile"));

    expect(screen.queryByText("Workspace")).toBeNull();
    fireEvent.click(screen.getByText("My Home"));
    expect(setActiveWorkspaceId).toHaveBeenCalledWith("personal-ws");
  });

  it("falls back to a human label, never the raw backend type, for an unnamed membership", () => {
    useAuthMock.mockReturnValue({
      workspaceMemberships: [
        { workspace_id: "ops-ws", workspace_name: null, workspace_type: "business" },
        { workspace_id: "personal-ws", workspace_name: "My Home", workspace_type: "personal" },
      ],
      activeWorkspace: { workspace_id: "ops-ws" },
      setActiveWorkspaceId,
      signOut,
    });

    render(<OperatorApp />);
    fireEvent.click(screen.getByText("Profile"));

    expect(screen.getByText("Business")).toBeTruthy();
    expect(screen.queryByText("business")).toBeNull();
  });
});
