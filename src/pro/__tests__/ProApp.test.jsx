// ProApp.jsx's own tests — none existed before this. Scoped narrowly to sendQuote()'s
// own error handling; every other branch (ProDashboard/ProJobs/MessagesList/Profile/
// MyBusinessPanel/ProOnboarding) is stubbed to a trivial marker so this file never needs
// to reach into any of their own dependency trees.
//
// Found by code audit, the same shape as CustomerApp.jsx's own already-fixed
// submitReview(): sendQuote() was fire-and-forget from its own JSX call site (no await,
// no catch) and had none of its own either, so a real refusal (0212's own "a quote
// could be submitted against a request that was no longer open" guard, reachable
// whenever two pros race the same lead) became an unhandled promise rejection, with the
// sheet's own SendQuoteSheet having no busy state either — nothing telling the
// professional an attempt was even made, let alone that it failed.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/supabaseClient", () => ({ supabase: { from: vi.fn(), auth: {}, channel: vi.fn() } }));

vi.mock("../../lib/auth.jsx", () => ({
  useAuth: () => ({ user: { id: "pro-1" }, proProfile: null, activeWorkspace: { workspace_id: "ws-1" } }),
}));

const sendQuoteApiMock = vi.fn();
const fetchProLeadsMock = vi.fn(() => Promise.resolve([]));
const fetchProJobsMock = vi.fn(() => Promise.resolve({ sent: [], booked: [], completed: [] }));
vi.mock("../../lib/requests", () => ({
  fetchProLeads: (...args) => fetchProLeadsMock(...args),
  fetchProJobs: (...args) => fetchProJobsMock(...args),
  sendQuote: (...args) => sendQuoteApiMock(...args),
  subscribeToProLeads: vi.fn(() => () => {}),
  subscribeToProQuoteUpdates: vi.fn(() => () => {}),
}));
const fetchProServicesMock = vi.fn(() => Promise.resolve([]));
const fetchPublicProInfoMock = vi.fn(() => Promise.resolve({ "pro-1": { name: "Pierre Pro" } }));
vi.mock("../../lib/pros", () => ({
  fetchProServices: (...args) => fetchProServicesMock(...args),
  fetchPublicProInfo: (...args) => fetchPublicProInfoMock(...args),
}));
const fetchConversationsMock = vi.fn(() => Promise.resolve([]));
vi.mock("../../lib/messages", () => ({
  fetchConversations: (...args) => fetchConversationsMock(...args),
  subscribeToConversationsForUser: vi.fn(() => () => {}),
}));

const LEAD = { id: "req-1", serviceId: "svc-plumbing", answers: { fields: {} } };

vi.mock("../ProDashboard.jsx", () => ({
  ProDashboard: ({ onQuote }) => <button type="button" onClick={() => onQuote(LEAD)}>open-quote-sheet</button>,
}));
vi.mock("../SendQuoteSheet.jsx", () => ({
  SendQuoteSheet: ({ onSubmit }) => <button type="button" onClick={() => onSubmit(80, "On my way")}>submit-quote</button>,
}));
vi.mock("../ProJobs.jsx", () => ({ ProJobs: () => null }));
vi.mock("../ProJobDetailSheet.jsx", () => ({ ProJobDetailSheet: () => null }));
vi.mock("../../messaging/MessagesList.jsx", () => ({ MessagesList: () => null }));
vi.mock("../../messaging/ConversationSheet.jsx", () => ({ ConversationSheet: () => null }));
vi.mock("../../profile/Profile.jsx", () => ({ Profile: () => null }));
vi.mock("../MyBusinessPanel.jsx", () => ({ MyBusinessPanel: () => null }));
vi.mock("../ProOnboarding.jsx", () => ({ ProOnboarding: () => null }));

import { LangContext } from "../../lib/lang";
import { ProApp } from "../ProApp.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = { t, BASE_SERVICES: [], fmtDate: (d) => d };

function renderApp() {
  const showToast = vi.fn();
  render(
    <LangContext.Provider value={ctx}>
      <ProApp showToast={showToast} />
    </LangContext.Provider>
  );
  return { showToast };
}

beforeEach(() => {
  fetchProLeadsMock.mockReset().mockResolvedValue([]);
  fetchProJobsMock.mockReset().mockResolvedValue({ sent: [], booked: [], completed: [] });
  fetchProServicesMock.mockReset().mockResolvedValue([]);
  fetchPublicProInfoMock.mockReset().mockResolvedValue({ "pro-1": { name: "Pierre Pro" } });
  fetchConversationsMock.mockReset().mockResolvedValue([]);
});

describe("ProApp — sendQuote", () => {
  it("sends the quote, closes the sheet, and shows the success toast", async () => {
    sendQuoteApiMock.mockResolvedValue();
    const { showToast } = renderApp();

    await screen.findByText("open-quote-sheet");
    fireEvent.click(screen.getByText("open-quote-sheet"));
    await screen.findByText("submit-quote");
    fireEvent.click(screen.getByText("submit-quote"));

    await waitFor(() => expect(sendQuoteApiMock).toHaveBeenCalledWith({
      requestId: "req-1", proId: "pro-1", workspaceId: "ws-1", price: 80, message: "On my way",
    }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("toastQuoteSent"));
    await waitFor(() => expect(screen.queryByText("submit-quote")).toBeNull());
  });

  it("shows the real failure toast and keeps the sheet open — never an unhandled rejection with no feedback at all — when the quote is refused", async () => {
    sendQuoteApiMock.mockRejectedValue(Object.assign(new Error("object_not_in_prerequisite_state"), { code: "object_not_in_prerequisite_state" }));
    const { showToast } = renderApp();

    await screen.findByText("open-quote-sheet");
    fireEvent.click(screen.getByText("open-quote-sheet"));
    await screen.findByText("submit-quote");
    fireEvent.click(screen.getByText("submit-quote"));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith("toastQuoteFailed"));
    // The sheet stays open, price/message intact for a retry, rather than the failed
    // attempt silently vanishing.
    expect(screen.getByText("submit-quote")).toBeTruthy();
  });

  // Found by code audit, 2026-09-11: refreshLeads()/refreshJobs() used to sit inside the
  // same try as sendQuoteApi() itself, so a failure in either — after the quote had
  // already been sent and the sheet had already closed — showed toastQuoteFailed, the
  // exact opposite of what actually happened.
  it("shows the real success toast even when the post-send lead/job list refresh fails", async () => {
    sendQuoteApiMock.mockResolvedValue();
    const { showToast } = renderApp();
    await screen.findByText("open-quote-sheet");
    // The initial load above already consumed the default resolved value; only the
    // refreshLeads() triggered by sending the quote below should fail.
    fetchProLeadsMock.mockRejectedValueOnce(new Error("network blip refetching leads"));

    fireEvent.click(screen.getByText("open-quote-sheet"));
    await screen.findByText("submit-quote");
    fireEvent.click(screen.getByText("submit-quote"));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith("toastQuoteSent"));
    expect(showToast).not.toHaveBeenCalledWith("toastQuoteFailed");
    await waitFor(() => expect(screen.queryByText("submit-quote")).toBeNull());
  });
});

// Found by code audit: none of the five fetches ProApp gates its render on had a catch —
// a real refusal on any one of them (fetchProServices/fetchPublicProInfo/fetchProLeads/
// fetchProJobs/fetchConversations) hung the whole screen on a spinner forever, the exact
// AppShell.jsx catalogError bug one layer in.
describe("ProApp — initial load failure", () => {
  it("renders the real dashboard once every initial fetch succeeds", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText("open-quote-sheet")).toBeTruthy());
  });

  it("shows a generic localized message and a real retry, never an infinite spinner, when a fetch fails", async () => {
    fetchProLeadsMock.mockRejectedValue(new Error("relation \"leads\" does not exist"));
    renderApp();

    await waitFor(() => expect(screen.getByText("catalogLoadFailed")).toBeTruthy());
    expect(screen.queryByText(/does not exist/)).toBeNull();
    expect(screen.queryByText("open-quote-sheet")).toBeNull();

    fetchProLeadsMock.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByText("retryBtn"));

    await waitFor(() => expect(screen.getByText("open-quote-sheet")).toBeTruthy());
  });
});
