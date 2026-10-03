// MessagesList.jsx's own tests. No prior test file existed for this component; added
// alongside the counterpart-fallback fix (2026-09-07, found live checking Berichten):
// a conversation whose counterpart has no resolvable name used to show the literal,
// untranslated English phrase "Klussie user" here — lib/messages.js's own header
// explains where that came from and why it's fixed at the render side instead.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { LangContext } from "../../lib/lang";
import { MessagesList } from "../MessagesList.jsx";
import { messageStamp } from "../../lib/messageStamp.js";

// PageTour.jsx / usePageTour.js have their own tests — held closed here so these stay on
// the page's own concerns; the tour wiring is asserted separately below.
const tourState = vi.hoisted(() => ({ open: false, replay: vi.fn() }));
vi.mock("../../ui/usePageTour.js", () => ({ usePageTour: () => ({ open: tourState.open, finish: vi.fn(), replay: tourState.replay }) }));

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

  // Visual-refresh direction, 2026-10-01 — All / Unread. See MessagesList.jsx's own
  // header for why "Professionals" and "System" tabs deliberately don't exist.
  describe("All / Unread filter", () => {
    const READ = { ...CONVO, id: "c1", otherName: "Read Pro", unreadCount: 0 };
    const UNREAD = { ...CONVO, id: "c2", otherName: "Unread Pro", unreadCount: 2 };

    it("shows no filter at all when there are no conversations — nothing to filter", () => {
      renderList([]);
      expect(screen.queryByText("messagesFilterUnread")).toBeNull();
    });

    it("starts on All, showing every conversation", () => {
      renderList([READ, UNREAD]);
      expect(screen.getByText("Read Pro")).toBeTruthy();
      expect(screen.getByText("Unread Pro")).toBeTruthy();
    });

    it("Unread hides conversations with nothing unread, and All brings them back", () => {
      renderList([READ, UNREAD]);
      fireEvent.click(screen.getByText("messagesFilterUnread"));
      expect(screen.queryByText("Read Pro")).toBeNull();
      expect(screen.getByText("Unread Pro")).toBeTruthy();

      fireEvent.click(screen.getByText("messagesFilterAll"));
      expect(screen.getByText("Read Pro")).toBeTruthy();
    });

    it("says so, rather than showing a blank list, when nothing is unread", () => {
      renderList([READ]);
      fireEvent.click(screen.getByText("messagesFilterUnread"));
      expect(screen.getByText("messagesUnreadEmpty")).toBeTruthy();
    });

    it("marks the active filter with aria-pressed", () => {
      renderList([READ, UNREAD]);
      fireEvent.click(screen.getByText("messagesFilterUnread"));
      expect(screen.getByText("messagesFilterUnread").getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByText("messagesFilterAll").getAttribute("aria-pressed")).toBe("false");
    });
  });
});

describe("messageStamp", () => {
  const fmtDate = (ts) => `date:${new Date(ts).getFullYear()}`;
  const now = new Date(2026, 9, 2, 15, 0);
  it("shows a time of day for a message sent today", () => {
    const out = messageStamp(new Date(2026, 9, 2, 9, 5).getTime(), { fmtDate, langCode: "en", now });
    expect(out).toMatch(/9:05|09:05/);
  });
  it("shows a date for anything older", () => {
    expect(messageStamp(new Date(2026, 8, 1, 9, 5).getTime(), { fmtDate, langCode: "en", now })).toBe("date:2026");
  });
});

describe("MessagesList tour wiring", () => {
  const convo = { id: "c1", otherName: "Pierre", unreadCount: 0, lastMessage: { body: "hi", createdAt: 1 }, serviceId: null };
  const renderList = (conversations) => render(
    <LangContext.Provider value={{ t, serviceInfo: () => ({ name: "" }), fmtDate: () => "", langCode: "en" }}>
      <MessagesList conversations={conversations} onOpen={() => {}} />
    </LangContext.Provider>
  );
  it("anchors the tour on the first conversation and the filter, and offers a replay", () => {
    renderList([convo]);
    expect(document.querySelector('[data-tour="messages-first"]')).toBeTruthy();
    expect(document.querySelector('[data-tour="messages-filter"]')).toBeTruthy();
    fireEvent.click(screen.getByLabelText("helpReplayTour"));
    expect(tourState.replay).toHaveBeenCalled();
  });
});
