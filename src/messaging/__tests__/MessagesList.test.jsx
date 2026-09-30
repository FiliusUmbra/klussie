// MessagesList.jsx's own tests. No prior test file existed for this component; added
// alongside the counterpart-fallback fix (2026-09-07, found live checking Berichten):
// a conversation whose counterpart has no resolvable name used to show the literal,
// untranslated English phrase "Klussie user" here — lib/messages.js's own header
// explains where that came from and why it's fixed at the render side instead.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { LangContext } from "../../lib/lang";
import { MessagesList } from "../MessagesList.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = { t, serviceInfo: (id) => ({ name: `service:${id}`, blurb: "" }) };

function renderList(conversations, { onOpen = vi.fn(), ...rest } = {}) {
  render(
    <LangContext.Provider value={ctx}>
      <MessagesList conversations={conversations} onOpen={onOpen} {...rest} />
    </LangContext.Provider>
  );
  return { onOpen };
}

const CONVO = { id: "c1", otherName: "Pierre Pro", unreadCount: 0, serviceId: "svc-1", lastMessage: null };

describe("MessagesList", () => {
  it("shows the empty state when there are no conversations", () => {
    renderList([]);
    expect(screen.getByText("messagesEmpty")).toBeTruthy();
  });

  it("shows the counterpart's own real name when one resolved", () => {
    renderList([CONVO]);
    expect(screen.getByText("Pierre Pro")).toBeTruthy();
  });

  it("falls back to the translated placeholder, not a blank row, when otherName is null", () => {
    renderList([{ ...CONVO, otherName: null }]);
    expect(screen.getByText("counterpartFallbackName")).toBeTruthy();
  });

  it("calls onOpen with the whole conversation when a row is clicked", () => {
    const { onOpen } = renderList([CONVO]);
    fireEvent.click(screen.getByText("Pierre Pro"));
    expect(onOpen).toHaveBeenCalledWith(CONVO);
  });

  // UX redesign, 2026-09-28 — the empty state used to have no onward action at all.
  // Both callbacks are optional (the professional side wires neither yet), so the base
  // "no props" case above (no button rendered) still has to keep passing unchanged.
  describe("empty-state contextual action (customer side)", () => {
    it("renders no action at all when neither callback is given", () => {
      renderList([]);
      expect(screen.queryByText("messagesViewRequestsBtn")).toBeNull();
      expect(screen.queryByText("requestsEmptyCta")).toBeNull();
    });

    it("offers 'View your requests' when the customer already has real requests", () => {
      const onViewRequests = vi.fn();
      renderList([], { hasRequests: true, onViewRequests, onCreateRequest: vi.fn() });

      fireEvent.click(screen.getByText("messagesViewRequestsBtn"));

      expect(onViewRequests).toHaveBeenCalled();
    });

    it("offers 'Create a request' instead when the customer has none yet", () => {
      const onCreateRequest = vi.fn();
      renderList([], { hasRequests: false, onViewRequests: vi.fn(), onCreateRequest });

      expect(screen.queryByText("messagesViewRequestsBtn")).toBeNull();
      fireEvent.click(screen.getByText("requestsEmptyCta"));

      expect(onCreateRequest).toHaveBeenCalled();
    });
  });
});
