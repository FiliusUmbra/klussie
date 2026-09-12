// JoinBusinessSheet.jsx's own tests — the requester's half of Theme C's join-request
// flow (Profile.test.jsx covers the approver's own queue).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/workspaceJoin.js", () => ({
  searchProfessionalWorkspaces: vi.fn(),
  requestToJoinWorkspace: vi.fn(),
}));

import { searchProfessionalWorkspaces, requestToJoinWorkspace } from "../../lib/workspaceJoin.js";
import { JoinBusinessSheet } from "../JoinBusinessSheet.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });

const PIERRE_PRO = { workspace_id: "ws-pro", name: "Pierre Pro" };

beforeEach(() => {
  vi.mocked(searchProfessionalWorkspaces).mockReset().mockResolvedValue([]);
  vi.mocked(requestToJoinWorkspace).mockReset().mockResolvedValue(undefined);
});

function renderSheet(overrides = {}) {
  const onClose = vi.fn();
  render(<JoinBusinessSheet t={t} actorRef="person-1" onClose={onClose} {...overrides} />);
  return { onClose };
}

describe("JoinBusinessSheet — search", () => {
  it("searches as the query changes, showing each real result as a pickable chip", async () => {
    vi.mocked(searchProfessionalWorkspaces).mockResolvedValue([PIERRE_PRO]);
    renderSheet();

    fireEvent.change(screen.getByLabelText("joinBusinessSearchLabel"), { target: { value: "Pierre" } });

    await waitFor(() => expect(searchProfessionalWorkspaces).toHaveBeenCalledWith("Pierre"));
    await waitFor(() => expect(screen.getByText("Pierre Pro")).toBeTruthy());
  });

  it("shows the no-results line when a real search genuinely finds nothing", async () => {
    vi.mocked(searchProfessionalWorkspaces).mockResolvedValue([]);
    renderSheet();

    fireEvent.change(screen.getByLabelText("joinBusinessSearchLabel"), { target: { value: "Nobody Ever" } });

    await waitFor(() => expect(screen.getByText("joinBusinessNoResults")).toBeTruthy());
  });

  it("does not search at all for a blank query", () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText("joinBusinessSearchLabel"), { target: { value: "" } });
    expect(searchProfessionalWorkspaces).not.toHaveBeenCalled();
  });

  it("a failed search looks like no results, never a dead end", async () => {
    vi.mocked(searchProfessionalWorkspaces).mockRejectedValue(new Error("network error"));
    renderSheet();

    fireEvent.change(screen.getByLabelText("joinBusinessSearchLabel"), { target: { value: "Pierre" } });

    await waitFor(() => expect(screen.getByText("joinBusinessNoResults")).toBeTruthy());
  });
});

describe("JoinBusinessSheet — picking a result and sending a request", () => {
  async function pickPierre() {
    vi.mocked(searchProfessionalWorkspaces).mockResolvedValue([PIERRE_PRO]);
    fireEvent.change(screen.getByLabelText("joinBusinessSearchLabel"), { target: { value: "Pierre" } });
    await waitFor(() => expect(screen.getByText("Pierre Pro")).toBeTruthy());
    fireEvent.click(screen.getByText("Pierre Pro"));
  }

  it("reveals the message field and submit button only once a business is picked", async () => {
    renderSheet();
    expect(screen.queryByText("joinBusinessSubmitBtn")).toBeNull();

    await pickPierre();

    expect(screen.getByText("joinBusinessSubmitBtn")).toBeTruthy();
    expect(screen.getByLabelText("joinBusinessMessageLabel")).toBeTruthy();
  });

  it("submits with the picked workspace, the typed message, and the caller's own actorRef", async () => {
    renderSheet({ actorRef: "person-9" });
    await pickPierre();
    fireEvent.change(screen.getByLabelText("joinBusinessMessageLabel"), { target: { value: "We worked together before." } });

    fireEvent.click(screen.getByText("joinBusinessSubmitBtn"));

    await waitFor(() => expect(requestToJoinWorkspace).toHaveBeenCalledWith("ws-pro", "We worked together before.", "person-9"));
  });

  it("shows a real success state after sending, not just a closed sheet", async () => {
    renderSheet();
    await pickPierre();

    fireEvent.click(screen.getByText("joinBusinessSubmitBtn"));

    await waitFor(() => expect(screen.getByText("joinBusinessSentMsg")).toBeTruthy());
  });

  it("shows the specific already-pending message, not the raw backend one", async () => {
    vi.mocked(requestToJoinWorkspace).mockRejectedValue(new Error("workspace.request_to_join_for_caller: p1 already has a pending request for ws-pro"));
    renderSheet();
    await pickPierre();

    fireEvent.click(screen.getByText("joinBusinessSubmitBtn"));

    await waitFor(() => expect(screen.getByText("joinRequestAlreadyPending")).toBeTruthy());
    expect(screen.queryByText(/request_to_join_for_caller/)).toBeNull();
  });

  it("shows the specific already-a-member message, not the raw backend one", async () => {
    vi.mocked(requestToJoinWorkspace).mockRejectedValue(new Error("workspace.request_to_join_for_caller: p1 is already a member of ws-pro"));
    renderSheet();
    await pickPierre();

    fireEvent.click(screen.getByText("joinBusinessSubmitBtn"));

    await waitFor(() => expect(screen.getByText("joinRequestAlreadyMember")).toBeTruthy());
  });

  it("falls back to the generic send-failed message for any other real failure", async () => {
    vi.mocked(requestToJoinWorkspace).mockRejectedValue(new Error("insufficient_privilege"));
    renderSheet();
    await pickPierre();

    fireEvent.click(screen.getByText("joinBusinessSubmitBtn"));

    await waitFor(() => expect(screen.getByText("joinRequestSendFailed")).toBeTruthy());
    expect(screen.queryByText("insufficient_privilege")).toBeNull();
  });

  it("re-enables the submit button after a failure, never a permanent dead end", async () => {
    vi.mocked(requestToJoinWorkspace).mockRejectedValue(new Error("network error"));
    renderSheet();
    await pickPierre();

    fireEvent.click(screen.getByText("joinBusinessSubmitBtn"));

    await waitFor(() => expect(screen.getByText("joinRequestSendFailed")).toBeTruthy());
    expect(screen.getByText("joinBusinessSubmitBtn").closest("button").disabled).toBe(false);
  });
});
