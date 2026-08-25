// Platform Activation Slice 0, WP 0.5/0.6 — the shell now renders the real AuditLog
// (WP 0.6), which fetches on mount; supabaseClient is mocked here for the same reason
// auditRecords.test.js and operatorContext.test.js mock it, not because this file
// exercises the fetch itself — that behaviour is AuditLog's own test's job.
//
// UNIFIED_PRODUCT_IA_REVIEW.md §1/§9.5 — rewritten alongside the shell unification:
// BottomNav (the same component Customer/Pro share) replaces the old top segmented
// control, so tabs are switched by their own visible label, not a `role="tab"` query
// that no longer exists; identity/switcher/sign-out moved into their own Profile tab,
// matching src/profile/Profile.jsx's own placement exactly, so those tests
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
    user: { id: "operator-auth-1" },
    workspaceMemberships: [{ workspace_id: "ops-ws", workspace_name: "Klussie Operations", workspace_type: "business" }],
    activeWorkspace: { workspace_id: "ops-ws" },
    setActiveWorkspaceId,
    signOut,
  });
});

describe("OperatorApp", () => {
  it("shows five tabs on the same BottomNav Customer/Pro share, Overview selected by default", async () => {
    render(<OperatorApp />);

    await waitFor(() => expect(screen.getByText("Property/asset recorded")).toBeTruthy());
    expect(screen.getByText("Overview").closest("button").className).toContain("tab-on");
    expect(screen.getByText("Audit").closest("button").className).not.toContain("tab-on");
    expect(screen.getByText("Workspaces").closest("button").className).not.toContain("tab-on");
    expect(screen.getByText("Reports").closest("button").className).not.toContain("tab-on");
    expect(screen.getByText("Profile").closest("button").className).not.toContain("tab-on");
  });

  it("renders the real Overview under its own tab, all five Activation Ratio journeys", async () => {
    render(<OperatorApp />);

    await waitFor(() => expect(screen.getByText("Property/asset recorded")).toBeTruthy());
    expect(screen.getByText("Request → booking")).toBeTruthy();
    expect(screen.getByText("Work performed → Service Record")).toBeTruthy();
    expect(screen.getByText("Conversation")).toBeTruthy();
    expect(screen.getByText("Report / dispute")).toBeTruthy();
    expect(apiRpc).toHaveBeenCalledWith("api", "activation_ratios", expect.objectContaining({ p_window_days: 30 }));
  });

  it("renders the real Audit viewer under the Audit tab, not a placeholder", async () => {
    render(<OperatorApp />);
    fireEvent.click(screen.getByText("Audit"));

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
    await waitFor(() => expect(screen.getByText("Property/asset recorded")).toBeTruthy());
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
      user: { id: "operator-auth-1" },
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

// Slice 5, WP 5.2 — the Trust & Safety tab: a fourth tab on the same shell, following
// AuditLog/WorkspaceLookup's own established shape (a list that opens into a detail view).
describe("OperatorApp — Reports tab (Trust & Safety, WP 5.2)", () => {
  const CASE_ROW = {
    case_id: "case-1",
    reporter_name: "Cathy Customer",
    reported_workspace_id: "pro-ws-1",
    reported_workspace_name: "Pierre's Painting",
    category: "poor_quality",
    status: "open",
    created_at: "2026-08-01T00:00:00Z",
  };

  const CASE_DETAIL = {
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
    decisions: [],
  };

  function mockTrustSafetyApi({ decisionResult = { data: null, error: null } } = {}) {
    apiRpc.mockImplementation((_schema, fn) => {
      if (fn === "trust_safety_queue") return Promise.resolve({ data: [CASE_ROW], error: null });
      if (fn === "case_detail") return Promise.resolve({ data: [CASE_DETAIL], error: null });
      if (fn === "record_decision") return Promise.resolve(decisionResult);
      return Promise.resolve({ data: [], error: null });
    });
  }

  it("renders the real triage queue under the Reports tab", async () => {
    mockTrustSafetyApi();
    render(<OperatorApp />);

    fireEvent.click(screen.getByText("Reports"));

    await waitFor(() => expect(screen.getByText("Pierre's Painting")).toBeTruthy());
    expect(screen.getByText(/reported by Cathy Customer/)).toBeTruthy();
  });

  it("shows an empty state when there are no open reports", async () => {
    apiRpc.mockResolvedValue({ data: [], error: null });
    render(<OperatorApp />);

    fireEvent.click(screen.getByText("Reports"));

    await waitFor(() => expect(screen.getByText("No open reports.")).toBeTruthy());
  });

  it("opening a case shows its own detail sheet with the real case_detail contract", async () => {
    mockTrustSafetyApi();
    render(<OperatorApp />);

    fireEvent.click(screen.getByText("Reports"));
    await waitFor(() => expect(screen.getByText("Pierre's Painting")).toBeTruthy());
    fireEvent.click(screen.getByText("Pierre's Painting"));

    await waitFor(() => expect(screen.getByText("Never showed up.")).toBeTruthy());
    expect(screen.getByText("No decisions recorded yet.")).toBeTruthy();
  });

  it("recording a non-suspend decision calls api.record_decision with the operator's own auth id, then closes and refreshes the queue", async () => {
    mockTrustSafetyApi();
    render(<OperatorApp />);

    fireEvent.click(screen.getByText("Reports"));
    await waitFor(() => expect(screen.getByText("Pierre's Painting")).toBeTruthy());
    fireEvent.click(screen.getByText("Pierre's Painting"));
    await waitFor(() => expect(screen.getByText("Record a decision")).toBeTruthy());

    fireEvent.click(screen.getByText("Warn"));
    fireEvent.click(screen.getByText("Record decision"));

    await waitFor(() =>
      expect(apiRpc).toHaveBeenCalledWith(
        "api",
        "record_decision",
        expect.objectContaining({ p_case_id: "case-1", p_action: "warn", p_actor_ref: "operator-auth-1", p_actor_type: "person" })
      )
    );
    // The sheet closes once the decision is recorded.
    await waitFor(() => expect(screen.queryByText("Record a decision")).toBeNull());
  });

  it("suspend requires a capability key and a confirming step before it actually submits", async () => {
    mockTrustSafetyApi();
    render(<OperatorApp />);

    fireEvent.click(screen.getByText("Reports"));
    await waitFor(() => expect(screen.getByText("Pierre's Painting")).toBeTruthy());
    fireEvent.click(screen.getByText("Pierre's Painting"));
    await waitFor(() => expect(screen.getByText("Record a decision")).toBeTruthy());

    fireEvent.click(screen.getByText("Suspend a capability"));
    // Disabled until a capability key is entered.
    expect(screen.getByText("Record decision").closest("button").disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText(/Capability key to withdraw/), { target: { value: "marketplace_participation" } });
    fireEvent.click(screen.getByText("Record decision"));

    // Confirming modal, not an immediate submit.
    await waitFor(() => expect(screen.getByText(/This removes behaviour immediately/)).toBeTruthy());
    expect(apiRpc).not.toHaveBeenCalledWith("api", "record_decision", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));

    await waitFor(() =>
      expect(apiRpc).toHaveBeenCalledWith(
        "api",
        "record_decision",
        expect.objectContaining({ p_action: "suspend", p_capability_key: "marketplace_participation" })
      )
    );
  });
});
