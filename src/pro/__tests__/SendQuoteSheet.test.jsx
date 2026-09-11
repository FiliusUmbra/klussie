// SendQuoteSheet.jsx's own tests — none existed before this.
//
// Found by code audit, 2026-09-11: the Send icon on the submit button never flipped for
// RTL locales, the same "leads forward" gap found and fixed the same pass for
// ConversationSheet.jsx/AiIntakeSheet.jsx's own Send icons — see appStyles.js's own
// .send-icon comment. This proves the class the CSS rule depends on is actually rendered.
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

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

describe("SendQuoteSheet", () => {
  it("gives the submit icon the class its own RTL flip rule targets", () => {
    render(
      <LangContext.Provider value={ctx}>
        <SendQuoteSheet lead={LEAD} onClose={() => {}} onSubmit={() => {}} />
      </LangContext.Provider>
    );
    expect(document.querySelector(".send-icon")).toBeTruthy();
  });
});
