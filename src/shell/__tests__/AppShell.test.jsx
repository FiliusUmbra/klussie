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
vi.mock("../../customer/CustomerApp.jsx", () => ({ CustomerApp: () => <div data-testid="customer-app" /> }));
vi.mock("../../pro/ProApp.jsx", () => ({ ProApp: () => <div data-testid="pro-app" /> }));
vi.mock("../../operator/OperatorApp.jsx", () => ({ OperatorApp: () => <div data-testid="operator-app" /> }));
vi.mock("../WorkspaceSwitcher.jsx", () => ({ WorkspaceSwitcher: () => null }));
vi.mock("../LanguageSwitcher.jsx", () => ({ LanguageSwitcher: () => null }));

import { AppShell } from "../AppShell.jsx";

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
