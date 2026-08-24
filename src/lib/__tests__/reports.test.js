// Slice 5, WP 5.1 — ReportSheet.jsx's own cutover onto the real Trust & Safety contract.
// submitReport() keeps its own name; internally it now calls fileCase() (trustSafety.js)
// instead of a raw legacy table insert.
import { describe, it, expect, vi } from "vitest";

const { fileCase } = vi.hoisted(() => ({ fileCase: vi.fn() }));
vi.mock("../trustSafety.js", () => ({ fileCase }));

import { submitReport } from "../reports";

describe("submitReport", () => {
  it("calls fileCase with reportedWorkspaceId (not a person id), the reason as category, and requestId as the case's own subject", async () => {
    fileCase.mockResolvedValue(undefined);

    await submitReport({
      reporterId: "customer-auth-1",
      reportedWorkspaceId: "ws-pro-1",
      requestId: "req-1",
      reason: "poor_quality",
      details: "Never showed up.",
    });

    expect(fileCase).toHaveBeenCalledWith({
      reportedWorkspaceId: "ws-pro-1",
      category: "poor_quality",
      details: "Never showed up.",
      subjectType: "request",
      subjectId: "req-1",
      actorRef: "customer-auth-1",
    });
  });

  it("omits subjectType/subjectId when there is no requestId", async () => {
    fileCase.mockResolvedValue(undefined);

    await submitReport({ reporterId: "customer-auth-1", reportedWorkspaceId: "ws-pro-1", requestId: null, reason: "other", details: "" });

    expect(fileCase).toHaveBeenCalledWith(expect.objectContaining({ subjectType: null, subjectId: null }));
  });

  it("propagates a real error rather than swallowing it — the caller must know a report failed", async () => {
    fileCase.mockRejectedValue(new Error("caller has no real engagement with workspace ws-pro-1"));

    await expect(
      submitReport({ reporterId: "customer-auth-1", reportedWorkspaceId: "ws-pro-1", requestId: "req-1", reason: "other", details: "" })
    ).rejects.toThrow("no real engagement");
  });
});
