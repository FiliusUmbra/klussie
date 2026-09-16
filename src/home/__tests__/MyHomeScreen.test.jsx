// My Home's own bottom-nav destination (ADR-0033, 2026-09-15, supersedes ADR-0007/0008's
// "not a new tab"). Moved here from src/__tests__/homeSurface.test.jsx's old "My Home"/
// "My Items" describe blocks, which tested these as two of ConversationHome's three
// sections before this split — same assertions, same mocking boundary, now against
// MyHomeScreen directly with its own local 2-tab segmented control.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("../../lib/supabaseClient", () => ({ supabase: { from: vi.fn(), auth: {}, channel: vi.fn() } }));
vi.mock("../../lib/auth.jsx", () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({ profile: { id: "cust-1", full_name: "Cathy Customer", city: "Brussels" }, session: null }),
}));
vi.mock("../../lib/pros", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchPlatformTrustStats: vi.fn(),
}));
vi.mock("../../lib/householdItems", () => ({
  fetchHouseholdItems: vi.fn(() => Promise.resolve([])),
  createHouseholdItem: vi.fn(),
  updateHouseholdItem: vi.fn(),
  setHouseholdItemPhoto: vi.fn(),
  deleteHouseholdItem: vi.fn(),
}));

import { MyHomeScreen } from "../MyHomeScreen.jsx";
import { fetchHouseholdItems } from "../../lib/householdItems";
import { LangContext } from "../../lib/lang";
import { fetchPlatformTrustStats } from "../../lib/pros";

const TEMPLATES = {
  todayQuotesBody: "todayQuotesBody {service}",
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

function renderScreen({ requests = [], onOpenRequest = vi.fn(), onReportProblem = vi.fn() } = {}) {
  const utils = render(
    <LangContext.Provider value={ctx}>
      <MyHomeScreen requests={requests} onOpenRequest={onOpenRequest} onReportProblem={onReportProblem} />
    </LangContext.Provider>
  );
  return { onOpenRequest, onReportProblem, ...utils };
}

beforeEach(() => {
  vi.mocked(fetchPlatformTrustStats).mockResolvedValue({ verifiedProCount: 0, reviewCount: 0, ratingAvg: null });
  vi.mocked(fetchHouseholdItems).mockResolvedValue([]);
});

afterEach(() => { vi.clearAllMocks(); });

describe("MyHomeScreen — section tabs", () => {
  it("opens on My Home, with My Items not rendered at all", () => {
    renderScreen();
    const tablist = screen.getByRole("tablist");
    const [myHome, myItems] = within(tablist).getAllByRole("tab");

    expect(myHome.getAttribute("aria-selected")).toBe("true");
    expect(myItems.getAttribute("aria-selected")).toBe("false");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByText("myHomeQuestion")).toBeTruthy();
  });

  it("switches to My Items in place, without losing the surface around it", () => {
    renderScreen();
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");

    fireEvent.click(tabs[1]);
    expect(screen.getByText("myItemsQuestion")).toBeTruthy();
    expect(screen.queryByText("myHomeQuestion")).toBeNull();

    fireEvent.click(tabs[0]);
    expect(screen.getByText("myHomeQuestion")).toBeTruthy();
  });

  it("wires each tab to the panel it actually controls", () => {
    renderScreen();
    const tab = within(screen.getByRole("tablist")).getAllByRole("tab")[0];
    const panel = screen.getByRole("tabpanel");
    expect(tab.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(tab.id);
  });

  it("moves between the two tabs with the arrow keys", () => {
    renderScreen();
    const tablist = screen.getByRole("tablist");
    const tabs = within(tablist).getAllByRole("tab");

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    // Wraps rather than dead-ending on the last tab.
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
  });
});

describe("My Home", () => {
  const openMyItems = () => fireEvent.click(within(screen.getByRole("tablist")).getAllByRole("tab")[1]);
  const openMyHome = () => fireEvent.click(within(screen.getByRole("tablist")).getAllByRole("tab")[0]);

  it("leads with its question and a way back into the conversation", () => {
    renderScreen();
    expect(screen.getByText("myHomeQuestion")).toBeTruthy();
    expect(screen.getByText("homeReportProblem")).toBeTruthy();
  });

  it("sends 'report a problem' to the caller's own handler, which returns to the conversation", () => {
    const { onReportProblem } = renderScreen();
    fireEvent.click(screen.getByText("homeReportProblem").closest("button"));
    expect(onReportProblem).toHaveBeenCalled();
  });

  it("shows an invitation rather than a blank page for a home with no history", () => {
    // "Never show a blank page" — a brand-new account still gets something to read.
    renderScreen({ requests: [] });
    expect(screen.getByText("myHomeActiveEmpty")).toBeTruthy();
    expect(screen.getByText("myHomeHistoryEmpty")).toBeTruthy();
    expect(screen.getByText("myHomeProsEmpty")).toBeTruthy();
    expect(screen.getByText("myHomeReviewsEmpty")).toBeTruthy();
    expect(screen.getByText("myHomeAiEmpty")).toBeTruthy();
  });

  it("states each section's emptiness in its own words, not one repeated line", () => {
    renderScreen({ requests: [] });
    const empties = [...document.querySelectorAll(".home-group-empty")].map((n) => n.textContent);
    expect(new Set(empties).size).toBe(empties.length);
  });

  it("shows the property header from the customer's own profile", () => {
    renderScreen({ requests: [request({ status: "completed" })] });
    expect(screen.getByText("Brussels")).toBeTruthy();
  });

  it("builds the history from real completed requests", () => {
    const { onOpenRequest } = renderScreen({
      requests: [request({ id: "done", status: "completed" })],
    });
    expect(screen.queryByText("myHomeHistoryEmpty")).toBeNull();
    fireEvent.click(screen.getAllByText("name:svc-plumbing")[0].closest("button"));
    expect(onOpenRequest).toHaveBeenCalledWith("done");
  });

  it("separates work in progress from work that is finished", () => {
    renderScreen({
      requests: [
        request({ id: "running", status: "booked" }),
        request({ id: "done", status: "completed" }),
      ],
    });
    expect(screen.queryByText("myHomeActiveEmpty")).toBeNull();
    expect(screen.queryByText("myHomeHistoryEmpty")).toBeNull();
  });

  it("lists a professional only once the job they were booked for finished", () => {
    const withPro = (status) => request({
      id: "j", status, bookedProId: "peter",
      quotes: [{ id: "q", proId: "peter", price: 100, pro: { id: "peter", name: "Peter", initials: "P", avatarUrl: null } }],
    });

    const booked = renderScreen({ requests: [withPro("booked")] });
    expect(screen.getByText("myHomeProsEmpty")).toBeTruthy();
    booked.unmount();

    renderScreen({ requests: [withPro("completed")] });
    expect(screen.getByText("Peter")).toBeTruthy();
    expect(screen.getByText("myHomeOneJobTogether")).toBeTruthy();
  });

  it("shows a review the customer wrote, on the job it belongs to", () => {
    renderScreen({
      requests: [request({ id: "done", status: "reviewed", review: { stars: 5, text: "Excellent work" } })],
    });
    expect(screen.getAllByText('"Excellent work"').length).toBeGreaterThan(0);
    expect(screen.queryByText("myHomeReviewsEmpty")).toBeNull();
  });

  it("does not render an AI section for an analysis that says nothing", () => {
    renderScreen({
      requests: [request({ status: "completed", answers: { aiAnalysis: { confidence: 90 } } })],
    });
    expect(screen.getByText("myHomeAiEmpty")).toBeTruthy();
  });

  it("switches to My Items and back without losing state", () => {
    renderScreen({ requests: [request({ status: "completed" })] });
    openMyItems();
    expect(screen.getByText("myItemsQuestion")).toBeTruthy();
    openMyHome();
    expect(screen.getByText("Brussels")).toBeTruthy();
  });
});

describe("My Items", () => {
  const openMyItems = () => fireEvent.click(within(screen.getByRole("tablist")).getAllByRole("tab")[1]);

  const item = (over) => ({
    id: "i1", name: "Washing machine", category: "appliance", room: null,
    brand: null, model: null, photoPath: null, photoUrl: null,
    purchasedOn: null, notes: null, source: "manual", aiSuggestion: null,
    createdAt: 1000, updatedAt: 1000, ...over,
  });

  it("leads with its question and a way to add something", () => {
    renderScreen();
    openMyItems();
    expect(screen.getByText("myItemsQuestion")).toBeTruthy();
    expect(screen.getByText("itemAddTitle")).toBeTruthy();
  });

  it("invites a first item rather than showing empty category headings", async () => {
    renderScreen();
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
    renderScreen();
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
    renderScreen();
    openMyItems();
    await waitFor(() => expect(screen.getByText("Vaillant ecoTEC")).toBeTruthy());
    // No "Unknown brand" filler under the item that has none.
    expect(screen.getByText("Sofa").closest(".item-card").querySelector(".item-card-sub")).toBeNull();
  });

  it("opens the add wizard on its first, name-only-required step", async () => {
    renderScreen();
    openMyItems();
    await waitFor(() => expect(screen.getByText("myItemsEmptyTitle")).toBeTruthy());
    fireEvent.click(screen.getByText("itemAddTitle").closest("button"));

    expect(screen.getByText("itemNameLabel")).toBeTruthy();
    const next = screen.getByText("tourNext").closest("button");
    expect(next.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("itemNameLabel"), { target: { value: "Dishwasher" } });
    expect(next.disabled).toBe(false);
  });

  it("says so when the inventory could not be read, instead of looking empty", async () => {
    // An empty-looking list after a failed read would invite entering everything twice.
    vi.mocked(fetchHouseholdItems).mockRejectedValue(new Error("network down"));
    renderScreen();
    openMyItems();
    await waitFor(() => expect(screen.getByText("myItemsLoadFailed")).toBeTruthy());
    expect(screen.queryByText("myItemsEmptyTitle")).toBeNull();
  });
});
