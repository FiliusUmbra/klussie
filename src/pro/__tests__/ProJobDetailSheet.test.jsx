// Platform Activation Slice 2, WP 2.4's own real acceptance bar: a professional's job
// detail sheet, reachable for the first time (ProJobs.jsx had no drill-in at all before
// this), showing the timeline, a message-customer entry point, and the customer's own
// property twin once the scoped grant 0161/0162 created resolves it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/propertyTwin.js", () => ({
  fetchPropertyTwin: vi.fn(),
}));
// ProServiceRecordSection (WP 3.1/3.3) self-fetches whenever job.status === "completed" —
// mocked the same way fetchPropertyTwin is above, so the every-other-status tests below
// stay unaffected (none of them pass status: "completed").
vi.mock("../../lib/serviceRecords.js", () => ({
  fetchServiceRecordForRequest: vi.fn(),
}));

import { fetchPropertyTwin } from "../../lib/propertyTwin.js";
import { fetchServiceRecordForRequest } from "../../lib/serviceRecords.js";
import { ProJobDetailSheet } from "../ProJobDetailSheet.jsx";
import { LangContext } from "../../lib/lang";

// Returns each key as itself, so assertions name the string key rather than copy —
// matching conversationHome.test.jsx's own established pattern.
const t = new Proxy({}, { get: (_, key) => String(key) });

const ctx = {
  t,
  fmt: (n) => String(n),
  fmtDate: (ts) => `date:${ts}`,
  serviceInfo: (id) => ({ name: `service:${id}`, blurb: "" }),
};

function renderSheet({ job: jobOverrides, ...rest } = {}) {
  const job = {
    id: "req-1", serviceId: "svc-plumbing", status: "booked",
    quotes: [{ id: "q-1", price: 120 }], propertyId: "prop-1",
    ...jobOverrides,
  };
  return render(
    <LangContext.Provider value={ctx}>
      <ProJobDetailSheet job={job} customerName="Cathy Customer" onMessage={vi.fn()} onClose={vi.fn()} workspaceId="ws-pro" actorRef="pro-1" {...rest} />
    </LangContext.Provider>
  );
}

beforeEach(() => {
  fetchPropertyTwin.mockReset();
  fetchPropertyTwin.mockResolvedValue({ property: null, locations: [], assets: [], documents: [] });
  fetchServiceRecordForRequest.mockReset();
  fetchServiceRecordForRequest.mockResolvedValue(null);
});

describe("ProJobDetailSheet", () => {
  it("shows the job's own service name, customer name, price and timeline", () => {
    renderSheet();
    expect(screen.getByText("service:svc-plumbing")).toBeTruthy();
    expect(screen.getByText("Cathy Customer")).toBeTruthy();
    expect(screen.getByText("€120")).toBeTruthy();
  });

  it("shows a Message customer button that calls onMessage when a conversation exists", () => {
    const onMessage = vi.fn();
    renderSheet({ onMessage });
    fireEvent.click(screen.getByText("messageCustomerBtn"));
    expect(onMessage).toHaveBeenCalled();
  });

  it("hides the Message customer button when no conversation was found (onMessage undefined)", () => {
    renderSheet({ onMessage: undefined });
    expect(screen.queryByText("messageCustomerBtn")).toBeNull();
  });

  it("shows the deliberate no-scope-yet empty state for a job with no property at all — never an error", () => {
    renderSheet({ job: { propertyId: null } });
    expect(fetchPropertyTwin).not.toHaveBeenCalled();
    expect(screen.getByText("twinUnavailableMsg")).toBeTruthy();
  });

  it("fetches the twin for a job's own property id and renders locations/assets/documents once resolved", async () => {
    fetchPropertyTwin.mockResolvedValue({
      property: { id: "prop-1", name: "Kerkstraat 12" },
      locations: [{ id: "loc-1", name: "Kitchen" }],
      assets: [{ id: "asset-1", name: "Boiler", make: "Vaillant", model: "ecoTEC" }],
      documents: [{ id: "doc-1", type_key: "warranty" }],
    });

    renderSheet();

    expect(fetchPropertyTwin).toHaveBeenCalledWith("prop-1");
    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());
    expect(screen.getByText(/Boiler/)).toBeTruthy();
    expect(screen.getByText(/Vaillant ecoTEC/)).toBeTruthy();
    expect(screen.getByText("documentTypeWarranty")).toBeTruthy();
  });

  it("shows twinNoDataMsg when the property resolves but nothing is recorded yet — not the unavailable message", async () => {
    fetchPropertyTwin.mockResolvedValue({
      property: { id: "prop-1", name: "Kerkstraat 12" },
      locations: [], assets: [], documents: [],
    });

    renderSheet();

    await waitFor(() => expect(screen.getByText("twinNoDataMsg")).toBeTruthy());
    expect(screen.queryByText("twinUnavailableMsg")).toBeNull();
  });

  it("shows twinUnavailableMsg (not twinNoDataMsg) when the property itself never resolves — the real no-scope-yet case", async () => {
    fetchPropertyTwin.mockResolvedValue({ property: null, locations: [], assets: [], documents: [] });

    renderSheet();

    await waitFor(() => expect(screen.getByText("twinUnavailableMsg")).toBeTruthy());
    expect(screen.queryByText("twinNoDataMsg")).toBeNull();
  });

  it("falls back to the raw type_key for a document type this codebase has no label for", async () => {
    fetchPropertyTwin.mockResolvedValue({
      property: { id: "prop-1", name: "X" },
      locations: [], assets: [],
      documents: [{ id: "doc-1", type_key: "some_future_type" }],
    });

    renderSheet();

    await waitFor(() => expect(screen.getByText("some_future_type")).toBeTruthy());
  });

  it("does not fetch or render the Service Record section for anything but a completed job", () => {
    renderSheet({ job: { status: "booked" } });
    expect(fetchServiceRecordForRequest).not.toHaveBeenCalled();
    expect(screen.queryByText("serviceRecordTitle")).toBeNull();
  });
});

// Platform Activation Slice 3, WP 3.1 (the decided gate) + WP 3.3 (the editor that makes
// it a real entry point, not a stub).
describe("ProJobDetailSheet — ProServiceRecordSection (WP 3.1 + WP 3.3)", () => {
  it("shows a real 'write it up' entry point for a completed job with no record yet — the gate WP 3.1 decided", async () => {
    fetchServiceRecordForRequest.mockResolvedValue(null);
    renderSheet({ job: { status: "completed" } });

    expect(fetchServiceRecordForRequest).toHaveBeenCalledWith("req-1");
    await waitFor(() => expect(screen.getByText("srWriteItUpBtn")).toBeTruthy());
  });

  it("shows the pro's own read-only summary instead, once a record exists — never a reopened editor", async () => {
    fetchServiceRecordForRequest.mockResolvedValue({
      id: "rec-1", workPerformed: "Replaced the pressure relief valve.",
      recommendations: "Check again next year.", warrantyUntil: "2027-08-01",
    });
    renderSheet({ job: { status: "completed" } });

    await waitFor(() => expect(screen.getByText("Replaced the pressure relief valve.")).toBeTruthy());
    expect(screen.getByText("Check again next year.")).toBeTruthy();
    expect(screen.getByText(/date:2027-08-01/)).toBeTruthy();
    expect(screen.queryByText("srWriteItUpBtn")).toBeNull();
    // No approve action — that's ServiceRecordSummary's own customer-side behavior, and
    // a pro is never the property's steward.
    expect(screen.queryByText("serviceRecordApproveBtn")).toBeNull();
  });

  it("opens the editor sheet when 'write it up' is tapped", async () => {
    fetchServiceRecordForRequest.mockResolvedValue(null);
    renderSheet({ job: { status: "completed" } });

    await waitFor(() => expect(screen.getByText("srWriteItUpBtn")).toBeTruthy());
    fireEvent.click(screen.getByText("srWriteItUpBtn"));

    expect(screen.getByText("srEditorTitle")).toBeTruthy();
    expect(screen.getByPlaceholderText("srWorkPerformedPlaceholder")).toBeTruthy();
  });

  // A real bug, found live 2026-08-28: work.engagements has no 'reviewed' status at all
  // (0182's own constraint) — it stays 'completed' forever once complete. job.status here
  // is the *request's* own status, which keeps progressing after a customer reviews. The
  // gate used to check only "completed", so the moment a customer left a review the write-
  // it-up entry point vanished permanently, even with no record ever authored.
  it("still shows the entry point for a 'reviewed' job with no record yet — a review must never lock the pro out", async () => {
    fetchServiceRecordForRequest.mockResolvedValue(null);
    renderSheet({ job: { status: "reviewed" } });

    expect(fetchServiceRecordForRequest).toHaveBeenCalledWith("req-1");
    await waitFor(() => expect(screen.getByText("srWriteItUpBtn")).toBeTruthy());
  });
});
