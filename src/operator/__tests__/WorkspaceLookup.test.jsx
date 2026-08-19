// Platform Activation Slice 1, WP 1.1a — WorkspaceLookup's own tests: it fetches on
// mount, searching resets to a fresh page, and "View audit trail" hands the workspace id
// up rather than duplicating any of AuditLog's own logic.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiRpc = vi.fn();

vi.mock("../../lib/supabaseClient", () => ({
  supabase: {
    schema: (name) => ({ rpc: (...args) => apiRpc(name, ...args) }),
  },
}));

import { WorkspaceLookup } from "../WorkspaceLookup.jsx";
import { WORKSPACE_LOOKUP_PAGE_SIZE } from "../../lib/workspaceLookup";

const PROFILE = {
  workspace_id: "11111111-1111-4111-8111-000000000060",
  workspace_name: "Cathy Customer",
  workspace_type: "personal",
  created_at: "2026-01-01T00:00:00Z",
  archived_at: null,
  owner_name: "Cathy Customer",
  owner_email: "cathy@example.com",
  property_count: 1,
  membership_count: 1,
  capability_keys: ["premium_home"],
  last_activity_at: "2026-08-18T09:00:00Z",
};

const ARCHIVED_PROFILE = {
  ...PROFILE,
  workspace_id: "11111111-1111-4111-8111-000000000061",
  workspace_name: "Old Business",
  workspace_type: "business",
  archived_at: "2026-05-01T00:00:00Z",
  capability_keys: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorkspaceLookup", () => {
  it("fetches and shows a real workspace's name and owner on mount", async () => {
    apiRpc.mockResolvedValue({ data: [PROFILE], error: null });

    render(<WorkspaceLookup />);

    await waitFor(() => expect(screen.getByText("Cathy Customer")).toBeTruthy());
    expect(screen.getByText(/owner Cathy Customer/)).toBeTruthy();
  });

  it("shows the empty state when nothing matches", async () => {
    apiRpc.mockResolvedValue({ data: [], error: null });

    render(<WorkspaceLookup />);

    await waitFor(() => expect(screen.getByText("No matching workspaces.")).toBeTruthy());
  });

  it("shows a workspace's capability keys as badges", async () => {
    apiRpc.mockResolvedValue({ data: [PROFILE], error: null });

    render(<WorkspaceLookup />);

    await waitFor(() => expect(screen.getByText("premium_home")).toBeTruthy());
  });

  it("marks an archived workspace visibly, distinct from an active one", async () => {
    apiRpc.mockResolvedValue({ data: [ARCHIVED_PROFILE], error: null });

    render(<WorkspaceLookup />);

    await waitFor(() => expect(screen.getByText(/archived/)).toBeTruthy());
  });

  it("searching refetches from offset 0 with the typed query", async () => {
    apiRpc.mockResolvedValue({ data: [], error: null });
    render(<WorkspaceLookup />);
    await waitFor(() => expect(apiRpc).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Search workspaces"), { target: { value: "Cathy" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => expect(apiRpc).toHaveBeenCalledTimes(2));
    expect(apiRpc).toHaveBeenLastCalledWith("api", "search_workspaces", expect.objectContaining({
      p_query: "Cathy",
      p_offset: 0,
    }));
  });

  it("Load more appends the next page instead of replacing the current one", async () => {
    const fullPage = Array.from({ length: WORKSPACE_LOOKUP_PAGE_SIZE }, (_, i) => ({
      ...PROFILE, workspace_id: `11111111-1111-4111-8111-0000000006${String(i).padStart(2, "0")}`,
    }));
    apiRpc.mockResolvedValueOnce({ data: fullPage, error: null });
    render(<WorkspaceLookup />);
    await waitFor(() => expect(screen.getAllByText("Cathy Customer")).toHaveLength(WORKSPACE_LOOKUP_PAGE_SIZE));

    apiRpc.mockResolvedValueOnce({ data: [ARCHIVED_PROFILE], error: null });
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    await waitFor(() => expect(screen.getByText("Old Business")).toBeTruthy());
    expect(screen.getAllByText("Cathy Customer")).toHaveLength(WORKSPACE_LOOKUP_PAGE_SIZE);
  });

  it("calls onViewAudit with the workspace id when its button is pressed", async () => {
    apiRpc.mockResolvedValue({ data: [PROFILE], error: null });
    const onViewAudit = vi.fn();

    render(<WorkspaceLookup onViewAudit={onViewAudit} />);
    await waitFor(() => expect(screen.getByText("Cathy Customer")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /view audit trail/i }));

    expect(onViewAudit).toHaveBeenCalledWith(PROFILE.workspace_id);
  });

  it("does not render a View audit trail button when onViewAudit is not given", async () => {
    apiRpc.mockResolvedValue({ data: [PROFILE], error: null });

    render(<WorkspaceLookup />);

    await waitFor(() => expect(screen.getByText("Cathy Customer")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /view audit trail/i })).toBeNull();
  });
});
