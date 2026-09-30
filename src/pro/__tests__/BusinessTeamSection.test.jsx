// BusinessTeamSection.jsx's own tests. Moved here (same scenarios, same assertions) from
// Profile.test.jsx's own "pro variant, join requests (Theme C)" describe block — see
// BusinessApp.jsx's own header for why this moved out of Profile.jsx (Account) into
// Business. One new test ("shows an explicit empty state") covers the one real behavior
// change: Profile.jsx's old version showed nothing at all for zero pending requests (right
// for a buried section on a long page); Team is now a destination a pro navigates to on
// purpose, where a blank screen looks broken, not quiet — see this component's own header.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const useAuthMock = vi.fn();

vi.mock("../../lib/auth.jsx", () => ({ useAuth: () => useAuthMock() }));
vi.mock("../../lib/workspaceJoin.js", () => ({
  fetchJoinRequests: vi.fn(),
  decideJoinRequest: vi.fn(() => Promise.resolve()),
}));

import { LangContext } from "../../lib/lang";
import { BusinessTeamSection } from "../BusinessTeamSection.jsx";
import { fetchJoinRequests, decideJoinRequest } from "../../lib/workspaceJoin.js";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = { t };

const REQUEST = { request_id: "req-1", person_ref: "person-2", full_name: "Otto External", avatar_url: null, message: "I used to work with you.", requested_at: "2026-09-12T10:00:00Z" };

function renderSection() {
  useAuthMock.mockReturnValue({ user: { id: "person-1" }, activeWorkspace: { workspace_id: "ws-pro" } });
  return render(
    <LangContext.Provider value={ctx}>
      <BusinessTeamSection />
    </LangContext.Provider>
  );
}

describe("BusinessTeamSection", () => {
  beforeEach(() => {
    vi.mocked(fetchJoinRequests).mockReset();
    vi.mocked(decideJoinRequest).mockReset().mockResolvedValue(undefined);
  });

  it("shows an explicit empty state, not a blank screen, when there are no pending requests", async () => {
    vi.mocked(fetchJoinRequests).mockResolvedValue([]);
    renderSection();

    await waitFor(() => expect(fetchJoinRequests).toHaveBeenCalledWith("ws-pro"));
    expect(screen.getByText("teamNoRequestsMsg")).toBeTruthy();
  });

  it("lists a real pending request with its requester's own name and message", async () => {
    vi.mocked(fetchJoinRequests).mockResolvedValue([REQUEST]);
    renderSection();

    await waitFor(() => expect(screen.getByText("Otto External")).toBeTruthy());
    expect(screen.getByText('"I used to work with you."')).toBeTruthy();
  });

  it("approving calls decideJoinRequest with 'approved' and refreshes the list off the screen", async () => {
    vi.mocked(fetchJoinRequests).mockImplementation(() =>
      Promise.resolve(decideJoinRequest.mock.calls.length > 0 ? [] : [REQUEST])
    );
    renderSection();
    await waitFor(() => expect(screen.getByText("joinRequestApproveBtn")).toBeTruthy());

    fireEvent.click(screen.getByText("joinRequestApproveBtn"));

    await waitFor(() => expect(decideJoinRequest).toHaveBeenCalledWith("req-1", "approved", "person-1"));
    await waitFor(() => expect(screen.getByText("teamNoRequestsMsg")).toBeTruthy());
  });

  it("declining calls decideJoinRequest with 'declined'", async () => {
    vi.mocked(fetchJoinRequests).mockResolvedValue([REQUEST]);
    renderSection();
    await waitFor(() => expect(screen.getByText("joinRequestDeclineBtn")).toBeTruthy());

    fireEvent.click(screen.getByText("joinRequestDeclineBtn"));

    await waitFor(() => expect(decideJoinRequest).toHaveBeenCalledWith("req-1", "declined", "person-1"));
  });

  it("shows a generic localized error and re-enables both buttons when a decision fails", async () => {
    vi.mocked(fetchJoinRequests).mockResolvedValue([REQUEST]);
    vi.mocked(decideJoinRequest).mockReset().mockRejectedValue(new Error("network error"));
    renderSection();
    await waitFor(() => expect(screen.getByText("joinRequestApproveBtn")).toBeTruthy());

    fireEvent.click(screen.getByText("joinRequestApproveBtn"));

    await waitFor(() => expect(screen.getByText("joinRequestDecideFailed")).toBeTruthy());
    expect(screen.getByText("joinRequestApproveBtn").closest("button").disabled).toBe(false);
  });

  it("a failed fetch (including a real permission refusal) shows the empty state, never an error banner", async () => {
    vi.mocked(fetchJoinRequests).mockRejectedValue(new Error("workspace.list_join_requests_for_caller: caller may not view join requests"));
    renderSection();

    await waitFor(() => expect(fetchJoinRequests).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("teamNoRequestsMsg")).toBeTruthy());
    expect(screen.queryByText(/may not view join requests/)).toBeNull();
  });

  it("two independently pending requests can be decided independently -- one busy never disables the other", async () => {
    const requestB = { ...REQUEST, request_id: "req-2", full_name: "Sparse", message: null };
    vi.mocked(fetchJoinRequests).mockResolvedValue([REQUEST, requestB]);
    let resolveDecision;
    vi.mocked(decideJoinRequest).mockReset().mockReturnValue(new Promise((resolve) => { resolveDecision = resolve; }));
    renderSection();
    await waitFor(() => expect(screen.getAllByText("joinRequestApproveBtn").length).toBe(2));

    fireEvent.click(screen.getAllByText("joinRequestApproveBtn")[0]);

    await waitFor(() => expect(screen.getAllByText("joinRequestApproveBtn")[0].closest("button").disabled).toBe(true));
    expect(screen.getAllByText("joinRequestApproveBtn")[1].closest("button").disabled).toBe(false);
    resolveDecision();
  });
});
