// ServiceRecordSummary.jsx's own tests — none existed before this.
//
// Found by code audit: handleApprove() had no try/catch at all. A real refusal left
// `approving` stuck at true forever — nothing past the await ever ran — so the button
// stayed permanently disabled with no way back in short of leaving and re-opening the
// sheet, and no explanation shown at any point. The exact "no dead end" shape this
// codebase has already found and fixed repeatedly elsewhere (PortfolioItemSheet.jsx's
// own identical gap, among others).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/auth.jsx", () => ({ useAuth: () => ({ user: { id: "cust-1" } }) }));

const fetchServiceRecordForRequestMock = vi.fn();
const approveServiceRecordMock = vi.fn();
vi.mock("../../lib/serviceRecords", () => ({
  fetchServiceRecordForRequest: (...args) => fetchServiceRecordForRequestMock(...args),
  approveServiceRecord: (...args) => approveServiceRecordMock(...args),
}));

import { LangContext } from "../../lib/lang";
import { ServiceRecordSummary } from "../ServiceRecordSummary.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = { t, fmtDate: (ts) => `date:${ts}` };

const RECORD = { id: "rec-1", workPerformed: "Replaced the valve.", customerApproved: false };

function renderSummary(requestId = "req-1") {
  return render(
    <LangContext.Provider value={ctx}>
      <ServiceRecordSummary requestId={requestId} />
    </LangContext.Provider>
  );
}

describe("ServiceRecordSummary — approve", () => {
  it("approves and shows the approved state on success", async () => {
    fetchServiceRecordForRequestMock.mockResolvedValue(RECORD);
    approveServiceRecordMock.mockResolvedValue();
    renderSummary();

    await screen.findByText("serviceRecordApproveBtn");
    fireEvent.click(screen.getByText("serviceRecordApproveBtn"));

    await waitFor(() => expect(approveServiceRecordMock).toHaveBeenCalledWith("rec-1", "cust-1"));
    await screen.findByText("serviceRecordApprovedMsg");
  });

  it("re-enables the button rather than leaving it permanently disabled, and shows a real error, when approval is refused", async () => {
    fetchServiceRecordForRequestMock.mockResolvedValue(RECORD);
    approveServiceRecordMock.mockRejectedValue(new Error("insufficient_privilege"));
    renderSummary();

    await screen.findByText("serviceRecordApproveBtn");
    fireEvent.click(screen.getByText("serviceRecordApproveBtn"));

    await waitFor(() => expect(screen.getByText("serviceRecordApproveFailed")).toBeTruthy());
    expect(screen.queryByText("insufficient_privilege")).toBeNull();
    // Not stuck disabled forever — a real way back in to retry.
    expect(screen.getByText("serviceRecordApproveBtn").closest("button").disabled).toBe(false);
    expect(screen.queryByText("serviceRecordApprovedMsg")).toBeNull();
  });
});
