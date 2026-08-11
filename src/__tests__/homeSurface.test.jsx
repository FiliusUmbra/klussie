// The homepage as a whole: hero, section tabs, intent-first asking, the "today" card,
// and the two Property Memory panels.
//
// Same mocking boundary as conversationHome.test.jsx — supabaseClient throws at import
// without env vars, and the AI call, pro lookup and trust stats are exactly the edges a
// test should control rather than reach across.
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
import { fetchHouseholdItems } from "../lib/householdItems";
import { LangContext } from "../lib/lang";
import { fetchPlatformTrustStats, findBestProForService } from "../lib/pros";
import { analyzeJobRequest } from "../lib/aiIntake";
import { HOME_CSS } from "../home/homeStyles.js";

const TEMPLATES = {
  homeGreetName: "{greeting}, {name}",
  homeGreetNoName: "{greeting}",
  followUpProgress: "step {n}/{total}",
  todayQuotesBody: "todayQuotesBody {service}",
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

function renderHome({ requests = [], onStart = vi.fn(), onOpenRequest = vi.fn() } = {}) {
  const utils = render(
    <LangContext.Provider value={ctx}>
      <ConversationHome onStart={onStart} requests={requests} onOpenRequest={onOpenRequest} />
    </LangContext.Provider>
  );
  return { onStart, onOpenRequest, ...utils };
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
  // Reset explicitly: afterEach's clearAllMocks clears recorded calls but keeps any
  // implementation a test installed, which would leak one test's inventory into the next.
  vi.mocked(fetchHouseholdItems).mockResolvedValue([]);
});

afterEach(() => { vi.clearAllMocks(); });

describe("homepage sections", () => {
  it("opens on Klussie, with the other two sections not rendered at all", async () => {
    renderHome();
    const tablist = screen.getByRole("tablist");
    const [klussie, myHome, myItems] = within(tablist).getAllByRole("tab");

    expect(klussie.getAttribute("aria-selected")).toBe("true");
    expect(myHome.getAttribute("aria-selected")).toBe("false");
    expect(myItems.getAttribute("aria-selected")).toBe("false");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.queryByText("myHomeQuestion")).toBeNull();
    await waitFor(() => expect(fetchPlatformTrustStats).toHaveBeenCalled());
  });

  it("switches to each section in place, without losing the page around it", () => {
    renderHome();
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");

    fireEvent.click(tabs[1]);
    expect(screen.getByText("myHomeQuestion")).toBeTruthy();
    // The hero and the trust strip are the surface, not the section — they stay put.
    expect(document.querySelector(".home-hero-question")).not.toBeNull();
    expect(screen.getByText("trustTransparentPricing")).toBeTruthy();

    fireEvent.click(tabs[2]);
    expect(screen.getByText("myItemsQuestion")).toBeTruthy();
    expect(screen.queryByText("myHomeQuestion")).toBeNull();

    fireEvent.click(tabs[0]);
    expect(screen.getByText("intentBroken")).toBeTruthy();
  });

  it("wires each tab to the panel it actually controls", () => {
    renderHome();
    const tab = within(screen.getByRole("tablist")).getAllByRole("tab")[0];
    const panel = screen.getByRole("tabpanel");
    expect(tab.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(tab.id);
  });

  it("moves between sections with the arrow keys and Home/End", () => {
    renderHome();
    const tablist = screen.getByRole("tablist");
    const tabs = within(tablist).getAllByRole("tab");

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tablist, { key: "End" });
    expect(tabs[2].getAttribute("aria-selected")).toBe("true");
    // Wraps rather than dead-ending on the last tab.
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(tabs[2].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tablist, { key: "Home" });
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
  });

  it("keeps exactly one tab in the page's tab order (roving tabindex)", () => {
    renderHome();
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");
    expect(tabs.map((tb) => tb.tabIndex)).toEqual([0, -1, -1]);
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

  it("sends the onboarding CTA to My Home, where the first step actually is", () => {
    renderHome({ requests: [] });
    fireEvent.click(screen.getByText("todayEmptyCta"));
    expect(screen.getByText("myHomeQuestion")).toBeTruthy();
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

describe("My Home", () => {
  const openMyHome = () => fireEvent.click(within(screen.getByRole("tablist")).getAllByRole("tab")[1]);

  it("leads with its question and a way back into the conversation", () => {
    renderHome();
    openMyHome();
    expect(screen.getByText("myHomeQuestion")).toBeTruthy();
    expect(screen.getByText("homeReportProblem")).toBeTruthy();
  });

  it("sends 'report a problem' back to the conversation, which is where things start", () => {
    renderHome();
    openMyHome();
    fireEvent.click(screen.getByText("homeReportProblem").closest("button"));
    expect(screen.getByText("intentBroken")).toBeTruthy();
  });

  it("shows an invitation rather than a blank page for a home with no history", () => {
    // "Never show a blank page" — a brand-new account still gets something to read.
    renderHome({ requests: [] });
    openMyHome();
    expect(screen.getByText("myHomeActiveEmpty")).toBeTruthy();
    expect(screen.getByText("myHomeHistoryEmpty")).toBeTruthy();
    expect(screen.getByText("myHomeProsEmpty")).toBeTruthy();
    expect(screen.getByText("myHomeReviewsEmpty")).toBeTruthy();
    expect(screen.getByText("myHomeAiEmpty")).toBeTruthy();
  });

  it("states each section's emptiness in its own words, not one repeated line", () => {
    // Five identical "nothing saved" lines tell a customer nothing about what would
    // fill them; that was the old placeholder's failure and is worth keeping fixed.
    renderHome({ requests: [] });
    openMyHome();
    const empties = [...document.querySelectorAll(".home-group-empty")].map((n) => n.textContent);
    expect(new Set(empties).size).toBe(empties.length);
  });

  it("shows the property header from the customer's own profile", () => {
    renderHome({ requests: [request({ status: "completed" })] });
    openMyHome();
    expect(screen.getByText("Brussels")).toBeTruthy();
  });

  it("builds the history from real completed requests", () => {
    const { onOpenRequest } = renderHome({
      requests: [request({ id: "done", status: "completed" })],
    });
    openMyHome();
    expect(screen.queryByText("myHomeHistoryEmpty")).toBeNull();
    fireEvent.click(screen.getAllByText("name:svc-plumbing")[0].closest("button"));
    expect(onOpenRequest).toHaveBeenCalledWith("done");
  });

  it("separates work in progress from work that is finished", () => {
    renderHome({
      requests: [
        request({ id: "running", status: "booked" }),
        request({ id: "done", status: "completed" }),
      ],
    });
    openMyHome();
    expect(screen.queryByText("myHomeActiveEmpty")).toBeNull();
    expect(screen.queryByText("myHomeHistoryEmpty")).toBeNull();
  });

  it("lists a professional only once the job they were booked for finished", () => {
    const withPro = (status) => request({
      id: "j", status, bookedProId: "peter",
      quotes: [{ id: "q", proId: "peter", price: 100, pro: { id: "peter", name: "Peter", initials: "P", avatarUrl: null } }],
    });

    const booked = renderHome({ requests: [withPro("booked")] });
    openMyHome();
    expect(screen.getByText("myHomeProsEmpty")).toBeTruthy();
    booked.unmount();

    renderHome({ requests: [withPro("completed")] });
    openMyHome();
    expect(screen.getByText("Peter")).toBeTruthy();
    expect(screen.getByText("myHomeOneJobTogether")).toBeTruthy();
  });

  it("shows a review the customer wrote, on the job it belongs to", () => {
    renderHome({
      requests: [request({ id: "done", status: "reviewed", review: { stars: 5, text: "Excellent work" } })],
    });
    openMyHome();
    expect(screen.getAllByText('"Excellent work"').length).toBeGreaterThan(0);
    expect(screen.queryByText("myHomeReviewsEmpty")).toBeNull();
  });

  it("does not render an AI section for an analysis that says nothing", () => {
    // A confidence score with no causes and no materials is a row that exists and tells
    // the customer nothing.
    renderHome({
      requests: [request({ status: "completed", answers: { aiAnalysis: { confidence: 90 } } })],
    });
    openMyHome();
    expect(screen.getByText("myHomeAiEmpty")).toBeTruthy();
  });
});

describe("My Items", () => {
  const openMyItems = () => fireEvent.click(within(screen.getByRole("tablist")).getAllByRole("tab")[2]);

  const item = (over) => ({
    id: "i1", name: "Washing machine", category: "appliance", room: null,
    brand: null, model: null, photoPath: null, photoUrl: null,
    purchasedOn: null, notes: null, source: "manual", aiSuggestion: null,
    createdAt: 1000, updatedAt: 1000, ...over,
  });

  it("leads with its question and a way to add something", () => {
    renderHome();
    openMyItems();
    expect(screen.getByText("myItemsQuestion")).toBeTruthy();
    expect(screen.getByText("itemAddTitle")).toBeTruthy();
  });

  it("invites a first item rather than showing empty category headings", async () => {
    renderHome();
    openMyItems();
    await waitFor(() => expect(screen.getByText("myItemsEmptyTitle")).toBeTruthy());
    expect(screen.getByText("myItemsEmptyHint")).toBeTruthy();
    // The old placeholder printed five headings with nothing under them.
    expect(screen.queryByText("itemCatAppliance")).toBeNull();
  });

  it("groups real items by category and counts them", async () => {
    vi.mocked(fetchHouseholdItems).mockResolvedValue([
      item({ id: "a", name: "Boiler", category: "appliance" }),
      item({ id: "b", name: "Drill", category: "tool" }),
    ]);
    renderHome();
    openMyItems();
    await waitFor(() => expect(screen.getByText("Boiler")).toBeTruthy());
    expect(screen.getByText("Drill")).toBeTruthy();
    expect(screen.getByText("itemCatAppliance")).toBeTruthy();
    expect(screen.getByText("itemCatTool")).toBeTruthy();
    // Categories the household owns nothing in stay off the page.
    expect(screen.queryByText("itemCatGarden")).toBeNull();
  });

  it("shows brand and model when known, and nothing in their place when not", async () => {
    vi.mocked(fetchHouseholdItems).mockResolvedValue([
      item({ id: "a", name: "Boiler", brand: "Vaillant", model: "ecoTEC" }),
      item({ id: "b", name: "Sofa", category: "furniture" }),
    ]);
    renderHome();
    openMyItems();
    await waitFor(() => expect(screen.getByText("Vaillant ecoTEC")).toBeTruthy());
    // No "Unknown brand" filler under the item that has none.
    expect(screen.getByText("Sofa").closest(".item-card").querySelector(".item-card-sub")).toBeNull();
  });

  it("opens the form to add an item, with only the name required", async () => {
    renderHome();
    openMyItems();
    await waitFor(() => expect(screen.getByText("myItemsEmptyTitle")).toBeTruthy());
    fireEvent.click(screen.getByText("itemAddTitle").closest("button"));

    const save = screen.getByText("itemSaveNew").closest("button");
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("itemNameLabel"), { target: { value: "Dishwasher" } });
    expect(save.disabled).toBe(false);
  });

  it("says so when the inventory could not be read, instead of looking empty", async () => {
    // An empty-looking list after a failed read would invite entering everything twice.
    vi.mocked(fetchHouseholdItems).mockRejectedValue(new Error("network down"));
    renderHome();
    openMyItems();
    await waitFor(() => expect(screen.getByText("myItemsLoadFailed")).toBeTruthy());
    expect(screen.queryByText("myItemsEmptyTitle")).toBeNull();
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
    for (const selector of [".seg-tab", ".intent-chip", ".today-card", ".conv-textrow-tool"]) {
      expect(reduced, selector).toContain(selector);
    }
  });
});
