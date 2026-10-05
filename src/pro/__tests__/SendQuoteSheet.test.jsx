// SendQuoteSheet.jsx's own tests — none existed before this.
//
// Found by code audit, 2026-09-11: the Send icon on the submit button never flipped for
// RTL locales, the same "leads forward" gap found and fixed the same pass for
// ConversationSheet.jsx/AiIntakeSheet.jsx's own Send icons — see appStyles.js's own
// .send-icon comment. This proves the class the CSS rule depends on is actually rendered.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../requests", () => ({
  JobDetailsSummary: () => null,
  AiAnalysisSummary: () => null,
  RequestPhotosStrip: () => null,
}));

import { LangContext } from "../../lib/lang";
import { SendQuoteSheet } from "../SendQuoteSheet.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = {
  t,
  serviceInfo: (id) => ({ name: `service:${id}` }),
  BASE_SERVICES: [{ id: "svc-1", base: 75 }],
};

const LEAD = { id: "lead-1", serviceId: "svc-1", answers: { fields: {}, aiAnalysis: null } };

function renderSheet(onSubmit = vi.fn()) {
  render(
    <LangContext.Provider value={ctx}>
      <SendQuoteSheet lead={LEAD} onClose={() => {}} onSubmit={onSubmit} />
    </LangContext.Provider>
  );
  return { onSubmit };
}

describe("SendQuoteSheet", () => {
  it("gives the submit icon the class its own RTL flip rule targets", () => {
    renderSheet();
    expect(document.querySelector(".send-icon")).toBeTruthy();
  });

  // UX redesign, 2026-09-28 — the acquisition-fee policy is disclosed here, before the
  // pro (or the customer, once they accept) commits to anything. Deliberately the
  // general policy text only, not a computed rate: no fee assessment row exists yet at
  // quote time (acquisitionFees.js's own header — an assessment is only ever created
  // once an engagement forms), so a specific figure here would be a guess.
  it("discloses the acquisition-fee policy before the quote can be sent", () => {
    renderSheet();
    expect(screen.getByText("acqFeeQuoteNote")).toBeTruthy();
  });

  // Found by code audit, 2026-09-11: unlike every other price field in this codebase
  // (QuoteFormSheet.jsx, ServiceRecordEditorSheet.jsx), this one had no `min="0"` and no
  // disabled-submit guard at all — a pro could send a zero, negative, or entirely
  // non-numeric quote straight into billing.js's own platformFee()/netPayout() math and
  // the customer's own invoice.
  describe("a real, positive price is required before Send Quote can be tapped", () => {
    // 2026-10-04 live review, item 19: a pre-filled price and message read as the
    // professional's own deliberate offer. Both now start empty; the typical price is only
    // a hint and the suggested message needs a tap.
    it("starts with NO price filled in — Send stays disabled until the professional types one", () => {
      renderSheet();
      expect(screen.getByText("sendQuoteSubmit").closest("button").disabled).toBe(true);
      expect(screen.getByPlaceholderText("75")).toBeTruthy();
      expect(screen.getByText("quotePriceHint")).toBeTruthy();
    });

    it("disables submit for a price of zero", () => {
      renderSheet();
      fireEvent.change(screen.getByPlaceholderText("75"), { target: { value: "0" } });
      expect(screen.getByText("sendQuoteSubmit").closest("button").disabled).toBe(true);
    });

    it("disables submit for a negative price", () => {
      renderSheet();
      fireEvent.change(screen.getByPlaceholderText("75"), { target: { value: "-50" } });
      expect(screen.getByText("sendQuoteSubmit").closest("button").disabled).toBe(true);
    });

    it("enables submit for a real positive price", () => {
      renderSheet();
      fireEvent.change(screen.getByPlaceholderText("75"), { target: { value: "90" } });
      expect(screen.getByText("sendQuoteSubmit").closest("button").disabled).toBe(false);
    });

    it("passes the real numeric price through on submit, never the raw string", () => {
      const { onSubmit } = renderSheet();
      fireEvent.change(screen.getByPlaceholderText("75"), { target: { value: "120.50" } });
      fireEvent.click(screen.getByText("sendQuoteSubmit"));
      expect(onSubmit).toHaveBeenCalledWith(120.5, "");
    });

    it("offers the suggested message as a one-tap action, never pre-filled", () => {
      const { onSubmit } = renderSheet();
      expect(screen.getByPlaceholderText("defaultProMessage").value).toBe("");
      fireEvent.click(screen.getByText("quoteUseSuggestion"));
      fireEvent.change(screen.getByPlaceholderText("75"), { target: { value: "80" } });
      fireEvent.click(screen.getByText("sendQuoteSubmit"));
      expect(onSubmit).toHaveBeenCalledWith(80, "defaultProMessage");
    });
  });

  // Found by code audit, 2026-09-11: unlike every other async submit button in this
  // codebase (AiIntakeSheet.jsx's own canSubmit already folds in !submitting;
  // RequestDetailSheet.jsx's accept/approve/complete buttons each disable on their own
  // local busy flag), this button stayed tappable the whole time a quote was in
  // flight — ProApp.jsx's sendQuote() only unmounts this sheet AFTER its own await
  // resolves. A fast double-tap fired onSubmit() twice, sending the same quote to the
  // same lead twice.
  describe("a submit in flight disables Send Quote, so a fast double-tap can't send the same quote twice", () => {
    it("disables the button and calls onSubmit only once for two rapid clicks", async () => {
      let resolveSubmit;
      const onSubmit = vi.fn(() => new Promise((resolve) => { resolveSubmit = resolve; }));
      renderSheet(onSubmit);
      fireEvent.change(screen.getByPlaceholderText("75"), { target: { value: "80" } });
      const button = screen.getByText("sendQuoteSubmit").closest("button");

      fireEvent.click(button);
      expect(button.disabled).toBe(true);
      fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledTimes(1);
      // Mirrors ProApp.jsx's own sendQuote(): a refusal is caught and toasted there, so
      // onSubmit's own promise always settles by resolving, whether the quote was sent
      // or refused — this is the same "in flight, then settled" path either way, and on
      // a refusal (this sheet staying mounted rather than the parent unmounting it on
      // success) the button re-enabling here is exactly what lets a real retry happen.
      resolveSubmit();
      await waitFor(() => expect(button.disabled).toBe(false));
    });
  });
});
