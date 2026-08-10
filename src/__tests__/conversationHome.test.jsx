// Epic 03 WP12. The six states in EXPERIENCE_VISION.md §4 are ConversationHome's
// internal state, never navigation (§2's IA decision) — so there is no route to visit
// and no pure module to import. The transitions are only observable by driving the
// component, which is what this file does.
//
// Everything below the component is mocked: src/lib/supabaseClient.js throws at import
// without env vars, and the AI call, the pro lookup, and the trust stats are exactly the
// boundaries a test should control rather than reach across.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("../lib/supabaseClient", () => ({ supabase: { from: vi.fn(), auth: {}, channel: vi.fn() } }));
vi.mock("../lib/auth.jsx", () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({ profile: { full_name: "Cathy Customer", city: "Brussels" }, session: null }),
}));
vi.mock("../lib/pros", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchPlatformTrustStats: vi.fn(),
  findBestProForService: vi.fn(),
}));
vi.mock("../lib/aiIntake", () => ({
  analyzeJobRequest: vi.fn(),
  isSpeechRecognitionSupported: vi.fn(() => true),
  startSpeechRecognition: vi.fn(),
  startAudioLevelMeter: vi.fn(() => Promise.resolve({ stop: vi.fn() })),
}));
vi.mock("../lib/portfolio", () => ({
  fetchPortfolioItems: vi.fn(() => Promise.resolve([])),
  uploadPortfolioImage: vi.fn(),
  addPortfolioItem: vi.fn(),
  updatePortfolioCaption: vi.fn(),
  deletePortfolioItem: vi.fn(),
}));

import { ConversationHome } from "../App.jsx";
import { LangContext } from "../lib/lang";
import { fetchPlatformTrustStats, findBestProForService } from "../lib/pros";
import { analyzeJobRequest, isSpeechRecognitionSupported, startSpeechRecognition } from "../lib/aiIntake";
import { fetchPortfolioItems } from "../lib/portfolio";

// `t` returns each key as its own value, so assertions name the string key rather than a
// Dutch sentence — these tests are about which state renders, not about copy, and they
// shouldn't break when wording is revised.
const t = new Proxy({}, { get: (_, key) => String(key) });

const BASE_SERVICES = [
  { id: "svc-plumbing", cat: "repairs" },
  { id: "svc-electric", cat: "repairs", certifiedOnly: true },
];

const ctx = {
  t,
  dir: "ltr",
  fmt: (n) => String(n),
  fmtDate: (d) => String(d),
  catName: (c) => c,
  serviceInfo: (id) => ({ name: `name:${id}`, blurb: `blurb:${id}` }),
  proBadgeLabel: (tier) => (tier ? `badge:${tier}` : null),
  langCode: "nl",
  CATS: [],
  BASE_SERVICES,
  whenLabel: (w) => w,
};

function renderHome({ onStart = vi.fn() } = {}) {
  return {
    onStart,
    ...render(
      <LangContext.Provider value={ctx}>
        <ConversationHome onStart={onStart} />
      </LangContext.Provider>
    ),
  };
}

const analysis = {
  problem: "Supply-line leak",
  matchedServiceId: "svc-plumbing",
  urgency: "urgent",
  confidence: 91.4,
  estimatedBudget: { min: 120, max: 260 },
};

const pro = {
  id: "pro-1",
  name: "Peter Painter",
  initials: "PP",
  avatarUrl: null,
  rating: 4.6,
  reviews: 22,
  badgeTier: "top",
  isCertified: true,
};

// Types into the quiet text row and submits — the one entry point into the conversation
// that a jsdom test can drive end to end (voice needs a recognizer, photo needs a file
// picker and URL.createObjectURL).
async function startConversation(text = "my sink is leaking") {
  const input = screen.getByLabelText("convComposerLabel");
  fireEvent.change(input, { target: { value: text } });
  await act(async () => {
    input.closest("form").requestSubmit();
  });
}

beforeEach(() => {
  vi.mocked(fetchPlatformTrustStats).mockResolvedValue({ verifiedProCount: 0, reviewCount: 0, ratingAvg: null });
  vi.mocked(findBestProForService).mockResolvedValue(null);
  vi.mocked(fetchPortfolioItems).mockResolvedValue([]);
  vi.mocked(analyzeJobRequest).mockResolvedValue(analysis);
  vi.mocked(isSpeechRecognitionSupported).mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ConversationHome — rest state", () => {
  it("opens on the greeting, the two capture tiles, and the quiet text row", async () => {
    renderHome();

    expect(screen.getByText("convSpeakTitle")).toBeTruthy();
    expect(screen.getByText("convPhotoTitle")).toBeTruthy();
    expect(screen.getByLabelText("convComposerLabel")).toBeTruthy();
    // No conversation has started, so nothing has unfolded yet.
    expect(document.querySelector(".unfold")).toBeNull();
    await waitFor(() => expect(fetchPlatformTrustStats).toHaveBeenCalled());
  });

  it("greets a known customer by first name only", () => {
    renderHome();
    expect(screen.getByText("convWelcomeBack, Cathy.")).toBeTruthy();
  });

  it("disables the speak tile when the browser has no speech recognition", () => {
    vi.mocked(isSpeechRecognitionSupported).mockReturnValue(false);
    renderHome();

    const speak = screen.getByText("convSpeakTitle").closest("button");
    // Disabled with an explanation, rather than a tile that silently does nothing.
    expect(speak.disabled).toBe(true);
    expect(speak.getAttribute("title")).toBe("aiSpeechUnsupported");
  });
});

describe("ConversationHome — trust strip (ADR-0011)", () => {
  it("shows only transparent pricing when no platform data backs the other signals", async () => {
    renderHome();
    await waitFor(() => expect(screen.getByText("trustTransparentPricing")).toBeTruthy());

    // Verified-pro count is 0 and the rating is withheld, so neither may be claimed.
    expect(screen.queryByText("trustVerifiedPros")).toBeNull();
    expect(document.querySelectorAll(".trust-strip-item")).toHaveLength(1);
  });

  it("adds the signals that do have data behind them", async () => {
    vi.mocked(fetchPlatformTrustStats).mockResolvedValue({ verifiedProCount: 12, reviewCount: 340, ratingAvg: 4.72 });
    renderHome();

    await waitFor(() => expect(screen.getByText("trustVerifiedPros")).toBeTruthy());
    expect(screen.getByText("4.7★ trustAvgRating")).toBeTruthy();
  });

  it("drops the data-backed signals rather than breaking when the fetch fails", async () => {
    vi.mocked(fetchPlatformTrustStats).mockRejectedValue(new Error("offline"));
    renderHome();

    await waitFor(() => expect(screen.getByText("trustTransparentPricing")).toBeTruthy());
    expect(screen.queryByText("trustVerifiedPros")).toBeNull();
  });
});

describe("ConversationHome — rest → thinking → understanding", () => {
  it("replaces the tiles with the unfold as soon as the customer says something", async () => {
    let resolve;
    vi.mocked(analyzeJobRequest).mockReturnValue(new Promise((r) => { resolve = r; }));
    renderHome();
    await startConversation();

    // The canvas transformed; it did not navigate to a second screen.
    expect(screen.queryByText("convSpeakTitle")).toBeNull();
    expect(document.querySelector(".unfold")).not.toBeNull();
    // The customer's own words come back first, before any analysis exists.
    expect(screen.getByText("my sink is leaking")).toBeTruthy();
    expect(screen.getByText("aiAnalyzing")).toBeTruthy();

    await act(async () => { resolve(analysis); });
  });

  it("holds back the continue button while thinking, then offers it", async () => {
    let resolve;
    vi.mocked(analyzeJobRequest).mockReturnValue(new Promise((r) => { resolve = r; }));
    renderHome();
    await startConversation();

    // Continuing mid-analysis would throw away the result being waited on.
    expect(screen.queryByText("convContinue")).toBeNull();

    await act(async () => { resolve(analysis); });
    expect(screen.getByText("convContinue")).toBeTruthy();
  });

  it("reflects the problem back as structure, dropping the thinking state", async () => {
    renderHome();
    await startConversation();

    await waitFor(() => expect(screen.getByText("Supply-line leak · name:svc-plumbing · convUrgency_urgent")).toBeTruthy());
    expect(screen.queryByText("aiAnalyzing")).toBeNull();
    // Confidence is rounded for display rather than shown to a decimal.
    expect(screen.getByText(/91%/)).toBeTruthy();
  });

  it("omits the parts the model didn't return instead of printing empty separators", async () => {
    vi.mocked(analyzeJobRequest).mockResolvedValue({ problem: "Leaking tap", confidence: 60 });
    renderHome();
    await startConversation();

    await waitFor(() => expect(screen.getByText("Leaking tap")).toBeTruthy());
    // Scoped to the understanding line: AIMessage's own header separates its confidence
    // with the same character, and that one is always there.
    expect(document.querySelector(".conv-understanding-line").textContent).toBe("Leaking tap");
  });

  it("passes the job and the analysis onward, so the sheet never re-asks the model", async () => {
    const { onStart } = renderHome();
    await startConversation("radiator is cold");
    await waitFor(() => expect(screen.getByText("convContinue")).toBeTruthy());

    fireEvent.click(screen.getByText("convContinue"));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ text: "radiator is cold", result: analysis }));
  });
});

describe("ConversationHome — analysis failure", () => {
  it("stays continuable after a failed analysis rather than dead-ending", async () => {
    vi.mocked(analyzeJobRequest).mockRejectedValue(new Error("gateway down"));
    const { onStart } = renderHome();
    await startConversation("my sink is leaking");

    await waitFor(() => expect(screen.getByText("aiGenericError")).toBeTruthy());
    // The recap survives, and the way forward is still open — the sheet will analyze again.
    expect(screen.getByText("my sink is leaking")).toBeTruthy();
    fireEvent.click(screen.getByText("convContinue"));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ text: "my sink is leaking", result: null }));
  });

  it("looks for no professional when there is no analysis to match on", async () => {
    vi.mocked(analyzeJobRequest).mockRejectedValue(new Error("gateway down"));
    renderHome();
    await startConversation();

    await waitFor(() => expect(screen.getByText("aiGenericError")).toBeTruthy());
    expect(findBestProForService).not.toHaveBeenCalled();
  });
});

describe("ConversationHome — professional recommendation", () => {
  it("looks the professional up from the matched service, city, and certification rule", async () => {
    renderHome();
    await startConversation();

    await waitFor(() =>
      expect(findBestProForService).toHaveBeenCalledWith({
        serviceId: "svc-plumbing",
        city: "Brussels",
        certifiedOnly: false,
      })
    );
  });

  it("carries the service's certification requirement into the lookup", async () => {
    vi.mocked(analyzeJobRequest).mockResolvedValue({ ...analysis, matchedServiceId: "svc-electric" });
    renderHome();
    await startConversation();

    await waitFor(() =>
      expect(findBestProForService).toHaveBeenCalledWith(expect.objectContaining({ certifiedOnly: true }))
    );
  });

  it("unfolds one professional with their trust signals", async () => {
    vi.mocked(findBestProForService).mockResolvedValue(pro);
    renderHome();
    await startConversation();

    await waitFor(() => expect(screen.getByText("Peter Painter")).toBeTruthy());
    expect(screen.getByText("badge:top")).toBeTruthy();
    expect(document.querySelectorAll(".conv-pro")).toHaveLength(1);
  });

  it("shows the estimate as a range, never as a price", async () => {
    vi.mocked(findBestProForService).mockResolvedValue(pro);
    renderHome();
    await startConversation();

    await waitFor(() => expect(screen.getByText("Peter Painter")).toBeTruthy());
    const estimate = document.querySelector(".conv-pro-estimate");
    // Both ends of the range are present — a single figure would read as a quote, and no
    // quote exists at this point in the flow (Constitution Rule 9).
    expect(estimate.textContent).toContain("120");
    expect(estimate.textContent).toContain("260");
    expect(estimate.textContent).toContain("convEstimateLabel");
  });

  it("omits the estimate entirely when the model gave no budget", async () => {
    vi.mocked(analyzeJobRequest).mockResolvedValue({ ...analysis, estimatedBudget: null });
    vi.mocked(findBestProForService).mockResolvedValue(pro);
    renderHome();
    await startConversation();

    await waitFor(() => expect(screen.getByText("Peter Painter")).toBeTruthy());
    expect(document.querySelector(".conv-pro-estimate")).toBeNull();
  });

  it("says plainly that nobody offers this yet instead of hiding the outcome", async () => {
    vi.mocked(findBestProForService).mockResolvedValue(null);
    renderHome();
    await startConversation();

    await waitFor(() => expect(screen.getByText("convNoProYet")).toBeTruthy());
    expect(document.querySelector(".conv-pro")).toBeNull();
    // Still continuable: no pro today doesn't mean no request.
    expect(screen.getByText("convContinue")).toBeTruthy();
  });

  it("treats a failed lookup as no professional rather than leaving the slot pending", async () => {
    vi.mocked(findBestProForService).mockRejectedValue(new Error("denied"));
    renderHome();
    await startConversation();

    await waitFor(() => expect(screen.getByText("convNoProYet")).toBeTruthy());
  });

  it("fetches portfolio work only for the professional actually shown, capped at three", async () => {
    vi.mocked(findBestProForService).mockResolvedValue(pro);
    vi.mocked(fetchPortfolioItems).mockResolvedValue([
      { id: "w1", image_url: "https://example.test/1.jpg", caption: "Kitchen" },
      { id: "w2", image_url: "https://example.test/2.jpg", caption: "Bathroom" },
      { id: "w3", image_url: "https://example.test/3.jpg", caption: "Hallway" },
      { id: "w4", image_url: "https://example.test/4.jpg", caption: "Garage" },
    ]);
    renderHome();
    await startConversation();

    await waitFor(() => expect(document.querySelectorAll(".recent-work-thumb")).toHaveLength(3));
    expect(fetchPortfolioItems).toHaveBeenCalledTimes(1);
    expect(fetchPortfolioItems).toHaveBeenCalledWith("pro-1");
    // Rows arrive snake_case; the strip renders camelCase. A missed mapping here is what
    // shipped empty src attributes during WP8.
    expect(document.querySelector(".recent-work-thumb").getAttribute("src")).toBe("https://example.test/1.jpg");
  });

  it("still shows the professional when their portfolio fails to load", async () => {
    vi.mocked(findBestProForService).mockResolvedValue(pro);
    vi.mocked(fetchPortfolioItems).mockRejectedValue(new Error("storage down"));
    renderHome();
    await startConversation();

    await waitFor(() => expect(screen.getByText("Peter Painter")).toBeTruthy());
    expect(document.querySelector(".recent-work")).toBeNull();
  });

  it("does not look a professional up twice for one analysis", async () => {
    vi.mocked(findBestProForService).mockResolvedValue(pro);
    renderHome();
    await startConversation();

    await waitFor(() => expect(screen.getByText("Peter Painter")).toBeTruthy());
    // The effect re-runs as `conversation` changes; the `pro !== undefined` guard is what
    // stops each render from costing another query.
    expect(findBestProForService).toHaveBeenCalledTimes(1);
  });
});

describe("ConversationHome — voice capture", () => {
  // Lets a test play the recognizer. The Browser pane blocks the microphone, so the
  // successful voice path (transcript accumulating, then becoming a conversation) has no
  // other way to be exercised — this was flagged as unverifiable back in WP3.
  function captureRecognizer() {
    const stop = vi.fn();
    let handlers;
    vi.mocked(startSpeechRecognition).mockImplementation((locale, h) => {
      handlers = h;
      return { stop };
    });
    return { get handlers() { return handlers; }, stop };
  }

  it("swaps the tiles for the listening panel and starts the recognizer in the UI language", async () => {
    const recognizer = captureRecognizer();
    renderHome();

    await act(async () => { screen.getByText("convSpeakTitle").closest("button").click(); });

    expect(document.querySelector(".voice-capture")).not.toBeNull();
    expect(screen.queryByText("convPhotoTitle")).toBeNull();
    expect(startSpeechRecognition).toHaveBeenCalledWith(expect.any(String), expect.any(Object));
    expect(recognizer.handlers).toBeDefined();
  });

  it("builds the transcript from final and interim results as they arrive", async () => {
    const recognizer = captureRecognizer();
    renderHome();
    await act(async () => { screen.getByText("convSpeakTitle").closest("button").click(); });

    await act(async () => { recognizer.handlers.onResult({ finalText: "my sink", interimText: "is lea" }); });
    expect(screen.getByText("my sink is lea")).toBeTruthy();

    // A second final result appends rather than replacing — losing the first half of a
    // sentence is the failure mode the accumulating ref exists to prevent.
    await act(async () => { recognizer.handlers.onResult({ finalText: "is leaking", interimText: "" }); });
    expect(screen.getByText("my sink is leaking")).toBeTruthy();
  });

  it("turns a finished transcript into a conversation, analysis and all", async () => {
    const recognizer = captureRecognizer();
    renderHome();
    await act(async () => { screen.getByText("convSpeakTitle").closest("button").click(); });
    await act(async () => { recognizer.handlers.onResult({ finalText: "my sink is leaking", interimText: "" }); });

    // Stopping releases the recognizer rather than leaving the mic open.
    await act(async () => { document.querySelector(".voice-stop").click(); });
    expect(recognizer.stop).toHaveBeenCalled();

    await act(async () => { screen.getByText("convContinue").click(); });
    await waitFor(() => expect(analyzeJobRequest).toHaveBeenCalledWith(expect.objectContaining({ text: "my sink is leaking" })));
    // The spoken words become the recap — the canvas reflects back what was said.
    expect(screen.getByText("my sink is leaking")).toBeTruthy();
  });

  it("returns to rest when recognition ends with nothing said", async () => {
    const recognizer = captureRecognizer();
    renderHome();
    await act(async () => { screen.getByText("convSpeakTitle").closest("button").click(); });

    await act(async () => { recognizer.handlers.onEnd(); });

    // No transcript means nothing to confirm; the tiles come back rather than stranding
    // the customer on an empty "Got it."
    expect(screen.getByText("convSpeakTitle")).toBeTruthy();
    expect(document.querySelector(".voice-capture")).toBeNull();
    expect(analyzeJobRequest).not.toHaveBeenCalled();
  });

  it("returns to rest when the recognizer errors out", async () => {
    const recognizer = captureRecognizer();
    renderHome();
    await act(async () => { screen.getByText("convSpeakTitle").closest("button").click(); });

    await act(async () => { recognizer.handlers.onError({ error: "not-allowed" }); });
    expect(screen.getByText("convSpeakTitle")).toBeTruthy();
  });

  it("returns to rest rather than crashing when the recognizer won't start at all", async () => {
    vi.mocked(startSpeechRecognition).mockImplementation(() => { throw new Error("no recognizer"); });
    renderHome();

    await act(async () => { screen.getByText("convSpeakTitle").closest("button").click(); });
    expect(screen.getByText("convSpeakTitle")).toBeTruthy();
  });
});

describe("ConversationHome — photo capture", () => {
  const file = new File(["x"], "boiler.jpg", { type: "image/jpeg" });

  async function pickPhoto() {
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => { fireEvent.change(input); });
  }

  beforeEach(() => {
    // jsdom implements neither; the capture session's whole URL lifetime runs through them.
    URL.createObjectURL = vi.fn(() => "blob:test-preview");
    URL.revokeObjectURL = vi.fn();
  });

  it("shows the photo with the model's reading tagged on it", async () => {
    vi.mocked(analyzeJobRequest).mockResolvedValue({ ...analysis, brandDetected: "Bosch", confidence: 94.2 });
    renderHome();
    await pickPhoto();

    await waitFor(() => expect(screen.getByText("Bosch · 94%")).toBeTruthy());
    expect(document.querySelector(".photo-capture-img").getAttribute("src")).toBe("blob:test-preview");
  });

  it("asks the model about the photo exactly once across capture and conversation", async () => {
    vi.mocked(analyzeJobRequest).mockResolvedValue({ ...analysis, brandDetected: "Bosch" });
    renderHome();
    await pickPhoto();

    await waitFor(() => expect(screen.getByText(/Bosch/)).toBeTruthy());
    await act(async () => { document.querySelector(".photo-capture-confirm").click(); });

    await waitFor(() => expect(document.querySelector(".conv-understanding-line")).not.toBeNull());
    // The confirm hands the existing analysis forward; re-analysing the same photo would
    // be a second paid call for an answer already in hand.
    expect(analyzeJobRequest).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("aiAnalyzing")).toBeNull();
  });

  it("keeps the preview alive through the handoff instead of revoking it", async () => {
    renderHome();
    await pickPhoto();
    await waitFor(() => expect(document.querySelector(".photo-capture-confirm").disabled).toBe(false));

    await act(async () => { document.querySelector(".photo-capture-confirm").click(); });
    // Ownership transfers to the conversation, which still renders that exact URL.
    // Revoking here is what left the preview pointing at a dead blob during WP4.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("releases the preview when the photo is discarded", async () => {
    renderHome();
    await pickPhoto();
    await waitFor(() => expect(document.querySelector(".photo-capture-retake")).not.toBeNull());

    await act(async () => { document.querySelector(".photo-capture-retake").click(); });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-preview");
    expect(screen.getByText("convSpeakTitle")).toBeTruthy();
  });

  it("still lets the customer continue when the photo analysis fails", async () => {
    vi.mocked(analyzeJobRequest).mockRejectedValue(new Error("vision down"));
    renderHome();
    await pickPhoto();

    await waitFor(() => expect(document.querySelector(".photo-capture-confirm").disabled).toBe(false));
    // No tag rather than an invented one, and the way forward stays open.
    expect(document.querySelector(".photo-capture-tag")).toBeNull();
  });
});

describe("ConversationHome — composer guards", () => {
  it("does not start a conversation on an empty or whitespace-only draft", async () => {
    renderHome();
    const input = screen.getByLabelText("convComposerLabel");

    fireEvent.change(input, { target: { value: "   " } });
    await act(async () => { input.closest("form").requestSubmit(); });

    expect(analyzeJobRequest).not.toHaveBeenCalled();
    expect(document.querySelector(".unfold")).toBeNull();
  });

  it("sends the job to the model with the catalog it must choose a service from", async () => {
    renderHome();
    await startConversation("boiler making noise");

    await waitFor(() => expect(analyzeJobRequest).toHaveBeenCalled());
    expect(analyzeJobRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "boiler making noise",
        locale: "nl",
        services: [
          { id: "svc-plumbing", name: "name:svc-plumbing", category: "repairs", blurb: "blurb:svc-plumbing" },
          { id: "svc-electric", name: "name:svc-electric", category: "repairs", blurb: "blurb:svc-electric" },
        ],
      })
    );
  });
});
