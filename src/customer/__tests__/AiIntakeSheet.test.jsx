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
import { analyzeJobRequest } from "../../lib/aiIntake";
import { Wrench, Zap } from "lucide-react";

const t = new Proxy({}, { get: (_, key) => String(key) });

const BASE_SERVICES = [
  { id: "svc-plumbing", cat: "repairs" },
  { id: "svc-electric", cat: "electrical" },
];
const CATS = [
  { id: "repairs", icon: Wrench },
  { id: "electrical", icon: Zap },
];
const CAT_NAMES = { repairs: "Loodgieterswerk", electrical: "Elektriciteit" };
const ctx = {
  t,
  langCode: "nl",
  BASE_SERVICES,
  CATS,
  catName: (id) => CAT_NAMES[id] ?? id,
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

// ADR-0033 (2026-09-15) — the category grid on the compose stage: a real, additional way
// to start a request, alongside the free-text/voice/photo composer, never instead of it.
function renderComposeSheet({ onSubmitted = vi.fn(), onClose = vi.fn(), initialCategoryId = null } = {}) {
  render(
    <LangContext.Provider value={ctx}>
      <AiIntakeSheet onClose={onClose} onSubmitted={onSubmitted} initialCategoryId={initialCategoryId} />
    </LangContext.Provider>
  );
  return { onSubmitted, onClose };
}

describe("AiIntakeSheet — category grid (ADR-0033)", () => {
  it("shows every real category as a tile, none selected to begin with", () => {
    renderComposeSheet();
    for (const name of Object.values(CAT_NAMES)) {
      expect(screen.getByText(name).closest("button").getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("lets exactly one category be selected, with a mis-tap undone by a second tap", () => {
    renderComposeSheet();
    const tile = screen.getByText("Loodgieterswerk").closest("button");

    fireEvent.click(tile);
    expect(tile.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(tile);
    expect(tile.getAttribute("aria-pressed")).toBe("false");
  });

  it("enables Analyze from a category alone, with no typed text or photo", () => {
    renderComposeSheet();
    const button = screen.getByText("aiAnalyzeBtn").closest("button");
    expect(button.disabled).toBe(true);

    fireEvent.click(screen.getByText("Loodgieterswerk"));
    expect(button.disabled).toBe(false);
  });

  // Home category row (ADR-0033) — a tile tapped on the Home screen arrives here
  // already selected, so the customer doesn't have to tap it twice.
  it("opens with the given initialCategoryId already selected", () => {
    renderComposeSheet({ initialCategoryId: "electrical" });
    expect(screen.getByText("Elektriciteit").closest("button").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Loodgieterswerk").closest("button").getAttribute("aria-pressed")).toBe("false");
    // Already usable without a second tap.
    expect(screen.getByText("aiAnalyzeBtn").closest("button").disabled).toBe(false);
  });

  it("opens with nothing selected when no initialCategoryId is given, matching the plain compose stage", () => {
    renderComposeSheet();
    for (const name of Object.values(CAT_NAMES)) {
      expect(screen.getByText(name).closest("button").getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("narrows the services the model sees to the selected category, and seeds its own translated name as the text", async () => {
    vi.mocked(analyzeJobRequest).mockResolvedValue({ matchedServiceId: "svc-plumbing", confidence: 90, followUpQuestions: [] });
    renderComposeSheet();

    fireEvent.click(screen.getByText("Loodgieterswerk"));
    fireEvent.click(screen.getByText("aiAnalyzeBtn"));

    await waitFor(() => expect(analyzeJobRequest).toHaveBeenCalled());
    // .at(-1), not [0] — this mock's call history is never reset between tests in this
    // file (matching its own established pattern), so an earlier test's call would
    // otherwise still sit at index 0.
    const call = vi.mocked(analyzeJobRequest).mock.calls.at(-1)[0];
    expect(call.text).toBe("Loodgieterswerk");
    expect(call.services).toEqual([{ id: "svc-plumbing", name: "name:svc-plumbing", category: "repairs", blurb: "blurb:svc-plumbing" }]);
  });

  it("prefers typed text over the category's own name once the customer describes it themselves", async () => {
    vi.mocked(analyzeJobRequest).mockResolvedValue({ matchedServiceId: "svc-plumbing", confidence: 90, followUpQuestions: [] });
    renderComposeSheet();

    fireEvent.click(screen.getByText("Loodgieterswerk"));
    fireEvent.change(screen.getByPlaceholderText("aiComposerPlaceholder"), { target: { value: "mijn kraan lekt" } });
    fireEvent.click(screen.getByText("aiAnalyzeBtn"));

    await waitFor(() => expect(analyzeJobRequest).toHaveBeenCalled());
    expect(vi.mocked(analyzeJobRequest).mock.calls.at(-1)[0].text).toBe("mijn kraan lekt");
  });

  it("still analyzes the full catalog when no category was chosen", async () => {
    vi.mocked(analyzeJobRequest).mockResolvedValue({ matchedServiceId: "svc-plumbing", confidence: 90, followUpQuestions: [] });
    renderComposeSheet();

    fireEvent.change(screen.getByPlaceholderText("aiComposerPlaceholder"), { target: { value: "mijn kraan lekt" } });
    fireEvent.click(screen.getByText("aiAnalyzeBtn"));

    await waitFor(() => expect(analyzeJobRequest).toHaveBeenCalled());
    expect(vi.mocked(analyzeJobRequest).mock.calls.at(-1)[0].services).toHaveLength(2);
  });
});

describe("AiIntakeSheet — step indicator (ADR-0033)", () => {
  it("marks step 1 (What) current on the compose stage", () => {
    renderComposeSheet();
    const [step1, step2] = document.querySelectorAll(".ai-step");
    expect(step1.className).toContain("ai-step-on");
    expect(step2.className).not.toContain("ai-step-on");
  });

  it("marks step 2 (Details) current once a result is already in hand", () => {
    renderSheet();
    const [step1, step2] = document.querySelectorAll(".ai-step");
    expect(step2.className).toContain("ai-step-on");
    expect(step1.className).not.toContain("ai-step-on");
  });
});
