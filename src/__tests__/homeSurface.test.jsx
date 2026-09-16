// The conversational homepage: hero, intent-first asking, and the "today" card.
//
// My Home and My Items moved to their own bottom-nav destination (MyHomeScreen.jsx,
// ADR-0033) — their own tests live in src/home/__tests__/MyHomeScreen.test.jsx now.
// Same mocking boundary as conversationHome.test.jsx — the AI call, pro lookup and trust
// stats are exactly the edges a test should control rather than reach across.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";

vi.mock("../lib/supabaseClient", () => ({ supabase: { from: vi.fn(), auth: {}, channel: vi.fn() } }));
vi.mock("../lib/auth.jsx", () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({ profile: { id: "cust-1", full_name: "Cathy Customer", city: "Brussels" }, session: null }),
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
vi.mock("../lib/requests", async (importOriginal) => ({
  ...(await importOriginal()),
  createDirectedRequest: vi.fn(),
}));
vi.mock("../lib/requestPhotos", () => ({
  uploadRequestPhoto: vi.fn(() => Promise.resolve()),
  fetchRequestPhotos: vi.fn(() => Promise.resolve([])),
}));
vi.mock("../lib/portfolio", () => ({
  fetchPortfolioItems: vi.fn(() => Promise.resolve([])),
  uploadPortfolioImage: vi.fn(),
  addPortfolioItem: vi.fn(),
  updatePortfolioCaption: vi.fn(),
  deletePortfolioItem: vi.fn(),
}));
vi.mock("../lib/householdItems", () => ({
  fetchHouseholdItems: vi.fn(() => Promise.resolve([])),
  createHouseholdItem: vi.fn(),
  updateHouseholdItem: vi.fn(),
  setHouseholdItemPhoto: vi.fn(),
  deleteHouseholdItem: vi.fn(),
}));

import { ConversationHome } from "../home/ConversationHome.jsx";
import { LangContext } from "../lib/lang";
import { fetchPlatformTrustStats, findBestProForService } from "../lib/pros";
import { analyzeJobRequest } from "../lib/aiIntake";
import { HOME_CSS } from "../home/homeStyles.js";

const TEMPLATES = {
  homeGreetName: "{greeting}, {name}",
  homeGreetNoName: "{greeting}",
  followUpProgress: "step {n}/{total}",
  todayQuotesBody: "todayQuotesBody {service}",
  todayLocationApprovalBody: "todayLocationApprovalBody {service}",
  todayBookedBody: "todayBookedBody {service}",
  todayAwaitingBody: "todayAwaitingBody {service}",
  todayCollectingBody: "todayCollectingBody {service}",
  todayReviewBody: "todayReviewBody {service}",
  convBookCta: "convBookCta {name}",
  convReliefSub: "convReliefSub {name}",
};
const t = new Proxy({}, { get: (_, key) => TEMPLATES[key] ?? String(key) });

const ctx = {
  t,
  dir: "ltr",
  fmt: (n) => String(n),
  fmtDate: (d) => `date:${d}`,
  catName: (c) => c,
  serviceInfo: (id) => ({ name: `name:${id}`, blurb: `blurb:${id}` }),
  proBadgeLabel: () => null,
  langCode: "nl",
  CATS: [],
  BASE_SERVICES: [{ id: "svc-plumbing", cat: "repairs" }],
  whenLabel: (w) => w,
};

const request = (over) => ({
  id: "r1", serviceId: "svc-plumbing", status: "collecting", quotes: [], review: null, createdAt: 1000, ...over,
});

function renderHome({ requests = [], onStart = vi.fn(), onOpenRequest = vi.fn(), onOpenMyHome = vi.fn() } = {}) {
  const utils = render(
    <LangContext.Provider value={ctx}>
      <ConversationHome onStart={onStart} requests={requests} onOpenRequest={onOpenRequest} onOpenMyHome={onOpenMyHome} />
    </LangContext.Provider>
  );
  return { onStart, onOpenRequest, onOpenMyHome, ...utils };
}

const composer = () => screen.getByLabelText("convComposerLabel");
const answerBox = () => screen.getByLabelText("homeAnswerLabel");

async function type(input, value) {
  fireEvent.change(input, { target: { value } });
  await act(async () => { input.closest("form").requestSubmit(); });
}

beforeEach(() => {
  vi.mocked(fetchPlatformTrustStats).mockResolvedValue({ verifiedProCount: 0, reviewCount: 0, ratingAvg: null });
  vi.mocked(findBestProForService).mockResolvedValue(null);
  vi.mocked(analyzeJobRequest).mockResolvedValue({ problem: "leak", confidence: 80 });
});

afterEach(() => { vi.clearAllMocks(); });

describe("ConversationHome — a single conversational canvas, no section tabs", () => {
  // ADR-0033 (2026-09-15) moved My Home/My Items to their own bottom-nav destination —
  // this surface is the conversational canvas alone now, so there is no tablist here at
  // all any more.
  it("renders no tablist — the section tabs moved to MyHomeScreen", async () => {
    renderHome();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("intentBroken")).toBeTruthy();
    expect(screen.getByLabelText("convComposerLabel")).toBeTruthy();
    await waitFor(() => expect(fetchPlatformTrustStats).toHaveBeenCalled());
  });
});

describe("intent before input method", () => {
  it("offers all five conversation starters, none selected to begin with", () => {
    renderHome();
    for (const key of ["intentBroken", "intentImprove", "intentMaintain", "intentAdvice", "intentOther"]) {
      expect(screen.getByText(key).closest("button").getAttribute("aria-pressed")).toBe("false");
    }
  });

  it.each([
    ["intentBroken", "fuBrokenWhat"],
    ["intentImprove", "fuImproveWhat"],
    ["intentMaintain", "fuMaintainWhat"],
    ["intentAdvice", "fuAdviceAbout"],
  ])("opens %s on its own first question", (label, firstQuestion) => {
    renderHome();
    fireEvent.click(screen.getByText(label));

    expect(screen.getByText(label).closest("button").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(firstQuestion)).toBeTruthy();
    // Position is stated, so the customer can see how much is left rather than guessing.
    expect(screen.getByText(/^step 1\/\d+$/)).toBeTruthy();
  });

  it("scripts nothing for 'something else', because that is the one that did not fit a script", () => {
    renderHome();
    fireEvent.click(screen.getByText("intentOther"));
    expect(screen.queryByText(/^fu/)).toBeNull();
    expect(composer()).toBeTruthy();
  });

  it("lets a mis-tap be undone with one more tap", () => {
    renderHome();
    fireEvent.click(screen.getByText("intentBroken"));
    fireEvent.click(screen.getByText("intentBroken"));
    expect(screen.getByText("intentBroken").closest("button").getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText("fuBrokenWhat")).toBeNull();
  });

  it("keeps text, voice and photo available as answer methods throughout", () => {
    renderHome();
    fireEvent.click(screen.getByText("intentBroken"));
    expect(answerBox()).toBeTruthy();
    expect(screen.getByLabelText("homeVoiceAction")).toBeTruthy();
    expect(screen.getByLabelText("homePhotoAction")).toBeTruthy();
    expect(screen.getByLabelText("homeSendAction")).toBeTruthy();
  });
});

describe("one question at a time", () => {
  it("advances to the next question and clears the box for it", async () => {
    renderHome();
    fireEvent.click(screen.getByText("intentBroken"));
    await type(answerBox(), "de boiler doet niets");

    expect(screen.getByText("fuBrokenWhere")).toBeTruthy();
    expect(screen.getByText("step 2/6")).toBeTruthy();
    expect(answerBox().value).toBe("");
    // Still gathering — nothing has gone to the model yet.
    expect(analyzeJobRequest).not.toHaveBeenCalled();
  });

  it("goes back and restores what was already answered", async () => {
    renderHome();
    fireEvent.click(screen.getByText("intentBroken"));
    await type(answerBox(), "de boiler doet niets");

    fireEvent.click(screen.getByText("followUpBack"));
    expect(screen.getByText("fuBrokenWhat")).toBeTruthy();
    expect(answerBox().value).toBe("de boiler doet niets");
  });

  it("has nothing to go back to on the first question", () => {
    renderHome();
    fireEvent.click(screen.getByText("intentBroken"));
    expect(screen.queryByText("followUpBack")).toBeNull();
  });

  it("sends what has been said so far when the customer skips the rest", async () => {
    renderHome();
    fireEvent.click(screen.getByText("intentBroken"));
    await type(answerBox(), "de boiler doet niets");

    await act(async () => { screen.getByText("followUpSkip").click(); });

    await waitFor(() => expect(analyzeJobRequest).toHaveBeenCalled());
    const sent = vi.mocked(analyzeJobRequest).mock.calls[0][0].text;
    // The intent and the question ride along, so a short answer still means something.
    expect(sent).toContain("intentBroken");
    expect(sent).toContain("fuBrokenWhat");
    expect(sent).toContain("de boiler doet niets");
  });

  it("will not skip with nothing said", () => {
    renderHome();
    fireEvent.click(screen.getByText("intentBroken"));
    expect(screen.getByText("followUpSkip").disabled).toBe(true);
  });

  it("starts the conversation once the last question is answered", async () => {
    renderHome();
    fireEvent.click(screen.getByText("intentAdvice"));
    for (const answer of ["kosten", "kosten", "geen foto", "alleen advies"]) {
      await type(answerBox(), answer);
    }
    await waitFor(() => expect(document.querySelector(".unfold")).not.toBeNull());
    expect(analyzeJobRequest).toHaveBeenCalledTimes(1);
  });

  it("still accepts a free-form message with no intent chosen at all", async () => {
    renderHome();
    await type(composer(), "mijn kraan lekt");
    await waitFor(() => expect(analyzeJobRequest).toHaveBeenCalledWith(expect.objectContaining({ text: "mijn kraan lekt" })));
  });
});

describe("safety interruption", () => {
  it("stops instead of continuing when the customer describes a hazard", async () => {
    renderHome();
    fireEvent.click(screen.getByText("intentBroken"));
    await type(answerBox(), "ik ruik gas in de keuken");

    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("safetyTitle")).toBeTruthy();
    // Nothing was sent, and the questioning did not quietly advance behind it.
    expect(analyzeJobRequest).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("homeAnswerLabel")).toBeNull();
  });

  it("says plainly that it is not a diagnosis", () => {
    renderHome();
    fireEvent.click(screen.getByText("intentBroken"));
    fireEvent.change(screen.getByLabelText("homeAnswerLabel"), { target: { value: "gaslek" } });
    fireEvent.submit(screen.getByLabelText("homeAnswerLabel").closest("form"));
    expect(screen.getByText("safetyBody")).toBeTruthy();
  });

  it("lets the customer go back and rephrase", async () => {
    renderHome();
    fireEvent.click(screen.getByText("intentBroken"));
    await type(answerBox(), "brand in de meterkast");

    fireEvent.click(screen.getByText("safetyBack"));
    expect(screen.getByLabelText("homeAnswerLabel")).toBeTruthy();
    expect(screen.queryByText("safetyTitle")).toBeNull();
  });

  it("lets the customer continue anyway, keeping the answer they gave", async () => {
    renderHome();
    fireEvent.click(screen.getByText("intentBroken"));
    await type(answerBox(), "brand in de meterkast");

    await act(async () => { screen.getByText("safetyContinue").click(); });
    // Their answer was kept and the sequence resumed at the next question.
    expect(screen.getByText("fuBrokenWhere")).toBeTruthy();
  });
});

describe("today for your home", () => {
  it("surfaces the decision that is blocking a job, with the service named", () => {
    renderHome({ requests: [request({ status: "quotes_ready", quotes: [{ id: "q" }] })] });
    expect(screen.getByText("todayQuotesTitle")).toBeTruthy();
    expect(screen.getByText("todayQuotesBody name:svc-plumbing")).toBeTruthy();
  });

  // Found by code audit: accepted_pending_location_approval (the mandatory
  // disclosure-consent step between accepting a quote and an actual booking) had no
  // entry in homeToday.js's PRIORITY at all -- a request stalled on the customer's own
  // next tap surfaced nothing here, even though it blocks the booking exactly as
  // completely as an unchosen quote does.
  it("surfaces a request awaiting location disclosure approval as Today's one thing, the same as an unchosen quote", () => {
    renderHome({ requests: [request({ status: "accepted_pending_location_approval" })] });
    expect(screen.getByText("todayLocationApprovalTitle")).toBeTruthy();
    expect(screen.getByText("todayLocationApprovalBody name:svc-plumbing")).toBeTruthy();
  });

  it("opens that request rather than describing it and stopping there", () => {
    const { onOpenRequest } = renderHome({ requests: [request({ status: "booked" })] });
    fireEvent.click(screen.getByText("todayBookedTitle").closest("button"));
    expect(onOpenRequest).toHaveBeenCalledWith("r1");
  });

  it("shows the honest onboarding state when the account has nothing pending", () => {
    renderHome({ requests: [] });
    expect(screen.getByText("todayEmptyTitle")).toBeTruthy();
    expect(screen.getByText("todayEmptyBody")).toBeTruthy();
    // No invented reminder took its place.
    expect(screen.queryByText("todayQuotesTitle")).toBeNull();
  });

  // ADR-0033 — My Home is a real bottom-nav destination now, so "set up my home first"
  // asks the parent (CustomerApp.jsx) to switch tabs, rather than an internal section.
  it("sends the onboarding CTA to My Home via onOpenMyHome, where the first step actually is", () => {
    const { onOpenMyHome } = renderHome({ requests: [] });
    fireEvent.click(screen.getByText("todayEmptyCta"));
    expect(onOpenMyHome).toHaveBeenCalled();
  });

  it("lists what else is running without repeating today's priority", () => {
    renderHome({
      requests: [
        request({ id: "top", status: "quotes_ready", quotes: [{ id: "q" }] }),
        request({ id: "other", status: "booked" }),
      ],
    });
    const active = document.querySelector(".home-active-list");
    expect(active.textContent).toContain("todayBookedTitle");
    expect(within(active).queryByText("todayQuotesTitle")).toBeNull();
  });

  it("survives requests with missing or unexpected shapes", () => {
    // Realtime can deliver a row mid-transition; the homepage must not blank out.
    renderHome({ requests: [{ id: "x", serviceId: "svc-plumbing", status: "weird", quotes: [], createdAt: 1 }] });
    expect(screen.getByText("todayEmptyTitle")).toBeTruthy();
  });
});

// ADR-0033 (2026-09-15) — before this entry point existed, AiIntakeSheet's own compose
// stage (the category grid) was only ever reachable pre-seeded with a result
// useConversation.js's own onStart call already ran an analysis for — never fresh. This
// is the real, live path onto it.
describe("browse categories entry point (ADR-0033)", () => {
  it("calls onStart with no seed, so AiIntakeSheet opens fresh at its own compose stage", () => {
    const { onStart } = renderHome();
    fireEvent.click(screen.getByText("homeBrowseCategoriesBtn"));
    expect(onStart).toHaveBeenCalledWith();
  });

  it("hides while a follow-up question is already running, the same way the intent tiles do", () => {
    renderHome();
    fireEvent.click(screen.getByText("intentBroken"));
    expect(screen.queryByText("homeBrowseCategoriesBtn")).toBeNull();
  });

  it("is hidden during the safety interruption too", async () => {
    renderHome();
    fireEvent.click(screen.getByText("intentBroken"));
    await type(answerBox(), "ik ruik gas in de keuken");
    expect(screen.queryByText("homeBrowseCategoriesBtn")).toBeNull();
  });
});

describe("hero", () => {
  it("reserves its box and treats the image as decoration", () => {
    renderHome();
    const img = document.querySelector(".home-hero-img");
    expect(img.getAttribute("alt")).toBe("");
    expect(document.querySelector(".home-hero-media").getAttribute("aria-hidden")).toBe("true");
    // The scrim is what makes the white text over it legible; it is not optional.
    expect(document.querySelector(".home-hero-scrim")).not.toBeNull();
  });

  it("falls back to a surface rather than a broken image", () => {
    renderHome();
    fireEvent.error(document.querySelector(".home-hero-img"));
    expect(document.querySelector(".home-hero-img")).toBeNull();
    expect(document.querySelector(".home-hero-media-fallback")).not.toBeNull();
    // The question is still readable, which is the only thing that actually matters.
    expect(document.querySelector(".home-hero-question").textContent).toBe("homeQuestion");
  });
});

describe("motion", () => {
  it("gives every animated homepage element a reduced-motion path", () => {
    const blocks = HOME_CSS.match(/@media \(prefers-reduced-motion: reduce\)\{[^}]*\{[^}]*\}[^}]*\}/g) || [];
    const reduced = blocks.join(" ");
    for (const selector of [".seg-tab", ".intent-tile", ".today-card", ".conv-textrow-tool"]) {
      expect(reduced, selector).toContain(selector);
    }
  });
});
