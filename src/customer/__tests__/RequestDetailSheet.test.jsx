// Platform Activation Slice 2 — closes the customer-side mirror of the same fragmentation
// gap ProJobDetailSheet.jsx just closed for the pro: RequestDetailSheet had no way to
// message the booked pro without leaving to the separate, disconnected Messages tab.
// Narrowly scoped to the new onMessage behaviour — this component has no prior test file,
// and building full coverage of every status branch is a separate undertaking.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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
// Beta-completion slice (0182/0183) — the mandatory disclosure-consent card. Quote
// acceptance alone no longer books the job; this is the one screen that gets the customer
// from "accepted" to actually sharing their address with the pro they picked.
describe("RequestDetailSheet — disclosure-consent card (0182/0183)", () => {
  const PENDING_DISCLOSURE_REQUEST = { ...BOOKED_REQUEST, status: "accepted_pending_location_approval" };

  it("renders the consent card with the booked pro's name and price, not the ordinary booked ticket", () => {
    renderSheet({ request: PENDING_DISCLOSURE_REQUEST });
    expect(screen.getByText("Pierre Pro")).toBeTruthy();
    expect(screen.getByText("disclosureConsentApproveBtn")).toBeTruthy();
    // The booked-state markCompleteBtn must not also render for this status.
    expect(screen.queryByText("markCompleteBtn")).toBeNull();
  });

  it("calls onApproveDisclosure when the customer confirms", async () => {
    const onApproveDisclosure = vi.fn(() => Promise.resolve());
    renderSheet({ request: PENDING_DISCLOSURE_REQUEST, onApproveDisclosure });

    fireEvent.click(screen.getByText("disclosureConsentApproveBtn"));

    expect(onApproveDisclosure).toHaveBeenCalledTimes(1);
    await screen.findByText("disclosureConsentApproveBtn"); // settles back after the promise resolves
  });

  it("does not render the card, or a booked ticket, before a quote is actually accepted", () => {
    renderSheet({ request: { ...PENDING_DISCLOSURE_REQUEST, bookedProId: null, quotes: [] } });
    expect(screen.queryByText("disclosureConsentApproveBtn")).toBeNull();
  });

  // Found by code audit: none of these three buttons had a busy state, and this one
  // had no catch either — a rejected onApproveDisclosure used to leave `approving` set
  // forever were it not for the try/finally already in place; what was actually missing
  // is that the rejection itself was never caught anywhere, an unhandled rejection this
  // test would otherwise fail the whole run on.
  it("re-enables the button rather than leaving it stuck, and never throws unhandled, when onApproveDisclosure is refused", async () => {
    const onApproveDisclosure = vi.fn(() => Promise.reject(new Error("engagement not found")));
    renderSheet({ request: PENDING_DISCLOSURE_REQUEST, onApproveDisclosure });

    fireEvent.click(screen.getByText("disclosureConsentApproveBtn"));

    await waitFor(() => expect(screen.getByText("disclosureConsentApproveBtn").closest("button").disabled).toBe(false));
  });

  // Found by code audit, 2026-09-11: this used to be
  // `t.disclosureConsentBody.replace("{name}", ...)` — String.replace's own string-
  // pattern overload only substitutes the FIRST occurrence, unlike interpolate()
  // (already imported/used elsewhere in this file). No shipped locale currently repeats
  // {name} in this one string, so the bug never actually showed — this pins the real
  // contract (every occurrence gets substituted) rather than relying on today's
  // translations happening not to trigger it.
  it("substitutes every occurrence of {name} in disclosureConsentBody, not just the first", () => {
    const localT = new Proxy({}, {
      get: (_, key) => (key === "disclosureConsentBody" ? "Tot nu toe kende {name} enkel je gemeente. Bedank {name} straks!" : String(key)),
    });
    const localCtx = { ...ctx, t: localT };
    render(
      <LangContext.Provider value={localCtx}>
        <RequestDetailSheet request={PENDING_DISCLOSURE_REQUEST} onClose={vi.fn()} onApproveDisclosure={vi.fn()} />
      </LangContext.Provider>
    );
    expect(screen.getByText("Tot nu toe kende Pierre Pro enkel je gemeente. Bedank Pierre Pro straks!")).toBeTruthy();
    expect(screen.queryByText(/\{name\}/)).toBeNull();
  });
});

// Found by code audit: onAccept and onComplete had no busy state, no await and no catch
// at all at this sheet's own call sites — a double-tap could fire either twice, and a
// real refusal left the button sitting there re-clickable with nothing telling the
// customer anything had gone wrong (the real toast now comes from CustomerApp.jsx's own
// acceptQuote()/markComplete(), which this sheet's own catch here only needs to not
// re-throw as a second unhandled rejection).
describe("RequestDetailSheet — accepting a quote / marking complete, busy state and failure", () => {
  const QUOTES_READY_REQUEST = { ...BOOKED_REQUEST, status: "quotes_ready", bookedProId: null };

  it("disables accept while one is in flight, and calls onAccept with the right quote id", async () => {
    let resolveAccept;
    const onAccept = vi.fn(() => new Promise((resolve) => { resolveAccept = resolve; }));
    renderSheet({ request: QUOTES_READY_REQUEST, onAccept });

    fireEvent.click(screen.getByText("acceptQuoteBtn"));
    expect(onAccept).toHaveBeenCalledWith("q-1");
    expect(screen.getByText("acceptQuoteBtn").closest("button").disabled).toBe(true);

    resolveAccept();
    await waitFor(() => expect(screen.getByText("acceptQuoteBtn").closest("button").disabled).toBe(false));
  });

  it("re-enables accept rather than leaving it stuck, and never throws unhandled, when onAccept is refused", async () => {
    const onAccept = vi.fn(() => Promise.reject(new Error("quote no longer open")));
    renderSheet({ request: QUOTES_READY_REQUEST, onAccept });

    fireEvent.click(screen.getByText("acceptQuoteBtn"));

    await waitFor(() => expect(screen.getByText("acceptQuoteBtn").closest("button").disabled).toBe(false));
  });

  it("disables mark-complete while in flight, and re-enables it on success", async () => {
    let resolveComplete;
    const onComplete = vi.fn(() => new Promise((resolve) => { resolveComplete = resolve; }));
    renderSheet({ request: BOOKED_REQUEST, onComplete });

    fireEvent.click(screen.getByText("markCompleteBtn"));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByText("markCompleteBtn").closest("button").disabled).toBe(true);

    resolveComplete();
    await waitFor(() => expect(screen.getByText("markCompleteBtn").closest("button").disabled).toBe(false));
  });

  it("re-enables mark-complete rather than leaving it stuck, and never throws unhandled, when onComplete is refused", async () => {
    const onComplete = vi.fn(() => Promise.reject(new Error("engagement not found")));
    renderSheet({ request: BOOKED_REQUEST, onComplete });

    fireEvent.click(screen.getByText("markCompleteBtn"));

    await waitFor(() => expect(screen.getByText("markCompleteBtn").closest("button").disabled).toBe(false));
  });
});

// Found live during a UX review, 2026-09-07: `cancelled` had no branch at all here —
// timelineSteps() already returns null for it correctly, but nothing filled the gap
// that left, so a cancelled request's detail sheet showed nothing past the title and
// subtitle. See requestStatus.test.js's own new case for the matching badge-label gap
// (statusPresentation had no `cancelled` entry either) this same review found and closed.
describe("RequestDetailSheet — cancelled request", () => {
  const CANCELLED_REQUEST = { ...BOOKED_REQUEST, status: "cancelled", bookedProId: null, quotes: [] };

  it("shows a real explanation instead of an empty sheet", () => {
    renderSheet({ request: CANCELLED_REQUEST });
    expect(screen.getByText("requestCancelledMsg")).toBeTruthy();
  });

  it("renders none of the other status branches for it", () => {
    renderSheet({ request: CANCELLED_REQUEST });
    expect(screen.queryByText("waitingMsg")).toBeNull();
    expect(screen.queryByText("markCompleteBtn")).toBeNull();
    expect(screen.queryByText("disclosureConsentApproveBtn")).toBeNull();
  });
});

// Found by code audit, 2026-09-11: Rating's own aria-label was a hardcoded English
// template string here (and in every other real call site in the app) — see
// primitives.jsx's own header. Proves this specific call site now routes the real value
// through t.ratingLabel/interpolate() rather than building the old literal itself — a
// real ratingLabel template (not the shared Proxy's own key-echo) is what makes the
// interpolated result actually observable here.
describe("RequestDetailSheet — reviewed request's own rating has a real, translated label", () => {
  const REVIEWED_REQUEST = {
    ...BOOKED_REQUEST, status: "reviewed", review: { stars: 5, text: "Great work!" },
  };

  it("interpolates the real star count into the real locale key, not a hardcoded English string", () => {
    // Deliberately not "{value} out of 5 stars" -- that's also the old, buggy hardcoded
    // fallback's own literal output for value=5, so an English template here would pass
    // whether or not this call site actually routes through t.ratingLabel at all. A
    // template that reads nothing like the hardcoded string is what makes this a real
    // test of the wiring, not a coincidence.
    const localT = new Proxy({}, { get: (_, key) => (key === "ratingLabel" ? "{value} van de 5 sterren" : String(key)) });
    const localCtx = { ...ctx, t: localT };
    render(
      <LangContext.Provider value={localCtx}>
        <RequestDetailSheet request={REVIEWED_REQUEST} onClose={vi.fn()} onAccept={vi.fn()} onComplete={vi.fn()} onReview={vi.fn()} />
      </LangContext.Provider>
    );
    expect(screen.getByRole("img", { name: "5 van de 5 sterren" })).toBeTruthy();
    // This status also mounts ServiceRecordSummary, which self-fetches -- the suite below
    // (WP 3.2) has its own, order-sensitive "not called at all yet" assertion for other
    // statuses, and this file resets no mock between tests. Cleared here so this test's
    // own real call to fetchServiceRecordForRequestMock doesn't leak into that one.
    fetchServiceRecordForRequestMock.mockClear();
  });
});

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
