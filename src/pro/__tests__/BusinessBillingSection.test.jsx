// BusinessBillingSection.jsx's own tests. The Klussie Pro scenarios moved here verbatim
// (same scenarios, same assertions) from Profile.test.jsx's own "pro variant, Klussie Pro
// (Payments Slice B)" describe block — see BusinessApp.jsx's own header for why Billing
// moved out of Profile.jsx (Account) into Business. The flexi tracker describe block below
// is new (2026-09-29, UX_TAB_SCOPE.md P5 "financial reporting to Billing") — no dedicated
// test existed for it in Profile.test.jsx before.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const useAuthMock = vi.fn();

vi.mock("../../lib/auth.jsx", () => ({ useAuth: () => useAuthMock() }));
vi.mock("../../lib/klussiePro.js", () => ({
  fetchMyKlussieSubscription: vi.fn(() => Promise.resolve(null)),
  startKlussieProCheckout: vi.fn(),
  requestKlussieProCancellation: vi.fn(),
}));

import { LangContext } from "../../lib/lang";
import { BusinessBillingSection } from "../BusinessBillingSection.jsx";
import { fetchMyKlussieSubscription, startKlussieProCheckout, requestKlussieProCancellation } from "../../lib/klussiePro.js";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = { t, fmt: (n) => String(n), fmtDate: (d) => `date:${d}` };
const PRO_PROFILE = { pro_type: "flexi" };

function renderSection(overrides = {}) {
  useAuthMock.mockReturnValue({
    user: { id: "person-1" },
    proProfile: PRO_PROFILE,
    activeWorkspace: { workspace_id: "ws-pro" },
    ...overrides,
  });
  return render(
    <LangContext.Provider value={ctx}>
      <BusinessBillingSection earnedGross={overrides.earnedGross ?? 0} />
    </LangContext.Provider>
  );
}

describe("BusinessBillingSection — Klussie Pro (Payments Slice B)", () => {
  beforeEach(() => {
    fetchMyKlussieSubscription.mockReset();
    fetchMyKlussieSubscription.mockResolvedValue(null);
    startKlussieProCheckout.mockReset();
    requestKlussieProCancellation.mockReset();
    requestKlussieProCancellation.mockResolvedValue(undefined);
  });

  it("shows a Subscribe button when the workspace has never had a subscription", async () => {
    renderSection();
    await waitFor(() => expect(fetchMyKlussieSubscription).toHaveBeenCalledWith("ws-pro"));
    expect(screen.getByText("klussieProSubscribeBtn")).toBeTruthy();
    expect(screen.queryByText("klussieProActive")).toBeNull();
  });

  it("starts checkout for this workspace when Subscribe is clicked", async () => {
    startKlussieProCheckout.mockResolvedValue("https://checkout.stripe.com/session-1");
    renderSection();
    await waitFor(() => expect(screen.getByText("klussieProSubscribeBtn")).toBeTruthy());

    fireEvent.click(screen.getByText("klussieProSubscribeBtn"));

    await waitFor(() => expect(startKlussieProCheckout).toHaveBeenCalledWith("ws-pro"));
  });

  it("shows a real error, and re-enables the button, when checkout fails to start", async () => {
    startKlussieProCheckout.mockRejectedValue(new Error("KLUSSIE_PRO_CHECKOUT_FAILED"));
    renderSection();
    await waitFor(() => expect(screen.getByText("klussieProSubscribeBtn")).toBeTruthy());

    fireEvent.click(screen.getByText("klussieProSubscribeBtn"));

    await waitFor(() => expect(screen.getByText("klussieProCheckoutFailed")).toBeTruthy());
    expect(screen.getByText("klussieProSubscribeBtn").closest("button").disabled).toBe(false);
  });

  it("shows Active and a Cancel button for a real, un-cancelled subscription", async () => {
    fetchMyKlussieSubscription.mockResolvedValue({ id: "sub-1", planKey: "klussie_pro", status: "active", cancellationRequestedAt: null });
    renderSection();

    await waitFor(() => expect(screen.getByText("klussieProActive")).toBeTruthy());
    expect(screen.getByText("klussieProCancelBtn")).toBeTruthy();
    expect(screen.queryByText("klussieProSubscribeBtn")).toBeNull();
  });

  it("cancelling calls the real API with the subscription id, then re-shows the ends-on message once cancellation_requested_at is set", async () => {
    fetchMyKlussieSubscription
      .mockResolvedValueOnce({ id: "sub-1", planKey: "klussie_pro", status: "active", cancellationRequestedAt: null, currentPeriodEnd: null })
      .mockResolvedValueOnce({ id: "sub-1", planKey: "klussie_pro", status: "active", cancellationRequestedAt: "2026-10-01T00:00:00Z", currentPeriodEnd: "2026-11-01T00:00:00Z" });
    renderSection();
    await waitFor(() => expect(screen.getByText("klussieProCancelBtn")).toBeTruthy());

    fireEvent.click(screen.getByText("klussieProCancelBtn"));

    await waitFor(() => expect(requestKlussieProCancellation).toHaveBeenCalledWith("sub-1", "person-1"));
    await waitFor(() => expect(screen.getByText("klussieProEndsOn")).toBeTruthy());
    expect(screen.queryByText("klussieProCancelBtn")).toBeNull();
  });

  it("shows a real error when cancellation fails", async () => {
    fetchMyKlussieSubscription.mockResolvedValue({ id: "sub-1", planKey: "klussie_pro", status: "active", cancellationRequestedAt: null });
    requestKlussieProCancellation.mockRejectedValue(new Error("insufficient_privilege"));
    renderSection();
    await waitFor(() => expect(screen.getByText("klussieProCancelBtn")).toBeTruthy());

    fireEvent.click(screen.getByText("klussieProCancelBtn"));

    await waitFor(() => expect(screen.getByText("klussieProCancelFailed")).toBeTruthy());
    expect(screen.queryByText("payment required")).toBeNull();
  });

  it("shows the past_due warning and grace-period message instead of Active when a renewal has failed", async () => {
    fetchMyKlussieSubscription.mockResolvedValue({ id: "sub-1", planKey: "klussie_pro", status: "past_due", graceUntil: "2026-10-08T00:00:00Z" });
    renderSection();

    await waitFor(() => expect(screen.getByText("klussieProPastDue")).toBeTruthy());
    expect(screen.queryByText("klussieProActive")).toBeNull();
    expect(screen.queryByText("klussieProCancelBtn")).toBeNull();
  });
});

// UX_TAB_SCOPE.md P5, 2026-09-29 — moved here from Profile.jsx (Account) with one real
// fix: an explicit estimate/gross-net-basis/settlement-status caveat, since the number
// itself (earnedGross, threaded down from ProApp.jsx's own netEarnings()) is not a
// verified, period-scoped figure — see this file's own header for the full explanation.
describe("BusinessBillingSection — flexi tax-free tracker", () => {
  it("shows the tracker, with its honesty caveat, for a flexi-job pro", () => {
    renderSection({ earnedGross: 5000 });
    expect(screen.getByText("flexiTrackerTitle")).toBeTruthy();
    expect(screen.getByText("flexiEstimateNote")).toBeTruthy();
  });

  it("hides the tracker entirely for a registered-business pro", () => {
    renderSection({ proProfile: { pro_type: "business" }, earnedGross: 5000 });
    expect(screen.queryByText("flexiTrackerTitle")).toBeNull();
  });
});
