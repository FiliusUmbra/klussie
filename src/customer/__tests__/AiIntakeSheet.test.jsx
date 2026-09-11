// AiIntakeSheet.jsx's own tests — none existed before this, despite the component's
// real complexity (compose/followup/review stages, voice, photos).
//
// Found by code audit: handleFinalSubmit() had no catch at all. onSubmitted (CustomerApp.jsx's
// createRequestFromAi -> createServiceRequest()) has no error handling anywhere in its
// own chain either, so a real refusal (any of the real ownership/consistency checks
// this codebase's own migrations added) rejected silently all the way up: the sheet sat
// there with a re-enabled button and no explanation at all, an unhandled rejection in
// the console and nothing on screen. Scoped narrowly to that regression, opened
// directly at the review stage (initialResult with no followUpQuestions) rather than
// exercising the whole compose/followup flow, which is out of scope for this fix.
import { describe, it, expect, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/aiIntake", () => ({
  analyzeJobRequest: vi.fn(),
  isSpeechRecognitionSupported: vi.fn(() => true),
  startSpeechRecognition: vi.fn(),
}));
vi.mock("../../lib/auth.jsx", () => ({
  useAuth: () => ({ user: { id: "cust-1" }, profile: { city: "Brussels" }, activeWorkspace: { workspace_id: "ws-1" } }),
}));
// Both fields are stubbed to call onChange with a fixed value once, on mount — this
// file is about handleFinalSubmit's own error handling, not either field's internals
// (each has its own test file). Calling onChange during render rather than in an effect
// would set state on every render and loop forever.
vi.mock("../ServiceLocationField.jsx", () => ({
  ServiceLocationField: ({ onChange }) => {
    useEffect(() => { onChange({ propertyId: "prop-1" }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
  },
}));
vi.mock("../ItemAssociationField.jsx", () => ({
  ItemAssociationField: () => null,
}));

import { LangContext } from "../../lib/lang";
import { AiIntakeSheet } from "../AiIntakeSheet.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });

const BASE_SERVICES = [{ id: "svc-plumbing", cat: "repairs" }];
const ctx = {
  t,
  langCode: "nl",
  BASE_SERVICES,
  serviceInfo: (id) => ({ name: `name:${id}`, blurb: `blurb:${id}` }),
  whenLabel: (w) => w,
};

const RESULT = {
  matchedServiceId: "svc-plumbing",
  description: "Leaking tap",
  confidence: 90,
  followUpQuestions: [],
};

function renderSheet({ onSubmitted = vi.fn(), onClose = vi.fn() } = {}) {
  render(
    <LangContext.Provider value={ctx}>
      <AiIntakeSheet onClose={onClose} onSubmitted={onSubmitted} initialResult={RESULT} />
    </LangContext.Provider>
  );
  return { onSubmitted, onClose };
}

describe("AiIntakeSheet — final submit", () => {
  it("opens directly at the review stage when handed a result with no follow-up questions", () => {
    renderSheet();
    expect(screen.getByText("aiReviewTitle")).toBeTruthy();
  });

  // Found by code audit, 2026-09-11: this Send icon never flipped for RTL locales,
  // unlike a chevron's own identical "leads forward" meaning — see appStyles.js's own
  // .send-icon comment. Proves the class the CSS rule depends on is actually rendered.
  it("gives the submit icon the class its own RTL flip rule targets", () => {
    renderSheet();
    expect(document.querySelector(".send-icon")).toBeTruthy();
  });

  it("submits and closes on success", async () => {
    const { onSubmitted, onClose } = renderSheet();

    fireEvent.click(screen.getByText("sendRequestBtn"));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a real error, keeps the sheet open, and re-enables the button — never an unhandled rejection with no feedback at all — when onSubmitted rejects", async () => {
    const onSubmitted = vi.fn(() => Promise.reject(new Error("insufficient_privilege")));
    const onClose = vi.fn();
    renderSheet({ onSubmitted, onClose });

    fireEvent.click(screen.getByText("sendRequestBtn"));

    await waitFor(() => expect(screen.getByText("aiGenericError")).toBeTruthy());
    expect(screen.queryByText("insufficient_privilege")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("sendRequestBtn").closest("button").disabled).toBe(false);
  });
});
