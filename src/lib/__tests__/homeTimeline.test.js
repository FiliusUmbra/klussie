// My Home V1 claims to be the customer's real property record, which makes "never invent
// anything" the property worth testing hardest. Every case below is either "this is real,
// show it" or "this is absent, say so" — there is no third branch, by design.
import { describe, it, expect } from "vitest";
import {
  propertySummary,
  openWork,
  finishedWork,
  trustedProfessionals,
  reviewsGiven,
  aiSummaries,
  requestsWithPossiblePhotos,
  homeHistory,
} from "../homeTimeline.js";

const req = (over) => ({
  id: "r",
  serviceId: "svc-1",
  status: "collecting",
  quotes: [],
  review: null,
  bookedProId: null,
  answers: {},
  createdAt: 1000,
  ...over,
});

const pro = (id, name) => ({ id, name, initials: name[0], avatarUrl: null, rating: 4.5, reviews: 3 });

const bookedJob = (id, proId, createdAt, over = {}) =>
  req({
    id,
    status: "completed",
    createdAt,
    bookedProId: proId,
    quotes: [{ id: `q-${id}`, proId, price: 100, pro: pro(proId, `Pro ${proId}`) }],
    ...over,
  });

describe("propertySummary", () => {
  it("reports what klussie genuinely knows and nulls the rest", () => {
    const summary = propertySummary({ city: "Antwerp" }, [
      req({ id: "a", createdAt: 500, status: "completed" }),
      req({ id: "b", createdAt: 900 }),
    ]);
    expect(summary).toEqual({ city: "Antwerp", since: 500, totalJobs: 2, completedJobs: 1, isEmpty: false });
  });

  it("dates the property from the first request, not from the account", () => {
    // An account opened and never used has no property history to date from.
    const summary = propertySummary({ city: "Ghent" }, [req({ createdAt: 900 }), req({ createdAt: 300 })]);
    expect(summary.since).toBe(300);
  });

  it("returns a null city rather than a placeholder when the profile has none", () => {
    expect(propertySummary({}, [req({})]).city).toBeNull();
    expect(propertySummary(null, [req({})]).city).toBeNull();
  });

  it("reports genuinely empty only when there is nothing at all", () => {
    expect(propertySummary(null, []).isEmpty).toBe(true);
    expect(propertySummary({ city: "Antwerp" }, []).isEmpty).toBe(false);
    expect(propertySummary(null, [req({})]).isEmpty).toBe(false);
  });

  it("counts a reviewed job as completed", () => {
    const summary = propertySummary(null, [req({ status: "reviewed", review: { stars: 5 } })]);
    expect(summary.completedJobs).toBe(1);
  });

  it("survives an account whose requests have not loaded", () => {
    expect(propertySummary(null, undefined).totalJobs).toBe(0);
  });

  // The confirmed property's own municipality (api.my_properties(), migration 0185) is a
  // more current, structured source than the legacy free-text profile city — the same
  // correction WP 2.8 already made for the professional's own lead card. Real accounts can
  // disagree between the two (an old profile city set at signup, a property address
  // confirmed later), and the confirmed address must win.
  it("prefers the confirmed property's municipality over the legacy profile city", () => {
    const summary = propertySummary({ city: "Brussels" }, [req({})], { municipality: "Antwerpen" });
    expect(summary.city).toBe("Antwerpen");
  });

  it("falls back to the legacy profile city when no property is confirmed yet", () => {
    expect(propertySummary({ city: "Ghent" }, [req({})], null).city).toBe("Ghent");
    expect(propertySummary({ city: "Ghent" }, [req({})], { municipality: "" }).city).toBe("Ghent");
  });

  it("is not empty when only the confirmed property (no legacy city) is known", () => {
    expect(propertySummary(null, [], { municipality: "Antwerpen" }).isEmpty).toBe(false);
  });
});

describe("openWork / finishedWork", () => {
  it("splits in-progress from finished without losing or double-counting anything", () => {
    const requests = [
      req({ id: "collecting", status: "collecting" }),
      req({ id: "awaiting", status: "awaiting_pro" }),
      req({ id: "quotes", status: "quotes_ready" }),
      req({ id: "booked", status: "booked" }),
      req({ id: "done", status: "completed" }),
      req({ id: "reviewed", status: "reviewed" }),
    ];
    expect(openWork(requests).map((r) => r.id)).toEqual(["collecting", "awaiting", "quotes", "booked"]);
    expect(finishedWork(requests).map((r) => r.id)).toEqual(["done", "reviewed"]);
  });

  it("counts a booked job as in progress, not as history", () => {
    // The work has not happened yet; putting it in the record would claim it had.
    expect(finishedWork([req({ status: "booked" })])).toEqual([]);
  });

  it("orders both newest first", () => {
    const list = finishedWork([
      req({ id: "old", status: "completed", createdAt: 1 }),
      req({ id: "new", status: "completed", createdAt: 99 }),
    ]);
    expect(list.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("handles requests never loading", () => {
    expect(openWork(null)).toEqual([]);
    expect(finishedWork(undefined)).toEqual([]);
  });
});

describe("trustedProfessionals", () => {
  it("counts only professionals who were booked and finished the job", () => {
    const list = trustedProfessionals([bookedJob("j1", "peter", 100)]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ jobCount: 1, lastJobAt: 100 });
    expect(list[0].pro.id).toBe("peter");
  });

  it("ignores a professional who only quoted and lost", () => {
    // Quoting is not a relationship. Counting it would inflate the one number here that
    // is meant to mean the household actually worked with someone.
    const request = req({
      status: "completed",
      bookedProId: "peter",
      quotes: [
        { id: "q1", proId: "peter", price: 100, pro: pro("peter", "Peter") },
        { id: "q2", proId: "rival", price: 90, pro: pro("rival", "Rival") },
      ],
    });
    expect(trustedProfessionals([request]).map((e) => e.pro.id)).toEqual(["peter"]);
  });

  it("ignores a job that is booked but not yet finished", () => {
    const request = bookedJob("j1", "peter", 100, { status: "booked" });
    expect(trustedProfessionals([request])).toEqual([]);
  });

  it("ranks by how many jobs the household has given them", () => {
    const list = trustedProfessionals([
      bookedJob("j1", "peter", 10),
      bookedJob("j2", "peter", 20),
      bookedJob("j3", "anna", 30),
    ]);
    expect(list.map((e) => e.pro.id)).toEqual(["peter", "anna"]);
    expect(list[0].jobCount).toBe(2);
    expect(list[0].lastJobAt).toBe(20);
  });

  it("breaks a tie on the most recent job", () => {
    const list = trustedProfessionals([bookedJob("j1", "older", 10), bookedJob("j2", "newer", 50)]);
    expect(list.map((e) => e.pro.id)).toEqual(["newer", "older"]);
  });

  it("skips a booked job whose quote row is missing rather than inventing a professional", () => {
    const request = req({ status: "completed", bookedProId: "ghost", quotes: [] });
    expect(trustedProfessionals([request])).toEqual([]);
  });

  it("returns nothing for a household that has finished nothing", () => {
    expect(trustedProfessionals([req({ status: "collecting" })])).toEqual([]);
    expect(trustedProfessionals(null)).toEqual([]);
  });
});

describe("reviewsGiven", () => {
  it("lists only requests carrying a review, newest first", () => {
    const list = reviewsGiven([
      req({ id: "a", createdAt: 10, review: { stars: 5, text: "Great" } }),
      req({ id: "b", createdAt: 50, review: { stars: 4, text: "Good" } }),
      req({ id: "c", createdAt: 90, review: null }),
    ]);
    expect(list.map((r) => r.id)).toEqual(["b", "a"]);
    expect(list[0].review.stars).toBe(4);
  });

  it("is empty for a household that has reviewed nothing", () => {
    expect(reviewsGiven([req({})])).toEqual([]);
    expect(reviewsGiven(undefined)).toEqual([]);
  });
});

describe("aiSummaries", () => {
  it("keeps an analysis that actually says something", () => {
    const list = aiSummaries([
      req({ id: "a", answers: { aiAnalysis: { possibleCauses: ["Worn washer"] } } }),
      req({ id: "b", answers: { aiAnalysis: { recommendedMaterials: ["Sealant"] } } }),
    ]);
    expect(list.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("drops an analysis with nothing in it rather than rendering an empty card", () => {
    expect(aiSummaries([req({ answers: { aiAnalysis: { confidence: 90 } } })])).toEqual([]);
    expect(aiSummaries([req({ answers: { aiAnalysis: { possibleCauses: [], recommendedMaterials: [] } } })])).toEqual([]);
  });

  it("ignores requests that were never analysed", () => {
    expect(aiSummaries([req({ answers: {} }), req({ answers: { aiAnalysis: null } })])).toEqual([]);
  });

  it("survives a request with no answers object at all", () => {
    expect(aiSummaries([{ ...req({}), answers: undefined }])).toEqual([]);
  });
});

describe("requestsWithPossiblePhotos", () => {
  it("returns every request, newest first, without claiming any has photos", () => {
    // Photos live behind signed URLs in another table; this only says where to look.
    const list = requestsWithPossiblePhotos([req({ id: "a", createdAt: 1 }), req({ id: "b", createdAt: 9 })]);
    expect(list.map((r) => r.id)).toEqual(["b", "a"]);
    expect(list[0]).not.toHaveProperty("photos");
  });

  it("does not mutate the array it was given", () => {
    const input = [req({ id: "a", createdAt: 1 }), req({ id: "b", createdAt: 9 })];
    requestsWithPossiblePhotos(input);
    expect(input.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("handles requests never loading", () => {
    expect(requestsWithPossiblePhotos(null)).toEqual([]);
  });
});

describe("homeHistory", () => {
  it("records a finished job and its review as two separate moments", () => {
    const events = homeHistory([req({ id: "x", status: "reviewed", review: { stars: 5, text: "Great" } })]);
    expect(events.map((e) => e.kind)).toEqual(["job", "review"]);
    expect(events.map((e) => e.id)).toEqual(["job-x", "review-x"]);
  });

  it("puts the job before its own review when they share a date", () => {
    // A review cannot precede the work it is about.
    const events = homeHistory([req({ id: "x", status: "completed", review: { stars: 4, text: "ok" } })]);
    expect(events[0].kind).toBe("job");
  });

  it("orders newest first across requests", () => {
    const events = homeHistory([
      req({ id: "old", status: "completed", createdAt: 10 }),
      req({ id: "new", status: "completed", createdAt: 90 }),
    ]);
    expect(events.map((e) => e.id)).toEqual(["job-new", "job-old"]);
  });

  it("does not record work that has not happened yet", () => {
    expect(homeHistory([req({ status: "collecting" })])).toEqual([]);
    expect(homeHistory([req({ status: "booked" })])).toEqual([]);
  });

  it("still records a review on a request that is not marked finished", () => {
    // Defensive: a review is evidence the work happened, whatever the status column says.
    const events = homeHistory([req({ id: "x", status: "booked", review: { stars: 5, text: "!" } })]);
    expect(events.map((e) => e.kind)).toEqual(["review"]);
  });

  it("is empty for a brand-new account", () => {
    expect(homeHistory([])).toEqual([]);
    expect(homeHistory(undefined)).toEqual([]);
  });
});
