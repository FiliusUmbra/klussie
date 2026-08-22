// Platform Activation Slice 2 — closes the customer-side mirror of the same fragmentation
// gap ProJobDetailSheet.jsx just closed for the pro: RequestDetailSheet had no way to
// message the booked pro without leaving to the separate, disconnected Messages tab.
// Narrowly scoped to the new onMessage behaviour — this component has no prior test file,
// and building full coverage of every status branch is a separate undertaking.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../../lib/auth.jsx", () => ({ useAuth: () => ({ user: { id: "customer-1" } }) }));
// RequestDetailSheet renders RequestPhotosStrip unconditionally, which calls
// fetchRequestPhotos() -> the real Supabase client. Unmocked, this "worked" locally only
// because a real .env.local happens to be present — CI has none, so the same call throws
// (an unhandled rejection vitest reports as a failing run even though every assertion
// itself passes). Mocked the same way DocumentUploadSheet.test.jsx's own tests already
// keep every Supabase-touching child two steps removed.
vi.mock("../../lib/requestPhotos.js", () => ({ fetchRequestPhotos: vi.fn(() => Promise.resolve([])) }));

// ServiceRecordSummary (WP 3.2) self-fetches — mocked the same way RequestPhotosStrip's
// own real Supabase call is above, so every status-branch test stays two steps removed
// from the network. Its own tests below override this per-case.
const fetchServiceRecordForRequestMock = vi.fn(() => Promise.resolve(null));
const approveServiceRecordMock = vi.fn(() => Promise.resolve());
vi.mock("../../lib/serviceRecords.js", () => ({
  fetchServiceRecordForRequest: (...args) => fetchServiceRecordForRequestMock(...args),
  approveServiceRecord: (...args) => approveServiceRecordMock(...args),
}));

import { LangContext } from "../../lib/lang";
import { RequestDetailSheet } from "../RequestDetailSheet.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = {
  t,
  fmt: (n) => String(n),
  fmtDate: (ts) => `date:${ts}`,
  serviceInfo: (id) => ({ name: `service:${id}`, blurb: "" }),
  proBadgeLabel: () => null,
  whenLabel: (w) => w,
};

const BOOKED_REQUEST = {
  id: "req-1", serviceId: "svc-1", status: "booked", bookedProId: "pro-1",
  answers: { when: "flexible", details: "Fix the leak", fields: {}, aiAnalysis: null },
  quotes: [{ id: "q-1", proId: "pro-1", price: 120, pro: { id: "pro-1", name: "Pierre Pro", rating: 5 } }],
};

function renderSheet(overrides = {}) {
  return render(
    <LangContext.Provider value={ctx}>
      <RequestDetailSheet
        request={BOOKED_REQUEST}
        onClose={vi.fn()}
        onAccept={vi.fn()}
        onComplete={vi.fn()}
        onReview={vi.fn()}
        {...overrides}
      />
    </LangContext.Provider>
  );
}

describe("RequestDetailSheet — Message pro", () => {
  it("shows a Message pro button once a quote is booked, and calls onMessage", () => {
    const onMessage = vi.fn();
    renderSheet({ onMessage });
    fireEvent.click(screen.getByText("messageProBtn"));
    expect(onMessage).toHaveBeenCalled();
  });

  it("hides the button when no conversation was found (onMessage undefined)", () => {
    renderSheet({ onMessage: undefined });
    expect(screen.queryByText("messageProBtn")).toBeNull();
  });

  it("hides the button before any quote is booked, even if onMessage is provided", () => {
    renderSheet({
      request: { ...BOOKED_REQUEST, status: "collecting", bookedProId: null },
      onMessage: vi.fn(),
    });
    expect(screen.queryByText("messageProBtn")).toBeNull();
  });
});

// Platform Activation Slice 3, WP 3.2 — the customer's own read of the Service Record,
// once a completed/reviewed request has one. ServiceRecordSummary is exercised through
// its real host here, matching this file's own established convention (no dedicated
// src/requests/__tests__ directory exists — every summary component is covered through
// the sheet that actually renders it).
describe("RequestDetailSheet — ServiceRecordSummary (WP 3.2)", () => {
  const COMPLETED_REQUEST = { ...BOOKED_REQUEST, status: "completed", review: null };
  const REVIEWED_REQUEST = {
    ...BOOKED_REQUEST, status: "reviewed",
    review: { stars: 5, text: "Great work" },
  };

  it("does not fetch or render anything for a request that isn't completed/reviewed yet", () => {
    renderSheet({ request: BOOKED_REQUEST });
    expect(fetchServiceRecordForRequestMock).not.toHaveBeenCalled();
    expect(screen.queryByText("serviceRecordTitle")).toBeNull();
  });

  it("shows the educating empty state for a completed request with no record authored yet", async () => {
    fetchServiceRecordForRequestMock.mockResolvedValueOnce(null);
    renderSheet({ request: COMPLETED_REQUEST });

    expect(fetchServiceRecordForRequestMock).toHaveBeenCalledWith("req-1");
    await screen.findByText("serviceRecordEmptyMsg");
    expect(screen.queryByText("serviceRecordApproveBtn")).toBeNull();
  });

  it("renders the real record's own fields for a reviewed request that has one, with an Approve action", async () => {
    fetchServiceRecordForRequestMock.mockResolvedValueOnce({
      id: "rec-1", workPerformed: "Replaced the pressure relief valve.",
      recommendations: "Service again next year.", warrantyUntil: "2027-08-01",
      customerApproved: false, customerApprovedAt: null,
    });
    renderSheet({ request: REVIEWED_REQUEST });

    await screen.findByText("Replaced the pressure relief valve.");
    expect(screen.getByText("Service again next year.")).toBeTruthy();
    expect(screen.getByText(/date:2027-08-01/)).toBeTruthy();

    fireEvent.click(screen.getByText("serviceRecordApproveBtn"));
    expect(approveServiceRecordMock).toHaveBeenCalledWith("rec-1", "customer-1");
    await screen.findByText("serviceRecordApprovedMsg");
  });

  it("shows the approved confirmation instead of the button when already approved", async () => {
    fetchServiceRecordForRequestMock.mockResolvedValueOnce({
      id: "rec-1", workPerformed: "Replaced the valve.", recommendations: null,
      warrantyUntil: null, customerApproved: true, customerApprovedAt: "2026-08-02T00:00:00Z",
    });
    renderSheet({ request: REVIEWED_REQUEST });

    await screen.findByText("serviceRecordApprovedMsg");
    expect(screen.queryByText("serviceRecordApproveBtn")).toBeNull();
  });
});
