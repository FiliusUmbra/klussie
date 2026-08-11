// "Vandaag voor jouw woning" is only trustworthy if it picks the right thing and
// never invents one — both of which are decisions in this module rather than in the
// card that renders them, which is why they are testable without React.
import { describe, it, expect } from "vitest";
import { pickTodayItem, activeRequests, completedWork, kindOf } from "../homeToday.js";

const req = (over) => ({ id: "r", status: "collecting", quotes: [], review: null, createdAt: 1000, ...over });

describe("pickTodayItem", () => {
  it("returns nothing at all for an account with no requests", () => {
    expect(pickTodayItem([])).toBeNull();
    expect(pickTodayItem(undefined)).toBeNull();
  });

  it("prefers the decision that is blocking the job over one that is merely waiting", () => {
    const picked = pickTodayItem([
      req({ id: "waiting", status: "collecting" }),
      req({ id: "blocking", status: "quotes_ready", quotes: [{ id: "q1" }] }),
    ]);
    expect(picked.kind).toBe("quotes_ready");
    expect(picked.request.id).toBe("blocking");
  });

  it("ranks a booked job above one still out with a single professional", () => {
    const picked = pickTodayItem([
      req({ id: "directed", status: "awaiting_pro" }),
      req({ id: "booked", status: "booked" }),
    ]);
    expect(picked.request.id).toBe("booked");
  });

  it("does not treat quotes_ready with no quotes on it as a decision to make", () => {
    // The status can run ahead of the rows in a realtime update; claiming quotes are
    // waiting when none are there would send the customer to an empty screen.
    const picked = pickTodayItem([req({ status: "quotes_ready", quotes: [] })]);
    expect(picked).toBeNull();
  });

  it("asks for a review only while one is genuinely missing", () => {
    expect(pickTodayItem([req({ status: "completed", review: null })]).kind).toBe("needs_review");
    expect(pickTodayItem([req({ status: "completed", review: { stars: 5 } })])).toBeNull();
  });

  it("ignores statuses that need nothing from anybody", () => {
    expect(pickTodayItem([req({ status: "reviewed", review: { stars: 4 } })])).toBeNull();
  });

  it("breaks a tie on the newer request, not an arbitrary array order", () => {
    const picked = pickTodayItem([
      req({ id: "older", status: "booked", createdAt: 10 }),
      req({ id: "newer", status: "booked", createdAt: 99 }),
    ]);
    expect(picked.request.id).toBe("newer");
  });
});

describe("activeRequests", () => {
  it("lists what is still running, newest first, minus the one already surfaced", () => {
    const list = activeRequests([
      req({ id: "a", status: "collecting", createdAt: 1 }),
      req({ id: "b", status: "booked", createdAt: 5 }),
      req({ id: "done", status: "reviewed", createdAt: 9 }),
    ], "b");
    expect(list.map((r) => r.id)).toEqual(["a"]);
  });

  it("excludes finished work so 'in progress' means in progress", () => {
    const list = activeRequests([req({ id: "c", status: "completed" })], null);
    expect(list).toEqual([]);
  });
});

describe("completedWork", () => {
  it("returns finished jobs newest first and nothing else", () => {
    const list = completedWork([
      req({ id: "old", status: "completed", createdAt: 1 }),
      req({ id: "new", status: "reviewed", createdAt: 7 }),
      req({ id: "running", status: "booked", createdAt: 9 }),
    ]);
    expect(list.map((r) => r.id)).toEqual(["new", "old"]);
  });
});

describe("kindOf", () => {
  it("names the kind for a single request, or null when nothing applies", () => {
    expect(kindOf(req({ status: "awaiting_pro" }))).toBe("awaiting_pro");
    expect(kindOf(req({ status: "reviewed", review: { stars: 3 } }))).toBeNull();
  });
});
