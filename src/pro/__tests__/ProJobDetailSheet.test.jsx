// Platform Activation Slice 2, WP 2.4's own real acceptance bar: a professional's job
// detail sheet, reachable for the first time (ProJobs.jsx had no drill-in at all before
// this), showing the timeline, a message-customer entry point, and the customer's own
// property twin once the scoped grant 0161/0162 created resolves it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/propertyTwin.js", () => ({
  fetchPropertyTwin: vi.fn(),
  fetchDisclosedLocation: vi.fn(),
}));
// ProServiceRecordSection (WP 3.1/3.3) self-fetches whenever job.status === "completed" —
// mocked the same way fetchPropertyTwin is above, so the every-other-status tests below
// stay unaffected (none of them pass status: "completed").
vi.mock("../../lib/serviceRecords.js", () => ({
  fetchServiceRecordForRequest: vi.fn(),
}));
// Payments Slice A (WP A5) — the fee-disclosure card. Mocked the same way as the two
// above; jobs with no engagementId (every test before this section) never call any of
// these at all (the component's own guard), so this mock is inert for them.
vi.mock("../../lib/acquisitionFees.js", () => ({
  fetchMyAcquisitionFeeAssessments: vi.fn(),
  acceptAcquisitionFeeDisclosure: vi.fn(),
  confirmAcquisitionFeePaymentReceived: vi.fn(),
}));

import { fetchPropertyTwin, fetchDisclosedLocation } from "../../lib/propertyTwin.js";
import { fetchServiceRecordForRequest } from "../../lib/serviceRecords.js";
import {
  fetchMyAcquisitionFeeAssessments,
  acceptAcquisitionFeeDisclosure,
  confirmAcquisitionFeePaymentReceived,
} from "../../lib/acquisitionFees.js";
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
  fetchDisclosedLocation.mockReset();
  fetchDisclosedLocation.mockResolvedValue(null);
  fetchServiceRecordForRequest.mockReset();
  fetchServiceRecordForRequest.mockResolvedValue(null);
  fetchMyAcquisitionFeeAssessments.mockReset();
  fetchMyAcquisitionFeeAssessments.mockResolvedValue([]);
  acceptAcquisitionFeeDisclosure.mockReset();
  acceptAcquisitionFeeDisclosure.mockResolvedValue(undefined);
  confirmAcquisitionFeePaymentReceived.mockReset();
  confirmAcquisitionFeePaymentReceived.mockResolvedValue(undefined);
});

// Payments Slice A (WP A5) — the fee-disclosure card only ever appears for a job whose
// engagement actually has a chargeable assessment; every test above this describe leaves
// job.engagementId unset, so fetchMyAcquisitionFeeAssessments is never even called for
// them (asserted once, below, rather than in every pre-existing test).
describe("ProJobDetailSheet — acquisition-fee disclosure (Payments Slice A)", () => {
  const feeArgs = { job: { engagementId: "eng-1" } };

  it("never fetches assessments for a job with no engagement", () => {
    renderSheet();
    expect(fetchMyAcquisitionFeeAssessments).not.toHaveBeenCalled();
  });

  it("renders nothing when the job's engagement has no chargeable assessment", async () => {
    fetchMyAcquisitionFeeAssessments.mockResolvedValue([]);
    renderSheet(feeArgs);
    await waitFor(() => expect(fetchMyAcquisitionFeeAssessments).toHaveBeenCalledWith("ws-pro"));
    expect(screen.queryByText("acqFeeTitle")).toBeNull();
  });

  it("ignores a not_chargeable row for this engagement — same as no row at all", async () => {
    fetchMyAcquisitionFeeAssessments.mockResolvedValue([
      { engagementId: "eng-1", status: "not_chargeable", feeAmount: 0, rate: null, maxFee: null },
    ]);
    renderSheet(feeArgs);
    await waitFor(() => expect(fetchMyAcquisitionFeeAssessments).toHaveBeenCalled());
    expect(screen.queryByText("acqFeeTitle")).toBeNull();
  });

  it("shows the disclosed fee, its basis, and an Accept button", async () => {
    fetchMyAcquisitionFeeAssessments.mockResolvedValue([
      { id: "assess-1", engagementId: "eng-1", status: "disclosed", feeAmount: 6, rate: 0.05, maxFee: 75 },
    ]);
    renderSheet(feeArgs);

    expect(await screen.findByText("acqFeeTitle")).toBeTruthy();
    expect(screen.getByText("€6")).toBeTruthy();
    expect(screen.getByText("acqFeeAcceptBtn")).toBeTruthy();
  });

  it("accepting the fee calls the API and switches to the accepted state", async () => {
    fetchMyAcquisitionFeeAssessments.mockResolvedValue([
      { id: "assess-1", engagementId: "eng-1", status: "disclosed", feeAmount: 6, rate: 0.05, maxFee: 75 },
    ]);
    renderSheet({ job: { engagementId: "eng-1", status: "booked" } });

    fireEvent.click(await screen.findByText("acqFeeAcceptBtn"));

    await waitFor(() => expect(acceptAcquisitionFeeDisclosure).toHaveBeenCalledWith("assess-1", "pro-1"));
    expect(await screen.findByText("acqFeeAcceptedNote")).toBeTruthy();
  });

  it("shows Confirm payment received only once accepted AND the job is completed", async () => {
    fetchMyAcquisitionFeeAssessments.mockResolvedValue([
      { id: "assess-1", engagementId: "eng-1", status: "accepted", feeAmount: 6, rate: 0.05, maxFee: 75 },
    ]);
    renderSheet({ job: { engagementId: "eng-1", status: "booked" } });
    await screen.findByText("acqFeeAcceptedNote");
    expect(screen.queryByText("acqFeeConfirmPaymentBtn")).toBeNull();
  });

  it("confirming payment invoices the fee and shows the invoiced note", async () => {
    fetchMyAcquisitionFeeAssessments.mockResolvedValue([
      { id: "assess-1", engagementId: "eng-1", status: "accepted", feeAmount: 6, rate: 0.05, maxFee: 75 },
    ]);
    renderSheet({ job: { engagementId: "eng-1", status: "completed" } });

    fireEvent.click(await screen.findByText("acqFeeConfirmPaymentBtn"));

    await waitFor(() => expect(confirmAcquisitionFeePaymentReceived).toHaveBeenCalledWith("assess-1", "pro-1"));
    expect(await screen.findByText("acqFeeInvoicedNote")).toBeTruthy();
  });

  it("shows a retry message when accepting the fee fails, without crashing", async () => {
    fetchMyAcquisitionFeeAssessments.mockResolvedValue([
      { id: "assess-1", engagementId: "eng-1", status: "disclosed", feeAmount: 6, rate: 0.05, maxFee: 75 },
    ]);
    acceptAcquisitionFeeDisclosure.mockRejectedValue(new Error("denied"));
    renderSheet(feeArgs);

    fireEvent.click(await screen.findByText("acqFeeAcceptBtn"));

    expect(await screen.findByText("acqFeeActionFailedMsg")).toBeTruthy();
  });
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

  // Found live during a UX review, 2026-09-06: two real documents both fell back to the
  // exact same bare type label ("Warranty", "Warranty"), genuinely indistinguishable —
  // api.my_documents() has always returned d.issuer (e.g. "Vaillant"), just never shown.
  it("appends the document's own issuer to its type label, when one is given", async () => {
    fetchPropertyTwin.mockResolvedValue({
      property: { id: "prop-1", name: "X" },
      locations: [], assets: [],
      documents: [{ id: "doc-1", type_key: "warranty", issuer: "Vaillant" }],
    });

    renderSheet();

    await waitFor(() => expect(screen.getByText("documentTypeWarranty — Vaillant")).toBeTruthy());
  });

  it("shows only the type label, unchanged, when a document has no issuer", async () => {
    fetchPropertyTwin.mockResolvedValue({
      property: { id: "prop-1", name: "X" },
      locations: [], assets: [],
      documents: [{ id: "doc-1", type_key: "warranty" }],
    });

    renderSheet();

    await waitFor(() => expect(screen.getByText("documentTypeWarranty")).toBeTruthy());
    expect(screen.queryByText(/—/)).toBeNull();
  });

  it("distinguishes two documents of the same type by their own issuer", async () => {
    fetchPropertyTwin.mockResolvedValue({
      property: { id: "prop-1", name: "X" },
      locations: [], assets: [],
      documents: [
        { id: "doc-1", type_key: "warranty", issuer: "Vaillant" },
        { id: "doc-2", type_key: "warranty", issuer: "Bosch" },
      ],
    });

    renderSheet();

    await waitFor(() => expect(screen.getByText("documentTypeWarranty — Vaillant")).toBeTruthy());
    expect(screen.getByText("documentTypeWarranty — Bosch")).toBeTruthy();
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

  // Found by code audit: fetchPropertyTwin() throws on a real Postgres error and the
  // effect had no catch of its own -- twinLoading stayed true forever, so this section
  // rendered nothing at all: no data, no error, not even a loading state.
  it("shows twinUnavailableMsg, never a permanently blank section, when the twin fetch fails", async () => {
    fetchPropertyTwin.mockRejectedValue(new Error("relation \"properties\" does not exist"));

    renderSheet();

    await waitFor(() => expect(screen.getByText("twinUnavailableMsg")).toBeTruthy());
    expect(screen.queryByText(/does not exist/)).toBeNull();
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

  // Found live during a UX review, 2026-09-07: this fell back to t.navMyJobs
  // ("Mijn klussen"/My Jobs, the bottom-nav label) rather than a real name placeholder —
  // never actually reachable before that same review's own fix to lib/messages.js
  // (customerName always came from otherName's own "Klussie user" literal, never
  // falsy), but would have shown a nonsensical "My Jobs" as the customer's own name the
  // moment that changed.
  it("falls back to the shared counterpart placeholder, not the My Jobs nav label, for a nameless customer", () => {
    renderSheet({ customerName: undefined });
    expect(screen.getByText("counterpartFallbackName")).toBeTruthy();
    expect(screen.queryByText("navMyJobs")).toBeNull();
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

// 2026-10-04 live review, item 6: after the customer shared the address and confirmed the
// booking, the professional's job detail still showed no street/number/postcode.
describe("ProJobDetailSheet — the address the customer shared", () => {
  const engaged = { engagementId: "eng-1" };

  it("shows street, number, postcode and municipality once the database returns them", async () => {
    fetchDisclosedLocation.mockResolvedValue({ street: "Teststraat", houseNumber: "1", postcode: "1000", municipality: "Brussel", quotePrepNotes: "Ring twice" });
    renderSheet({ job: engaged });
    await waitFor(() => expect(screen.getByText("Teststraat 1")).toBeTruthy());
    expect(screen.getByText("1000 Brussel")).toBeTruthy();
    expect(screen.getByText("Ring twice")).toBeTruthy();
    expect(fetchDisclosedLocation).toHaveBeenCalledWith("req-1");
  });

  it("says plainly that the address appears after the customer shares it, when nothing is disclosed yet", async () => {
    renderSheet({ job: engaged });
    await waitFor(() => expect(screen.getByText("jobAddressWaiting")).toBeTruthy());
  });

  it("never asks for or shows an address for a quote that has no engagement (privacy before acceptance)", () => {
    renderSheet({});
    expect(fetchDisclosedLocation).not.toHaveBeenCalled();
    expect(screen.queryByTestId("job-address")).toBeNull();
  });
});

describe("ProJobDetailSheet — the professional's own submitted quote message", () => {
  it("shows what the professional told the customer", () => {
    renderSheet({ job: { quotes: [{ id: "q-1", price: 1, message: "TEST only. No real work." }] } });
    expect(screen.getByTestId("my-quote-message").textContent).toBe('"TEST only. No real work."');
  });
  it("shows nothing for a quote with no message", () => {
    renderSheet({});
    expect(screen.queryByTestId("my-quote-message")).toBeNull();
  });
});

