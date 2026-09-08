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

import { sendMessage } from "../../lib/messages";
import { LangContext } from "../../lib/lang";
import { ConversationSheet } from "../ConversationSheet.jsx";

const t = { chatSendBtn: "Verstuur bericht", messagePlaceholder: "Typ een bericht...", counterpartFallbackName: "Gebruiker" };

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
});
