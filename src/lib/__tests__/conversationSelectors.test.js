// The translation filter is the one place in messaging where a mistake costs real money:
// every message it returns becomes a model call.
import { describe, it, expect } from "vitest";
import { unreadTotal, messagesNeedingTranslation } from "../conversationSelectors.js";

describe("unreadTotal", () => {
  it("adds up unread messages across every conversation", () => {
    expect(unreadTotal([{ unreadCount: 2 }, { unreadCount: 3 }, { unreadCount: 0 }])).toBe(5);
  });

  it("is zero for an inbox that is empty or not loaded yet", () => {
    expect(unreadTotal([])).toBe(0);
    expect(unreadTotal(null)).toBe(0);
    expect(unreadTotal(undefined)).toBe(0);
  });
});

describe("messagesNeedingTranslation", () => {
  const msg = (over) => ({ id: "m", senderId: "them", translations: {}, ...over });
  const opts = (over) => ({ userId: "me", langCode: "nl", inFlight: new Set(), ...over });

  it("picks an untranslated message from the other party", () => {
    const list = messagesNeedingTranslation([msg({ id: "a" })], opts());
    expect(list.map((m) => m.id)).toEqual(["a"]);
  });

  it("never translates the viewer's own words back to them", () => {
    expect(messagesNeedingTranslation([msg({ senderId: "me" })], opts())).toEqual([]);
  });

  it("skips a message already translated into the viewer's language", () => {
    // Paying twice for the same translation is the failure this guards against.
    const cached = msg({ id: "a", translations: { nl: "Hallo" } });
    expect(messagesNeedingTranslation([cached], opts())).toEqual([]);
  });

  it("still picks a message translated only into some other language", () => {
    const other = msg({ id: "a", translations: { fr: "Bonjour" } });
    expect(messagesNeedingTranslation([other], opts()).map((m) => m.id)).toEqual(["a"]);
  });

  it("skips a message whose translation is already in flight", () => {
    // The effect re-runs on every messages change; without this the same message is
    // dispatched again before the first call resolves.
    const inFlight = new Set(["a"]);
    expect(messagesNeedingTranslation([msg({ id: "a" })], opts({ inFlight }))).toEqual([]);
  });

  it("handles a conversation whose messages have not loaded yet", () => {
    expect(messagesNeedingTranslation(null, opts())).toEqual([]);
    expect(messagesNeedingTranslation(undefined, opts())).toEqual([]);
  });
});
