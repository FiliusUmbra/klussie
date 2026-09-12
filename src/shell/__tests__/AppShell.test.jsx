// AppShell.jsx's own tests — none existed before this. Scoped narrowly to the catalog
// load/error/retry gate: every other branch (CustomerApp/ProApp/OperatorApp/
// WelcomeScreen/WorkspaceSwitcher) is stubbed to a trivial marker so this file never
// needs to reach into any of their own dependency trees.
//
// Found by code audit: a failed fetchCatalog() used to set catalogError to the raw
// err.message and render it as the ENTIRE app's only visible content for every
// signed-in person, in every locale, with no way back in short of reloading the page —
// the exact anti-pattern documents.js's own header names and fixes elsewhere, at the
// highest possible severity (it blocks the whole app, not one sheet).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("../../lib/supabaseClient", () => ({ supabase: { from: vi.fn(), auth: {}, channel: vi.fn() } }));

const useAuthMock = vi.fn();
vi.mock("../../lib/auth.jsx", () => ({ useAuth: () => useAuthMock() }));

const fetchCatalogMock = vi.fn();
vi.mock("../../lib/catalog", () => ({ fetchCatalog: () => fetchCatalogMock() }));

vi.mock("../../lib/operatorContext.js", () => ({ isOperatorWorkspace: vi.fn(() => Promise.resolve(false)) }));

vi.mock("../../auth/WelcomeScreen.jsx", () => ({ WelcomeScreen: () => <div data-testid="welcome-screen" /> }));
vi.mock("../../profile/BecomeProPrompt.jsx", () => ({ BecomeProPrompt: () => null }));
vi.mock("../../profile/BecomeProSheet.jsx", () => ({ BecomeProSheet: () => null }));
vi.mock("../../customer/CustomerApp.jsx", () => ({
  CustomerApp: ({ showToast }) => (
    <div data-testid="customer-app">
      <button type="button" onClick={() => showToast("Booked!")}>fire-toast</button>
    </div>
  ),
}));
vi.mock("../../pro/ProApp.jsx", () => ({ ProApp: () => <div data-testid="pro-app" /> }));
vi.mock("../../operator/OperatorApp.jsx", () => ({ OperatorApp: () => <div data-testid="operator-app" /> }));
vi.mock("../WorkspaceSwitcher.jsx", () => ({ WorkspaceSwitcher: () => null }));
// A real stand-in reading langCode/setLangCode through useLang() (context, not props —
// see LanguageSwitcher.jsx's own header for why), matching CustomerApp's own mock-exposes-
// a-real-callback shape above — needed to exercise AppShell's own persistence effect
// end-to-end rather than asserting against langPreference.js in isolation.
vi.mock("../LanguageSwitcher.jsx", () => ({
  LanguageSwitcher: () => {
    const { langCode, setLangCode } = useLang();
    return (
      <div data-testid="language-switcher" data-lang={langCode}>
        <button type="button" onClick={() => setLangCode("ar")}>switch-to-ar</button>
      </div>
    );
  },
}));

import { AppShell } from "../AppShell.jsx";
import { useLang } from "../../lib/lang";
import { getPreferredLangCode, setPreferredLangCode } from "../../lib/langPreference.js";

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({
    session: { user: { id: "cust-1" } },
    loading: false,
    proProfile: null,
    workspaceMemberships: [],
    activeWorkspace: null,
    setActiveWorkspaceId: vi.fn(),
  });
});

describe("AppShell — catalog load failure", () => {
  it("renders the real app once the catalog loads successfully", async () => {
    fetchCatalogMock.mockResolvedValue({ categories: [], services: [] });
    render(<AppShell />);

    await waitFor(() => expect(screen.getByTestId("customer-app")).toBeTruthy());
  });

  it("shows a generic localized message, never the raw backend error, and offers a real retry — not just a reload", async () => {
    // AppShell builds its own real lang context (default locale "nl") rather than
    // taking one as a prop, so the real Dutch string is what actually renders — the
    // same text a real signed-in user would see, not a mocked-away placeholder.
    const CATALOG_LOAD_FAILED_NL = "Er ging iets mis bij het laden van klussie. Probeer het opnieuw.";
    const RETRY_BTN_NL = "Opnieuw proberen";

    fetchCatalogMock.mockRejectedValue(new Error("relation \"categories\" does not exist"));
    render(<AppShell />);

    await waitFor(() => expect(screen.getByText(CATALOG_LOAD_FAILED_NL)).toBeTruthy());
    expect(screen.queryByText(/does not exist/)).toBeNull();
    expect(screen.queryByTestId("customer-app")).toBeNull();

    // A real way back in, not a dead end short of a page reload.
    fetchCatalogMock.mockResolvedValueOnce({ categories: [], services: [] });
    await act(async () => { fireEvent.click(screen.getByText(RETRY_BTN_NL)); });

    await waitFor(() => expect(screen.getByTestId("customer-app")).toBeTruthy());
    expect(fetchCatalogMock).toHaveBeenCalledTimes(2);
  });
});

// Found by code audit: the one shared toast every confirmation in the app goes through
// (a booking confirmed, a review sent, a quote sent, a request accepted...) had no
// aria-live/role at all — it appeared and disappeared with zero announcement to a
// screen reader. Matches ACCESSIBILITY.md's own named "No live-region announcements
// exist for async state changes" gap exactly.
describe("AppShell — toast is a real live region", () => {
  it("announces the toast via role=\"status\", not silently", async () => {
    fetchCatalogMock.mockResolvedValue({ categories: [], services: [] });
    render(<AppShell />);
    await waitFor(() => expect(screen.getByTestId("customer-app")).toBeTruthy());

    fireEvent.click(screen.getByText("fire-toast"));

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Booked!"));
  });
});

// Found live during a UX review, 2026-09-12: langCode (useState("nl")) had nowhere to
// live but memory -- every reload reverted to Dutch, for every one of the 10 shipped
// locales, no matter what a customer had explicitly picked. document.documentElement.lang
// is the same accessibility-sync effect AppShell already has (untouched by this fix) —
// used here only as a cheap, real, already-observable proxy for "what langCode actually
// initialized to," not a new thing this fix invented.
describe("AppShell — language preference persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("initializes from a previously stored preference, not always Dutch", async () => {
    setPreferredLangCode("ar");
    fetchCatalogMock.mockResolvedValue({ categories: [], services: [] });

    render(<AppShell />);

    await waitFor(() => expect(screen.getByTestId("customer-app")).toBeTruthy());
    expect(document.documentElement.lang).toBe("ar");
  });

  it("falls back to Dutch when nothing has been chosen yet", async () => {
    fetchCatalogMock.mockResolvedValue({ categories: [], services: [] });

    render(<AppShell />);

    await waitFor(() => expect(screen.getByTestId("customer-app")).toBeTruthy());
    expect(document.documentElement.lang).toBe("nl");
  });

  it("persists an explicit change for next time — the actual regression, reproduced end-to-end", async () => {
    fetchCatalogMock.mockResolvedValue({ categories: [], services: [] });
    render(<AppShell />);
    await waitFor(() => expect(screen.getByTestId("customer-app")).toBeTruthy());
    // The persistence effect also fires on the initial "nl" default (a harmless no-op
    // write, per its own comment) -- the real assertion is what happens after a change.
    expect(getPreferredLangCode()).toBe("nl");

    fireEvent.click(screen.getByText("switch-to-ar"));

    await waitFor(() => expect(document.documentElement.lang).toBe("ar"));
    expect(getPreferredLangCode()).toBe("ar");
  });
});
