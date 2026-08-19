// The first-login tour: shown once, dismissible from every step, replayable from
// Help, and operable entirely from the keyboard.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

const authState = { user: { id: "u1" }, profile: null, updateProfile: vi.fn() };
vi.mock("../lib/supabaseClient", () => ({ supabase: { from: vi.fn(), auth: {}, channel: vi.fn() } }));
vi.mock("../lib/auth.jsx", () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => authState,
}));

import { CustomerOnboarding } from "../home/CustomerOnboarding.jsx";
import { useHomeTour } from "../home/useHomeTour.js";
import { HOME_STRINGS } from "../lib/homeStrings.js";

const t = new Proxy({}, {
  get: (_, key) => (key === "tourProgress" ? "tourProgress {n}/{total}" : String(key)),
});

const next = () => screen.getByText("tourNext");

beforeEach(() => {
  window.localStorage.clear();
  authState.user = { id: "u1" };
  // Created after the tour shipped: the tour is for new accounts only.
  authState.profile = { onboarding_role_selected: true, created_at: "2026-08-12T10:00:00Z" };
  authState.updateProfile = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => { vi.clearAllMocks(); });

describe("CustomerOnboarding — the four steps", () => {
  it("walks the four steps the brief specifies, in order", () => {
    render(<CustomerOnboarding t={t} onFinish={vi.fn()} />);

    expect(screen.getByText("tourStep1Title")).toBeTruthy();
    expect(screen.getByText("tourProgress 1/4")).toBeTruthy();
    fireEvent.click(next());
    expect(screen.getByText("tourStep2Title")).toBeTruthy();
    fireEvent.click(next());
    expect(screen.getByText("tourStep3Title")).toBeTruthy();
    fireEvent.click(next());
    expect(screen.getByText("tourStep4Title")).toBeTruthy();
    expect(screen.getByText("tourProgress 4/4")).toBeTruthy();
    // Four steps, never five.
    expect(screen.queryByText("tourNext")).toBeNull();
  });

  it("can go back without losing its place", () => {
    render(<CustomerOnboarding t={t} onFinish={vi.fn()} />);
    fireEvent.click(next());
    fireEvent.click(screen.getByText("tourBack"));
    expect(screen.getByText("tourStep1Title")).toBeTruthy();
  });

  it("offers both final actions on the last step", () => {
    const onFinish = vi.fn();
    render(<CustomerOnboarding t={t} onFinish={onFinish} />);
    fireEvent.click(next()); fireEvent.click(next()); fireEvent.click(next());

    fireEvent.click(screen.getByText("tourSetupHomeCta"));
    expect(onFinish).toHaveBeenCalledWith({ destination: "myHome" });
  });

  it("starts the customer on Klussie when they choose that instead", () => {
    const onFinish = vi.fn();
    render(<CustomerOnboarding t={t} onFinish={onFinish} />);
    fireEvent.click(next()); fireEvent.click(next()); fireEvent.click(next());
    fireEvent.click(screen.getByText("tourStartCta"));
    expect(onFinish).toHaveBeenCalledWith({ destination: "klussie" });
  });

  it("keeps skip visible on every single step, including the last", () => {
    const onFinish = vi.fn();
    render(<CustomerOnboarding t={t} onFinish={onFinish} />);
    for (let i = 0; i < 3; i++) {
      expect(screen.getByText("tourSkip")).toBeTruthy();
      fireEvent.click(next());
    }
    fireEvent.click(screen.getByText("tourSkip"));
    expect(onFinish).toHaveBeenCalledWith({ destination: "klussie" });
  });

  it("announces each step rather than changing text silently", () => {
    render(<CustomerOnboarding t={t} onFinish={vi.fn()} />);
    const live = document.querySelector('[aria-live="polite"]');
    expect(live.textContent).toContain("tourStep1Title");
    fireEvent.click(next());
    expect(live.textContent).toContain("tourStep2Title");
  });
});

describe("CustomerOnboarding — keyboard and focus", () => {
  it("names itself to assistive tech and takes focus on open", () => {
    render(<CustomerOnboarding t={t} onFinish={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")).textContent).toBe("tourStep1Title");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("keeps Tab inside the dialog instead of letting it walk out behind it", () => {
    render(
      <>
        <button type="button">behind the overlay</button>
        <CustomerOnboarding t={t} onFinish={vi.fn()} />
      </>
    );
    const dialog = screen.getByRole("dialog");
    const focusables = Array.from(dialog.querySelectorAll("button"));
    const last = focusables[focusables.length - 1];

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(focusables[0]);

    fireEvent.keyDown(focusables[0], { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    expect(screen.getByText("behind the overlay")).not.toBe(document.activeElement);
  });

  it("restores focus to wherever it came from on close", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>open the tour</button>
          {open && <CustomerOnboarding t={t} onFinish={() => setOpen(false)} />}
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByText("open the tour");
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText("tourSkip"));
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape", () => {
    const onFinish = vi.fn();
    render(<CustomerOnboarding t={t} onFinish={onFinish} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onFinish).toHaveBeenCalled();
  });

  it("labels its close control in the customer's own language", () => {
    render(<CustomerOnboarding t={t} onFinish={vi.fn()} />);
    // ACCESSIBILITY.md flagged every aria-label in this codebase as hardcoded English;
    // this one is not.
    expect(screen.getAllByLabelText("tourSkip").length).toBeGreaterThan(0);
  });
});

describe("useHomeTour — shown once, replayable forever", () => {
  function Harness() {
    const tour = useHomeTour();
    return (
      <>
        <span data-testid="state">{tour.open ? "open" : "closed"}</span>
        <button type="button" onClick={() => tour.finish({ destination: "klussie" })}>finish</button>
        <button type="button" onClick={tour.replay}>replay</button>
      </>
    );
  }
  const state = () => screen.getByTestId("state").textContent;

  it("opens for a customer who has never seen it", () => {
    render(<Harness />);
    expect(state()).toBe("open");
  });

  it("does not open for a customer who already completed it", () => {
    authState.profile = { onboarding_role_selected: true, created_at: "2026-08-12T10:00:00Z", home_tour_completed_at: "2026-08-12T11:00:00Z" };
    render(<Harness />);
    expect(state()).toBe("closed");
  });

  it("stays closed after dismissal, and records that durably", async () => {
    render(<Harness />);
    await act(async () => { screen.getByText("finish").click(); });

    expect(state()).toBe("closed");
    await waitFor(() => expect(authState.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ home_tour_completed_at: expect.any(String) })
    ));
    // And locally too, so a failed profile write still cannot reopen it.
    expect(window.localStorage.getItem("klussie.homeTourCompleted.u1")).toBe("true");
  });

  it("reopens on demand from Help, without un-completing anything", async () => {
    authState.profile = { onboarding_role_selected: true, created_at: "2026-08-12T10:00:00Z", home_tour_completed_at: "2026-08-12T11:00:00Z" };
    render(<Harness />);
    expect(state()).toBe("closed");

    await act(async () => { screen.getByText("replay").click(); });
    expect(state()).toBe("open");

    await act(async () => { screen.getByText("finish").click(); });
    expect(state()).toBe("closed");
  });
});

describe("tour copy", () => {
  it("says the brief's four things, in Dutch, verbatim", () => {
    expect(HOME_STRINGS.nl.tourStep1Title).toBe("Vertel of toon wat er aan de hand is");
    expect(HOME_STRINGS.nl.tourStep1Body).toBe("Gebruik tekst, spraak of een foto.");
    expect(HOME_STRINGS.nl.tourStep2Title).toBe("Klussie stelt de juiste vragen");
    expect(HOME_STRINGS.nl.tourStep3Title).toBe("Bewaar alles over je woning");
    expect(HOME_STRINGS.nl.tourStep4Title).toBe("Volg je spullen en garanties");
    expect(HOME_STRINGS.nl.tourStartCta).toBe("Start met Klussie");
    expect(HOME_STRINGS.nl.tourSetupHomeCta).toBe("Stel eerst mijn woning in");
  });

  it("is reachable from Profiel → Hulp & uitleg in every locale", () => {
    for (const locale of Object.keys(HOME_STRINGS)) {
      expect(HOME_STRINGS[locale].helpSectionTitle, locale).toBeTruthy();
      expect(HOME_STRINGS[locale].helpReplayTour, locale).toBeTruthy();
    }
  });
});
