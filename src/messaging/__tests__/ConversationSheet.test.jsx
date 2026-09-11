// ConversationSheet.jsx's own tests.
//
// Found live during a UX review, 2026-09-07: the send button was icon-only (lucide's
// <Send>) with no visible text and no aria-label — a screen reader announced it as an
// unnamed button, unlike every other icon-only control already in the app (e.g.
// MyItemsPanel's "Ruimte toevoegen"/"Document toevoegen" section actions), which already
// name themselves this way.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchMessagesMock = vi.fn(() => Promise.resolve([]));
vi.mock("../../lib/messages", () => ({
  fetchMessages: (...args) => fetchMessagesMock(...args),
  sendMessage: vi.fn(() => Promise.resolve()),
  markConversationRead: vi.fn(() => Promise.resolve()),
  saveMessageTranslation: vi.fn(() => Promise.resolve()),
  subscribeToMessages: vi.fn(() => () => {}),
}));
vi.mock("../../lib/notifications.js", () => ({
  markConversationNotificationsSeen: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../lib/translate", () => ({ translateMessage: vi.fn(() => Promise.resolve("")) }));

import { sendMessage, markConversationRead } from "../../lib/messages";
import { LangContext } from "../../lib/lang";
import { ConversationSheet } from "../ConversationSheet.jsx";

const t = {
  chatSendBtn: "Verstuur bericht", chatSendFailed: "Kon dit bericht niet versturen.",
  messagePlaceholder: "Typ een bericht...", counterpartFallbackName: "Gebruiker",
  catalogLoadFailed: "Er ging iets mis bij het laden van klussie. Probeer het opnieuw.",
  retryBtn: "Opnieuw proberen", messagesConversationEmpty: "Nog geen berichten.",
};

function renderSheet({ otherName = "Cathy Customer" } = {}) {
  const onClose = vi.fn();
  const { container } = render(
    <LangContext.Provider value={{ t, langCode: "nl" }}>
      <ConversationSheet
        conversationId="conv-1"
        userId="person-1"
        workspaceId="ws-1"
        otherName={otherName}
        onClose={onClose}
      />
    </LangContext.Provider>
  );
  return { onClose, container };
}

// Found live during a UX review, 2026-09-07: a conversation whose counterpart has no
// resolvable name (lib/messages.js's own "Klussie user" literal, closed the same day)
// used to show that literal English phrase here, in every locale. This module has no
// lang context of its own to blame — messages.js leaves otherName honestly null now,
// and this is the render-side half that fills it in with a real translated placeholder.
describe("ConversationSheet — counterpart with no resolvable name", () => {
  it("shows the translated placeholder, not a blank title, when otherName is null", () => {
    renderSheet({ otherName: null });
    expect(screen.getByText("Gebruiker")).toBeTruthy();
  });
});

// Found live during a UX review, 2026-09-07: nothing ever scrolled .chat-scroll at
// all — a conversation with enough history opened showing the OLDEST messages, and
// sending one while scrolled up left it off-screen.
describe("ConversationSheet — scrolls to the latest message", () => {
  // jsdom never computes real layout, so scrollHeight is always 0 without this — each
  // test stubs it to a deliberately distinct, non-zero value and asserts scrollTop was
  // actually set to match it, not just left at its default (also 0, which a broken
  // effect and a correct one against unstubbed jsdom would be indistinguishable at).
  function stubScrollHeight(container, value) {
    const el = container.querySelector(".chat-scroll");
    Object.defineProperty(el, "scrollHeight", { configurable: true, value });
    return el;
  }

  it("scrolls to the bottom once the conversation's own history loads", async () => {
    fetchMessagesMock.mockResolvedValueOnce([
      { id: "m1", senderId: "person-1", body: "Hallo!", createdAt: 1, translations: {} },
    ]);
    const { container } = render(
      <LangContext.Provider value={{ t, langCode: "nl" }}>
        <ConversationSheet conversationId="conv-1" userId="person-1" workspaceId="ws-1" otherName="Cathy Customer" onClose={vi.fn()} />
      </LangContext.Provider>
    );
    // Stub before the history arrives, so the effect that fires once `messages`
    // actually lands sees the real value, not jsdom's default 0.
    const el = stubScrollHeight(container, 900);

    await waitFor(() => expect(el.scrollTop).toBe(900));
  });

  it("scrolls again after sending a new message, not only on the initial load", async () => {
    const { container } = renderSheet();
    await screen.findByPlaceholderText("Typ een bericht...");
    const el = stubScrollHeight(container, 1200);

    fireEvent.change(screen.getByPlaceholderText("Typ een bericht..."), { target: { value: "Hallo!" } });
    fireEvent.click(screen.getByRole("button", { name: "Verstuur bericht" }));

    await waitFor(() => expect(el.scrollTop).toBe(1200));
  });
});

describe("ConversationSheet — send button has a real accessible name", () => {
  it("names the icon-only send button via aria-label, not left silent", async () => {
    renderSheet();
    await waitFor(() => expect(screen.getByRole("button", { name: "Verstuur bericht" })).toBeTruthy());
  });

  it("still sends on click, unaffected by the label", async () => {
    renderSheet();
    const input = await screen.findByPlaceholderText("Typ een bericht...");
    fireEvent.change(input, { target: { value: "Hallo!" } });
    fireEvent.click(screen.getByRole("button", { name: "Verstuur bericht" }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conv-1", senderId: "person-1", senderWorkspaceId: "ws-1", body: "Hallo!" })
    ));
  });

  // Found by code audit, 2026-09-11: this button's own Send icon never flipped for RTL
  // locales — see appStyles.js's own [dir="rtl"] .chat-input-row button svg comment.
  // Proves the button's own structure (an svg child of .chat-input-row button) is what
  // that structural CSS selector actually depends on.
  it("renders the send icon where its own RTL flip rule (a structural .chat-input-row button svg selector) can reach it", async () => {
    renderSheet();
    const button = await screen.findByRole("button", { name: "Verstuur bericht" });
    expect(button.closest(".chat-input-row").contains(button)).toBe(true);
    expect(button.querySelector("svg")).toBeTruthy();
  });
});

// Found by code audit: no try/catch at all, and the draft was cleared optimistically
// before the send even started — a real refusal meant the words the customer just
// typed were gone, with no error shown and no way to recover them short of retyping
// from memory.
describe("ConversationSheet — send failure restores the draft", () => {
  it("restores what was typed and shows a real error, rather than silently losing it, when sending fails", async () => {
    vi.mocked(sendMessage).mockRejectedValueOnce(new Error("network error"));
    renderSheet();
    const input = await screen.findByPlaceholderText("Typ een bericht...");
    fireEvent.change(input, { target: { value: "Hallo, ben je er nog?" } });
    fireEvent.click(screen.getByRole("button", { name: "Verstuur bericht" }));

    await waitFor(() => expect(screen.getByText("Kon dit bericht niet versturen.")).toBeTruthy());
    // The typed text is back in the input, not lost.
    expect(screen.getByPlaceholderText("Typ een bericht...").value).toBe("Hallo, ben je er nog?");
    expect(screen.queryByText("network error")).toBeNull();
  });

  it("clears the draft and shows no error on a successful send", async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(undefined);
    renderSheet();
    const input = await screen.findByPlaceholderText("Typ een bericht...");
    fireEvent.change(input, { target: { value: "Hallo!" } });
    fireEvent.click(screen.getByRole("button", { name: "Verstuur bericht" }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(screen.getByPlaceholderText("Typ een bericht...").value).toBe("");
    expect(screen.queryByText("Kon dit bericht niet versturen.")).toBeNull();
  });
});

// Found by code audit: fetchMessages() throws on a real Postgres error, and the initial
// refresh() call in the mount effect had no catch of its own -- a genuine unhandled
// promise rejection, with messages stuck at null forever meaning even the "no messages
// yet" empty state never showed either, just a blank chat area with no explanation.
describe("ConversationSheet — initial load failure", () => {
  it("renders the real conversation once messages load successfully", async () => {
    fetchMessagesMock.mockResolvedValueOnce([
      { id: "m1", senderId: "person-1", body: "Hallo!", createdAt: 1, translations: {} },
    ]);
    renderSheet();
    await waitFor(() => expect(screen.getByText("Hallo!")).toBeTruthy());
  });

  it("shows a generic localized message and a real retry, never an infinite blank chat, when the load fails", async () => {
    fetchMessagesMock.mockRejectedValueOnce(new Error("relation \"messages\" does not exist"));
    renderSheet();

    await waitFor(() => expect(screen.getByText("Er ging iets mis bij het laden van klussie. Probeer het opnieuw.")).toBeTruthy());
    expect(screen.queryByText(/does not exist/)).toBeNull();
    expect(screen.queryByText("Nog geen berichten.")).toBeNull();

    fetchMessagesMock.mockResolvedValueOnce([
      { id: "m1", senderId: "person-1", body: "Hallo!", createdAt: 1, translations: {} },
    ]);
    fireEvent.click(screen.getByText("Opnieuw proberen"));

    await waitFor(() => expect(screen.getByText("Hallo!")).toBeTruthy());
  });
});

// Found by code audit: markConversationRead() throws on a real Postgres error, and both
// call sites (mount, and the realtime subscription's own callback) invoked it with no
// catch at all -- a genuine unhandled promise rejection on every failure. Best-effort,
// deliberately, matching markConversationNotificationsSeen()'s own documented restraint:
// marking read/seen is a courtesy update, never something the customer sees a retry for.
describe("ConversationSheet — marking read is best-effort", () => {
  it("still renders the real conversation when markConversationRead fails, never an unhandled rejection", async () => {
    vi.mocked(markConversationRead).mockRejectedValueOnce(new Error("network error"));
    fetchMessagesMock.mockResolvedValueOnce([
      { id: "m1", senderId: "person-1", body: "Hallo!", createdAt: 1, translations: {} },
    ]);
    renderSheet();

    await waitFor(() => expect(screen.getByText("Hallo!")).toBeTruthy());
  });
});
