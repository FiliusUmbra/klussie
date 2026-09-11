// Support access, WP S.1 — SupportAccessSheet's own tests: the request form, the grant
// history, and ending an active grant. WorkspaceLookup.test.jsx already covers the sheet
// opening for the right workspace; this file covers the sheet's own internal behaviour.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchSupportAccessGrants = vi.fn();
const grantSupportAccess = vi.fn();
const endSupportAccess = vi.fn();

vi.mock("../../lib/supportAccess.js", () => ({
  fetchSupportAccessGrants: (...args) => fetchSupportAccessGrants(...args),
  grantSupportAccess: (...args) => grantSupportAccess(...args),
  endSupportAccess: (...args) => endSupportAccess(...args),
}));

import { SupportAccessSheet } from "../SupportAccessSheet.jsx";

const ACTIVE_GRANT = {
  membershipId: "mem-1",
  operatorName: "Otto Operator",
  purpose: "Investigating a billing dispute",
  grantedAt: "2026-08-24T00:00:00Z",
  expiresAt: "2026-08-24T08:00:00Z",
  status: "active",
};

const ENDED_GRANT = { ...ACTIVE_GRANT, membershipId: "mem-2", status: "ended" };

beforeEach(() => {
  vi.clearAllMocks();
  fetchSupportAccessGrants.mockResolvedValue([]);
});

describe("SupportAccessSheet", () => {
  it("fetches the grant history for the right workspace on open", async () => {
    render(<SupportAccessSheet workspaceId="ws-1" workspaceName="Pierre's Painting" actorRef="operator-auth-1" onClose={vi.fn()} />);
    await waitFor(() => expect(fetchSupportAccessGrants).toHaveBeenCalledWith("ws-1"));
    expect(screen.getByText("Pierre's Painting")).toBeTruthy();
  });

  it("shows an empty state when the workspace has never had a support-access grant", async () => {
    render(<SupportAccessSheet workspaceId="ws-1" workspaceName="Pierre's Painting" actorRef="operator-auth-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/No support access has ever been granted/)).toBeTruthy());
  });

  it("Request access is disabled until a purpose is typed", async () => {
    render(<SupportAccessSheet workspaceId="ws-1" workspaceName="Pierre's Painting" actorRef="operator-auth-1" onClose={vi.fn()} />);
    await waitFor(() => expect(fetchSupportAccessGrants).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: /request access/i }).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Purpose/), { target: { value: "Billing dispute" } });
    expect(screen.getByRole("button", { name: /request access/i }).disabled).toBe(false);
  });

  it("submits with the selected duration (defaulting to 8 hours) and the operator's own actorRef, then refreshes history", async () => {
    grantSupportAccess.mockResolvedValue(undefined);
    render(<SupportAccessSheet workspaceId="ws-1" workspaceName="Pierre's Painting" actorRef="operator-auth-1" onClose={vi.fn()} />);
    await waitFor(() => expect(fetchSupportAccessGrants).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText(/Purpose/), { target: { value: "Billing dispute" } });
    fireEvent.click(screen.getByRole("button", { name: /request access/i }));

    await waitFor(() =>
      expect(grantSupportAccess).toHaveBeenCalledWith({
        workspaceId: "ws-1", purpose: "Billing dispute", durationHours: 8, actorRef: "operator-auth-1",
      })
    );
    await waitFor(() => expect(fetchSupportAccessGrants).toHaveBeenCalledTimes(2));
  });

  it("submits the picked duration when a different one is selected", async () => {
    grantSupportAccess.mockResolvedValue(undefined);
    render(<SupportAccessSheet workspaceId="ws-1" workspaceName="Pierre's Painting" actorRef="operator-auth-1" onClose={vi.fn()} />);
    await waitFor(() => expect(fetchSupportAccessGrants).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/Purpose/), { target: { value: "Billing dispute" } });
    fireEvent.click(screen.getByText("72 hours"));
    fireEvent.click(screen.getByRole("button", { name: /request access/i }));

    await waitFor(() => expect(grantSupportAccess).toHaveBeenCalledWith(expect.objectContaining({ durationHours: 72 })));
  });

  it("shows the real error message rather than swallowing a failed grant", async () => {
    grantSupportAccess.mockRejectedValue(new Error("a real stated purpose is required"));
    render(<SupportAccessSheet workspaceId="ws-1" workspaceName="Pierre's Painting" actorRef="operator-auth-1" onClose={vi.fn()} />);
    await waitFor(() => expect(fetchSupportAccessGrants).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/Purpose/), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /request access/i }));

    await waitFor(() => expect(screen.getByText("a real stated purpose is required")).toBeTruthy());
  });

  it("shows an End access button only on an active grant, never on an ended one", async () => {
    fetchSupportAccessGrants.mockResolvedValue([ACTIVE_GRANT, ENDED_GRANT]);
    render(<SupportAccessSheet workspaceId="ws-1" workspaceName="Pierre's Painting" actorRef="operator-auth-1" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getAllByRole("button", { name: /end access/i })).toHaveLength(1));
  });

  it("End access calls endSupportAccess with the right membership id and the operator's own actorRef, then refreshes", async () => {
    fetchSupportAccessGrants.mockResolvedValue([ACTIVE_GRANT]);
    endSupportAccess.mockResolvedValue(undefined);
    render(<SupportAccessSheet workspaceId="ws-1" workspaceName="Pierre's Painting" actorRef="operator-auth-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /end access/i })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /end access/i }));

    await waitFor(() => expect(endSupportAccess).toHaveBeenCalledWith({ membershipId: "mem-1", actorRef: "operator-auth-1" }));
    await waitFor(() => expect(fetchSupportAccessGrants).toHaveBeenCalledTimes(2));
  });

  // Found by code audit, 2026-09-11: refresh() used to sit inside the same try as the
  // real write -- a failure there, after grantSupportAccess() had already succeeded,
  // showed a raw error message for a grant that had actually gone through, and (since
  // purpose was already cleared) invited the operator to retype it and submit again:
  // a second, redundant elevated-access grant, not just a confusing error.
  it("clears the purpose and shows no error when the post-grant history refresh fails — the grant itself already went through", async () => {
    grantSupportAccess.mockResolvedValue(undefined);
    render(<SupportAccessSheet workspaceId="ws-1" workspaceName="Pierre's Painting" actorRef="operator-auth-1" onClose={vi.fn()} />);
    await waitFor(() => expect(fetchSupportAccessGrants).toHaveBeenCalledTimes(1));
    // The initial load above already consumed the default resolved value; only the
    // refresh() triggered by the grant below should fail.
    fetchSupportAccessGrants.mockRejectedValueOnce(new Error("network blip refetching grant history"));

    fireEvent.change(screen.getByPlaceholderText(/Purpose/), { target: { value: "Billing dispute" } });
    fireEvent.click(screen.getByRole("button", { name: /request access/i }));

    await waitFor(() => expect(grantSupportAccess).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByPlaceholderText(/Purpose/).value).toBe(""));
    expect(screen.queryByText("network blip refetching grant history")).toBeNull();
  });

  // Same shape as the grant test above, on the End access side: a failed refresh must
  // never read as the end action itself having failed.
  it("shows no error when the post-end history refresh fails — the grant itself was already ended", async () => {
    fetchSupportAccessGrants.mockResolvedValue([ACTIVE_GRANT]);
    endSupportAccess.mockResolvedValue(undefined);
    render(<SupportAccessSheet workspaceId="ws-1" workspaceName="Pierre's Painting" actorRef="operator-auth-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /end access/i })).toBeTruthy());
    fetchSupportAccessGrants.mockRejectedValueOnce(new Error("network blip refetching grant history"));

    fireEvent.click(screen.getByRole("button", { name: /end access/i }));

    await waitFor(() => expect(endSupportAccess).toHaveBeenCalled());
    // submitting settles back to false regardless of the refresh outcome — the End
    // access button (disabled only by `submitting`) is clickable again.
    await waitFor(() => expect(screen.getByRole("button", { name: /end access/i }).disabled).toBe(false));
    expect(screen.queryByText("network blip refetching grant history")).toBeNull();
  });
});
