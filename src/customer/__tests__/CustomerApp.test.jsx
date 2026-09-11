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
const createServiceRequestMock = vi.fn(() => Promise.resolve({ id: "req-new" }));
const acceptQuoteApiMock = vi.fn(() => Promise.resolve());
const approveLocationDisclosureApiMock = vi.fn(() => Promise.resolve());
const markCompleteApiMock = vi.fn(() => Promise.resolve());
const submitReviewApiMock = vi.fn(() => Promise.resolve());
vi.mock("../../lib/requests", () => ({
  createServiceRequest: (...args) => createServiceRequestMock(...args),
  fetchCustomerRequests: (...args) => fetchCustomerRequestsMock(...args),
  acceptQuote: (...args) => acceptQuoteApiMock(...args),
  approveLocationDisclosure: (...args) => approveLocationDisclosureApiMock(...args),
  markComplete: (...args) => markCompleteApiMock(...args),
  submitReview: (...args) => submitReviewApiMock(...args),
  subscribeToCustomerRequests: (...args) => subscribeToCustomerRequestsMock(...args),
  subscribeToRequestQuotes: vi.fn(() => () => {}),
}));
const fetchConversationsMock = vi.fn(() => Promise.resolve([]));
vi.mock("../../lib/messages", () => ({
  fetchConversations: (...args) => fetchConversationsMock(...args),
  subscribeToConversationsForUser: vi.fn(() => () => {}),
}));
const uploadRequestPhotoMock = vi.fn(() => Promise.resolve());
vi.mock("../../lib/requestPhotos", () => ({ uploadRequestPhoto: (...args) => uploadRequestPhotoMock(...args) }));

// The onStart/onOpenRequest buttons below are what a real ConversationHome's own
// AI-intake CTA and request-card taps ultimately do — needed so the regression tests
// further down can actually reach createRequestFromAi()/RequestDetailSheet's own
// callbacks.
vi.mock("../../home/ConversationHome.jsx", () => ({
  ConversationHome: ({ onStart, onOpenRequest }) => (
    <div data-testid="conversation-home">
      <button onClick={() => onStart({ text: "leak" })}>open-ai-intake</button>
      <button onClick={() => onOpenRequest("req-1")}>open-request</button>
    </div>
  ),
}));
vi.mock("../../home/CustomerOnboarding.jsx", () => ({ CustomerOnboarding: () => null }));
vi.mock("../../messaging/MessagesList.jsx", () => ({ MessagesList: () => null }));
vi.mock("../../messaging/ConversationSheet.jsx", () => ({ ConversationSheet: () => null }));
vi.mock("./ServiceSheet.jsx", () => ({ ServiceSheet: () => null }));
vi.mock("../QuoteFormSheet.jsx", () => ({ QuoteFormSheet: () => null }));
// The onSubmitted button mirrors the real AiIntakeSheet.jsx's own handleFinalSubmit —
// needed so the two createRequestFromAi() regression tests further down can invoke
// CustomerApp.jsx's real onSubmitted wrapper with a real payload.
const AI_INTAKE_PAYLOAD = {
  serviceId: "svc-1", categoryId: "cat-1", details: "Leaking pipe", detailsJson: {},
  whenPref: "this_week", budget: "", city: null, location: null, assetId: null,
  photos: [new File(["x"], "leak.jpg", { type: "image/jpeg" })],
};
vi.mock("../AiIntakeSheet.jsx", () => ({
  AiIntakeSheet: ({ onSubmitted }) => (
    <button onClick={() => onSubmitted(AI_INTAKE_PAYLOAD)}>submit-ai-intake</button>
  ),
}));
vi.mock("../RequestsList.jsx", () => ({ RequestsList: () => null }));
// Buttons mirror RequestDetailSheet.jsx's own real onAccept/onApproveDisclosure/
// onComplete call sites closely enough for the regression tests further down to invoke
// CustomerApp.jsx's real handlers with real arguments.
vi.mock("../RequestDetailSheet.jsx", () => ({
  RequestDetailSheet: ({ onAccept, onApproveDisclosure, onComplete, onReview }) => (
    <div>
      <button onClick={() => onAccept("quote-1")}>accept-quote</button>
      <button onClick={() => onApproveDisclosure()}>approve-disclosure</button>
      <button onClick={() => onComplete()}>mark-complete</button>
      <button onClick={() => onReview()}>leave-review</button>
    </div>
  ),
}));
vi.mock("../ReviewSheet.jsx", () => ({
  ReviewSheet: ({ onSubmit }) => <button onClick={() => onSubmit({ stars: 5, text: "Great!" })}>submit-review</button>,
}));
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

// A single request that resolves both openRequestObj (id: "req-1") and, once reviewFor
// is set by the leave-review button above, reviewReq -- the same row serves both.
const REQUEST = { id: "req-1", quotes: [{ id: "quote-1" }] };

beforeEach(() => {
  fetchCustomerRequestsMock.mockReset().mockResolvedValue([]);
  fetchConversationsMock.mockReset().mockResolvedValue([]);
  subscribeToCustomerRequestsMock.mockClear();
  createServiceRequestMock.mockReset().mockResolvedValue({ id: "req-new" });
  uploadRequestPhotoMock.mockReset().mockResolvedValue();
  acceptQuoteApiMock.mockReset().mockResolvedValue();
  approveLocationDisclosureApiMock.mockReset().mockResolvedValue();
  markCompleteApiMock.mockReset().mockResolvedValue();
  submitReviewApiMock.mockReset().mockResolvedValue();
});

async function openRequestDetail() {
  fetchCustomerRequestsMock.mockResolvedValue([REQUEST]);
  const { showToast } = renderApp();
  await waitFor(() => expect(screen.getByTestId("conversation-home")).toBeTruthy());
  fireEvent.click(screen.getByText("open-request"));
  await screen.findByText("accept-quote");
  return { showToast };
}

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

// Found by code audit, 2026-09-11: attachPhotos()'s own header already stated the
// intended behaviour ("a failed upload... leaves a real request with fewer photos
// rather than no request at all") but the code didn't implement it — a plain loop with
// no catch of its own, and the trailing refresh() right after it was equally unguarded.
// Either one failing after createServiceRequest() had already succeeded propagated all
// the way up to AiIntakeSheet.jsx's own handler as a full creation failure — a customer
// trusting that false error and submitting again would create a genuine duplicate
// request. useConversation.js's own bookProfessional() already gets the photo-upload
// half of this right for the AI-canvas direct-booking path; matched here for the
// AI-intake-sheet path (createRequestFromAi()) and the manual-form path (createRequest(),
// currently unreachable but fixed for the same "dead code today is not dead code
// forever" reason the rest of this codebase already applies).
//
// Both tests below reach into tab-switching as the observable signal that the real
// onSubmitted={async (payload) => { await createRequestFromAi(payload); setTab("requests"); }}
// wrapper in CustomerApp.jsx did not throw: a rejection there would leave `tab` at its
// initial "discover" value, so ConversationHome (only rendered while tab === "discover")
// would still be on screen; setTab("requests") running is only reachable past a real,
// non-throwing await.
describe("CustomerApp — creating a request survives a failed photo upload or a failed post-create refresh", () => {
  async function openAndSubmitAiIntake() {
    renderApp();
    await waitFor(() => expect(screen.getByTestId("conversation-home")).toBeTruthy());
    fireEvent.click(screen.getByText("open-ai-intake"));
    fireEvent.click(await screen.findByText("submit-ai-intake"));
  }

  it("still creates the request and moves past the sheet when a photo upload fails", async () => {
    // The initial load (this render's own first fetchCustomerRequests call) must still
    // succeed -- only the photo upload triggered by submitting should fail.
    uploadRequestPhotoMock.mockRejectedValue(new Error("storage quota exceeded"));

    await openAndSubmitAiIntake();

    await waitFor(() => expect(screen.queryByTestId("conversation-home")).toBeNull());
    expect(createServiceRequestMock).toHaveBeenCalledTimes(1);
  });

  it("still creates the request and moves past the sheet when the post-create refresh fails", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId("conversation-home")).toBeTruthy());
    // The initial load above already consumed the default resolved value; only the
    // refresh() triggered by submitting below should fail.
    fetchCustomerRequestsMock.mockRejectedValueOnce(new Error("network blip refetching the list"));

    fireEvent.click(screen.getByText("open-ai-intake"));
    fireEvent.click(await screen.findByText("submit-ai-intake"));

    await waitFor(() => expect(screen.queryByTestId("conversation-home")).toBeNull());
    expect(createServiceRequestMock).toHaveBeenCalledTimes(1);
  });
});

// Found by code audit, 2026-09-11: the same bug shape as attachPhotos()/refresh() above,
// applied to every one of this file's own action handlers on an existing request —
// acceptQuote()/approveLocationDisclosure()/markComplete()/submitReview() all had their
// own trailing refresh() sitting inside the same try as the real write. A failure there,
// after the real write had already succeeded, showed that handler's own failure toast
// (or, for submitReview, never showed the success one) even though nothing had actually
// gone wrong.
describe("CustomerApp — accept/approve/complete/review all survive a failed post-action refresh", () => {
  it("acceptQuote shows no false failure toast when only the post-accept refresh fails", async () => {
    const { showToast } = await openRequestDetail();
    fetchCustomerRequestsMock.mockRejectedValueOnce(new Error("network blip refetching the list"));

    fireEvent.click(screen.getByText("accept-quote"));

    await waitFor(() => expect(acceptQuoteApiMock).toHaveBeenCalledWith("quote-1", "cust-1"));
    await waitFor(() => expect(fetchCustomerRequestsMock).toHaveBeenCalledTimes(2));
    expect(showToast).not.toHaveBeenCalledWith("toastAcceptQuoteFailed");
  });

  it("approveLocationDisclosure still shows the real success toast when only the post-approve refresh fails", async () => {
    const { showToast } = await openRequestDetail();
    fetchCustomerRequestsMock.mockRejectedValueOnce(new Error("network blip refetching the list"));

    fireEvent.click(screen.getByText("approve-disclosure"));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith("toastBooked"));
    expect(showToast).not.toHaveBeenCalledWith("toastDisclosureApproveFailed");
  });

  it("markComplete shows no false failure toast when only the post-complete refresh fails", async () => {
    const { showToast } = await openRequestDetail();
    fetchCustomerRequestsMock.mockRejectedValueOnce(new Error("network blip refetching the list"));

    fireEvent.click(screen.getByText("mark-complete"));

    await waitFor(() => expect(markCompleteApiMock).toHaveBeenCalledWith("req-1", "cust-1"));
    await waitFor(() => expect(fetchCustomerRequestsMock).toHaveBeenCalledTimes(2));
    expect(showToast).not.toHaveBeenCalledWith("toastMarkCompleteFailed");
  });

  it("submitReview still shows the real success toast when only the post-review refresh fails", async () => {
    const { showToast } = await openRequestDetail();
    fireEvent.click(screen.getByText("leave-review"));
    fetchCustomerRequestsMock.mockRejectedValueOnce(new Error("network blip refetching the list"));

    fireEvent.click(await screen.findByText("submit-review"));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith("toastThanks"));
    expect(showToast).not.toHaveBeenCalledWith("toastReviewFailed");
  });
});
