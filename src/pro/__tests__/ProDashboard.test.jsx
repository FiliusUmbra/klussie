// ProDashboard.jsx's own tests. UX redesign, 2026-09-28/29 — the rating/review/trust stat
// row was removed (now lives only on Profile.jsx) and the always-on "New" badge became
// real per-browser "seen since last visit" tracking (useSeenLeadIds, localStorage-backed
// like langPreference.js). Pause/resume (2026-09-29, UX_TAB_SCOPE.md P5 "move availability
// to Today") moved here verbatim from Profile.test.jsx's own "pro variant, pause/resume"
// describe block — see this component's own header for why. No test file existed for this
// component before this session.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LangContext } from "../../lib/lang";
import { ProDashboard } from "../ProDashboard.jsx";
import { updateProProfile } from "../../lib/pros";

// PageTour.jsx / usePageTour.js have their own tests — held closed here so these stay on
// the dashboard's own concerns; the tour wiring is asserted separately below.
const tourState = vi.hoisted(() => ({ open: false, replay: vi.fn() }));
vi.mock("../../ui/usePageTour.js", () => ({ usePageTour: () => ({ open: tourState.open, finish: vi.fn(), replay: tourState.replay }) }));

vi.mock("../../lib/pros", () => ({ updateProProfile: vi.fn() }));

const t = new Proxy({}, { get: (_, key) => String(key) });

let proProfile = { paused: false, pro_type: "certified" };
let authUser = { id: "pro-1" };
let refreshProfile = vi.fn();

vi.mock("../../lib/auth.jsx", () => ({
  useAuth: () => ({ user: authUser, proProfile, refreshProfile }),
}));

const ctx = {
  t,
  serviceInfo: (id) => ({ name: `service:${id}`, blurb: "" }),
  whenLabel: (v) => `when:${v}`,
};

const LEAD = {
  id: "req-1",
  serviceId: "svc-1",
  answers: { when: "this_week", budget: null, details: "Leaking tap", city: "Ghent" },
};

function renderDashboard(leads = [LEAD], onQuote = vi.fn(), onPauseToggled = undefined) {
  return render(
    <LangContext.Provider value={ctx}>
      <ProDashboard leads={leads} onQuote={onQuote} proInfo={{ name: "Pierre" }} onPauseToggled={onPauseToggled} />
    </LangContext.Provider>
  );
}

beforeEach(() => {
  localStorage.clear();
  proProfile = { paused: false, pro_type: "certified" };
  authUser = { id: "pro-1" };
  refreshProfile = vi.fn();
  vi.mocked(updateProProfile).mockReset();
});

describe("ProDashboard", () => {
  it("does not render a rating/review/trust stat row — that now lives on Profile.jsx only", () => {
    renderDashboard();
    expect(screen.queryByText(/topRated|elitePro|reviewCount/)).toBeNull();
  });

  it("shows the empty state when there are no leads", () => {
    renderDashboard([]);
    expect(screen.getByText("noLeadsMsg")).toBeTruthy();
  });

  it("shows a paused banner, with a real Resume action, when the pro is paused", () => {
    proProfile = { paused: true, pro_type: "certified" };
    renderDashboard();
    expect(screen.getByText("pausedBannerTitle")).toBeTruthy();
    expect(screen.getByText("resumeProfileBtn")).toBeTruthy();
  });

  it("shows a Pause action, not a banner, when the pro is not paused", () => {
    renderDashboard();
    expect(screen.getByText("pauseProfileBtn")).toBeTruthy();
    expect(screen.queryByText("pausedBannerTitle")).toBeNull();
  });

  it("calls onQuote with the lead when its quote button is clicked", () => {
    const onQuote = vi.fn();
    renderDashboard([LEAD], onQuote);
    fireEvent.click(screen.getByText("sendQuoteBtn"));
    expect(onQuote).toHaveBeenCalledWith(LEAD);
  });

  it("shows the flexi hidden-leads notice only for a flexi-job pro", () => {
    proProfile = { paused: false, pro_type: "flexi" };
    renderDashboard();
    expect(screen.getByText("flexiHiddenNote")).toBeTruthy();
  });

  it("hides the flexi hidden-leads notice for a non-flexi pro", () => {
    renderDashboard();
    expect(screen.queryByText("flexiHiddenNote")).toBeNull();
  });

  // Found by code audit, 2026-09-11 (Profile.jsx, moved here 2026-09-29): refreshProfile()
  // and onPauseToggled() both used to sit inside the same try as updateProProfile() itself.
  // togglePaused() is a TOGGLE, not an idempotent write — a pro who saw a false
  // togglePausedFailed and, believing their first tap never took effect, tapped Pause/Resume
  // again would flip the real, already-applied change straight back, silently leaving them
  // un-paused (still receiving new leads) while believing the opposite.
  describe("pause/resume", () => {
    it("re-enables the button and shows a real error when the toggle fails", async () => {
      vi.mocked(updateProProfile).mockRejectedValueOnce(new Error("network error"));
      renderDashboard();

      fireEvent.click(screen.getByText("pauseProfileBtn"));

      await waitFor(() => expect(screen.getByText("togglePausedFailed")).toBeTruthy());
      expect(screen.queryByText("network error")).toBeNull();
      expect(screen.getByText("pauseProfileBtn").closest("button").disabled).toBe(false);
    });

    it("shows no error and calls onPauseToggled on success", async () => {
      vi.mocked(updateProProfile).mockResolvedValueOnce(undefined);
      const onPauseToggled = vi.fn();
      renderDashboard([LEAD], vi.fn(), onPauseToggled);

      fireEvent.click(screen.getByText("pauseProfileBtn"));

      await waitFor(() => expect(updateProProfile).toHaveBeenCalledWith("pro-1", { paused: true }));
      await waitFor(() => expect(onPauseToggled).toHaveBeenCalled());
      expect(screen.queryByText("togglePausedFailed")).toBeNull();
    });

    it("re-enables the button with no error when the toggle succeeds but the post-toggle refreshProfile() fails", async () => {
      vi.mocked(updateProProfile).mockResolvedValueOnce(undefined);
      refreshProfile = vi.fn(() => Promise.reject(new Error("network blip refreshing the profile")));
      renderDashboard();

      fireEvent.click(screen.getByText("pauseProfileBtn"));

      await waitFor(() => expect(updateProProfile).toHaveBeenCalledWith("pro-1", { paused: true }));
      await waitFor(() => expect(screen.getByText("pauseProfileBtn").closest("button").disabled).toBe(false));
      expect(screen.queryByText("togglePausedFailed")).toBeNull();
    });

    it("re-enables the button with no error when the toggle succeeds but onPauseToggled() itself fails", async () => {
      vi.mocked(updateProProfile).mockResolvedValueOnce(undefined);
      const onPauseToggled = vi.fn(() => Promise.reject(new Error("network blip refreshing the lead list")));
      renderDashboard([LEAD], vi.fn(), onPauseToggled);

      fireEvent.click(screen.getByText("pauseProfileBtn"));

      await waitFor(() => expect(updateProProfile).toHaveBeenCalledWith("pro-1", { paused: true }));
      await waitFor(() => expect(screen.getByText("pauseProfileBtn").closest("button").disabled).toBe(false));
      expect(screen.queryByText("togglePausedFailed")).toBeNull();
    });
  });

  describe("useSeenLeadIds — real per-browser 'seen since last visit' tracking", () => {
    it("badges a lead as new the first time this browser has ever seen it", () => {
      renderDashboard([LEAD]);
      expect(screen.getByText("newBadge")).toBeTruthy();
    });

    it("does not badge a lead already recorded as seen from a previous visit", () => {
      localStorage.setItem("klussie.seenLeadIds.pro-1", JSON.stringify(["req-1"]));
      renderDashboard([LEAD]);
      expect(screen.queryByText("newBadge")).toBeNull();
    });

    it("records the currently-shown leads so a later visit no longer treats them as new", () => {
      renderDashboard([LEAD]);
      expect(JSON.parse(localStorage.getItem("klussie.seenLeadIds.pro-1"))).toEqual(["req-1"]);
    });

    it("still shows the badge when localStorage throws (private browsing) rather than crashing", () => {
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = () => { throw new Error("blocked"); };
      try {
        expect(() => renderDashboard([LEAD])).not.toThrow();
        expect(screen.getByText("newBadge")).toBeTruthy();
      } finally {
        Storage.prototype.getItem = original;
      }
    });
  });
});

describe("ProDashboard visual reform + tour wiring", () => {
  it("greets the pro by first name with a time-of-day greeting", () => {
    renderDashboard();
    expect(screen.getByText(/^(greetMorning|greetAfternoon|greetEvening)$|homeGreetName/)).toBeTruthy();
  });
  it("anchors the tour on the availability control and the lead list, and offers a replay", () => {
    renderDashboard();
    expect(document.querySelector('[data-tour="pro-pause"]')).toBeTruthy();
    expect(document.querySelector('[data-tour="pro-leads"]')).toBeTruthy();
    fireEvent.click(screen.getByLabelText("helpReplayTour"));
    expect(tourState.replay).toHaveBeenCalled();
  });
  it("anchors the same tour step on the paused card when the profile is paused", () => {
    proProfile = { paused: true, pro_type: "certified" };
    renderDashboard();
    expect(document.querySelector('[data-tour="pro-pause"]')).toBeTruthy();
  });
  it("marks a budget that is only Klussie's estimate with a leading ≈, so it never reads as the customer's own figure", () => {
    const est = { ...LEAD, id: "req-est", answers: { ...LEAD.answers, budget: "180", aiAnalysis: { budgetIsEstimate: true } } };
    const real = { ...LEAD, id: "req-real", answers: { ...LEAD.answers, budget: "250", aiAnalysis: { budgetIsEstimate: false } } };
    renderDashboard([est, real]);
    expect(screen.getByText(/≈€180/)).toBeTruthy();
    expect(screen.queryByText(/≈€250/)).toBeNull();
    expect(screen.getByText(/·\s*€250/)).toBeTruthy();
  });
});
