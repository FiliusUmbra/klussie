// CustomerApp.jsx's own tests — none existed before this. Scoped narrowly to the
// initial requests/conversations load/error/retry gate, the same shape ProApp.jsx's own
// mirror of this bug was just fixed and tested with; every other branch (ConversationHome/
// RequestsList/MessagesList/Profile/sheets) is stubbed to a trivial marker so this file
// never needs to reach into any of their own dependency trees.
//
// Found by code audit: fetchCustomerRequests()/fetchConversations() both throw on a real
// Postgres error, and the initial refresh()/refreshConversations() calls had no catch of
// their own -- with the render gated on "if (!requests || !conversations) return
// <LoadingScreen />", any single failure hung the whole customer app on a spinner
// forever. The exact AppShell.jsx catalogError bug, one layer in.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/supabaseClient", () => ({ supabase: { from: vi.fn(), auth: {}, channel: vi.fn() } }));

vi.mock("../../lib/auth.jsx", () => ({
  useAuth: () => ({ user: { id: "cust-1" }, profile: null, activeWorkspace: { workspace_id: "ws-1" } }),
}));

const fetchCustomerRequestsMock = vi.fn(() => Promise.resolve([]));
const subscribeToCustomerRequestsMock = vi.fn(() => () => {});
vi.mock("../../lib/requests", () => ({
  createServiceRequest: vi.fn(),
  fetchCustomerRequests: (...args) => fetchCustomerRequestsMock(...args),
  acceptQuote: vi.fn(),
  approveLocationDisclosure: vi.fn(),
  markComplete: vi.fn(),
  submitReview: vi.fn(),
  subscribeToCustomerRequests: (...args) => subscribeToCustomerRequestsMock(...args),
  subscribeToRequestQuotes: vi.fn(() => () => {}),
}));
const fetchConversationsMock = vi.fn(() => Promise.resolve([]));
vi.mock("../../lib/messages", () => ({
  fetchConversations: (...args) => fetchConversationsMock(...args),
  subscribeToConversationsForUser: vi.fn(() => () => {}),
}));
vi.mock("../../lib/requestPhotos", () => ({ uploadRequestPhoto: vi.fn() }));

vi.mock("../../home/ConversationHome.jsx", () => ({ ConversationHome: () => <div data-testid="conversation-home" /> }));
vi.mock("../../home/CustomerOnboarding.jsx", () => ({ CustomerOnboarding: () => null }));
vi.mock("../../messaging/MessagesList.jsx", () => ({ MessagesList: () => null }));
vi.mock("../../messaging/ConversationSheet.jsx", () => ({ ConversationSheet: () => null }));
vi.mock("./ServiceSheet.jsx", () => ({ ServiceSheet: () => null }));
vi.mock("../QuoteFormSheet.jsx", () => ({ QuoteFormSheet: () => null }));
vi.mock("../AiIntakeSheet.jsx", () => ({ AiIntakeSheet: () => null }));
vi.mock("../RequestsList.jsx", () => ({ RequestsList: () => null }));
vi.mock("../RequestDetailSheet.jsx", () => ({ RequestDetailSheet: () => null }));
vi.mock("../ReviewSheet.jsx", () => ({ ReviewSheet: () => null }));
vi.mock("../../profile/Profile.jsx", () => ({ Profile: () => null }));

import { LangContext } from "../../lib/lang";
import { CustomerApp } from "../CustomerApp.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = { t };

function renderApp() {
  const showToast = vi.fn();
  render(
    <LangContext.Provider value={ctx}>
      <CustomerApp showToast={showToast} onBecomePro={() => {}} />
    </LangContext.Provider>
  );
  return { showToast };
}

beforeEach(() => {
  fetchCustomerRequestsMock.mockReset().mockResolvedValue([]);
  fetchConversationsMock.mockReset().mockResolvedValue([]);
  subscribeToCustomerRequestsMock.mockClear();
});

describe("CustomerApp — initial load failure", () => {
  it("renders the real app once requests and conversations both load successfully", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId("conversation-home")).toBeTruthy());
  });

  it("shows a generic localized message and a real retry, never an infinite spinner, when a fetch fails", async () => {
    fetchCustomerRequestsMock.mockRejectedValue(new Error("relation \"requests\" does not exist"));
    renderApp();

    await waitFor(() => expect(screen.getByText("catalogLoadFailed")).toBeTruthy());
    expect(screen.queryByText(/does not exist/)).toBeNull();
    expect(screen.queryByTestId("conversation-home")).toBeNull();

    fetchCustomerRequestsMock.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByText("retryBtn"));

    await waitFor(() => expect(screen.getByTestId("conversation-home")).toBeTruthy());
  });

  it("keeps the already-loaded app on screen when a later realtime-triggered refresh fails, rather than tearing it down", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId("conversation-home")).toBeTruthy());

    // The real subscribeToCustomerRequests(..., refresh) callback -- what a live realtime
    // event actually invokes -- rejecting after a successful initial load must not replace
    // an already-working screen with the error gate; it should behave like every other
    // "unavailable, continuing without them" background read in the codebase. (That bare
    // `refresh` callback has no catch of its own -- a separate, pre-existing, out-of-scope
    // gap this test works around with its own .catch, the same way a real browser would
    // just log the rejection to console without touching the render.)
    fetchCustomerRequestsMock.mockRejectedValueOnce(new Error("network blip"));
    const onChange = subscribeToCustomerRequestsMock.mock.calls[0][2];
    await onChange().catch(() => {});

    expect(screen.getByTestId("conversation-home")).toBeTruthy();
    expect(screen.queryByText("catalogLoadFailed")).toBeNull();
  });
});
