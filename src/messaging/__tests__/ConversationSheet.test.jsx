// ConversationSheet.jsx's own tests.
//
// Found live during a UX review, 2026-09-07: the send button was icon-only (lucide's
// <Send>) with no visible text and no aria-label — a screen reader announced it as an
// unnamed button, unlike every other icon-only control already in the app (e.g.
// MyItemsPanel's "Ruimte toevoegen"/"Document toevoegen" section actions), which already
// name themselves this way.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/messages", () => ({
  fetchMessages: vi.fn(() => Promise.resolve([])),
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
  render(
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
  return { onClose };
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
