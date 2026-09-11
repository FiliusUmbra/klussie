// SendQuoteSheet.jsx's own tests — none existed before this.
//
// Found by code audit, 2026-09-11: the Send icon on the submit button never flipped for
// RTL locales, the same "leads forward" gap found and fixed the same pass for
// ConversationSheet.jsx/AiIntakeSheet.jsx's own Send icons — see appStyles.js's own
// .send-icon comment. This proves the class the CSS rule depends on is actually rendered.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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

  // Found by code audit, 2026-09-11: unlike every other price field in this codebase
  // (QuoteFormSheet.jsx, ServiceRecordEditorSheet.jsx), this one had no `min="0"` and no
  // disabled-submit guard at all — a pro could send a zero, negative, or entirely
  // non-numeric quote straight into billing.js's own platformFee()/netPayout() math and
  // the customer's own invoice.
  describe("a real, positive price is required before Send Quote can be tapped", () => {
    it("starts enabled with the catalog's own base price pre-filled", () => {
      renderSheet();
      expect(screen.getByText("sendQuoteSubmit").closest("button").disabled).toBe(false);
    });

    it("disables submit for a price of zero", () => {
      renderSheet();
      fireEvent.change(screen.getByDisplayValue("75"), { target: { value: "0" } });
      expect(screen.getByText("sendQuoteSubmit").closest("button").disabled).toBe(true);
    });

    it("disables submit for a negative price", () => {
      renderSheet();
      fireEvent.change(screen.getByDisplayValue("75"), { target: { value: "-50" } });
      expect(screen.getByText("sendQuoteSubmit").closest("button").disabled).toBe(true);
    });

    it("disables submit when the field is cleared entirely, rather than silently sending zero", () => {
      renderSheet();
      fireEvent.change(screen.getByDisplayValue("75"), { target: { value: "" } });
      expect(screen.getByText("sendQuoteSubmit").closest("button").disabled).toBe(true);
    });

    it("passes the real numeric price through on submit, never the raw string", () => {
      const { onSubmit } = renderSheet();
      fireEvent.change(screen.getByDisplayValue("75"), { target: { value: "120.50" } });
      fireEvent.click(screen.getByText("sendQuoteSubmit"));
      expect(onSubmit).toHaveBeenCalledWith(120.5, "defaultProMessage");
    });
  });
});
