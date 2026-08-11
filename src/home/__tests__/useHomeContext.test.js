// The three pure decisions behind the hero and the trust strip: which greeting band
// the clock falls in, how the greeting line is assembled, and which trust signals are
// allowed on screen.
//
// Tested here rather than through the rendered page because the greeting band depends
// on the wall clock — a component test would either be flaky at 11:59 or would have to
// mock the global Date. `now` is injectable precisely so this can be exact.
import { describe, it, expect } from "vitest";
import { timeGreeting, greetingLine, trustItemsFrom } from "../useHomeContext.js";

const t = {
  greetMorning: "Goedemorgen",
  greetAfternoon: "Goedemiddag",
  greetEvening: "Goedenavond",
  homeGreetName: "{greeting}, {name}",
  homeGreetNoName: "{greeting}",
  trustVerifiedPros: "Geverifieerde vakmensen",
  trustAvgRating: "gemiddeld",
  trustTransparentPricing: "Transparante prijzen",
};

// Local time, deliberately — the greeting is about the customer's day, not UTC.
const at = (hour, minute = 0) => new Date(2026, 7, 11, hour, minute, 0);

describe("timeGreeting", () => {
  it.each([
    [0, "Goedemorgen"],
    [7, "Goedemorgen"],
    [11, "Goedemorgen"],
    [12, "Goedemiddag"],
    [15, "Goedemiddag"],
    [17, "Goedemiddag"],
    [18, "Goedenavond"],
    [23, "Goedenavond"],
  ])("says the right thing at %i:00", (hour, expected) => {
    expect(timeGreeting(t, at(hour))).toBe(expected);
  });

  it("switches exactly on the hour, not a minute either side", () => {
    expect(timeGreeting(t, at(11, 59))).toBe("Goedemorgen");
    expect(timeGreeting(t, at(12, 0))).toBe("Goedemiddag");
    expect(timeGreeting(t, at(17, 59))).toBe("Goedemiddag");
    expect(timeGreeting(t, at(18, 0))).toBe("Goedenavond");
  });

  it("reads the clock when nobody passes one", () => {
    expect([t.greetMorning, t.greetAfternoon, t.greetEvening]).toContain(timeGreeting(t));
  });
});

describe("greetingLine", () => {
  it("greets the authenticated customer by first name only", () => {
    expect(greetingLine(t, "Cathy Customer", at(14))).toBe("Goedemiddag, Cathy");
  });

  it("handles a single-word name", () => {
    expect(greetingLine(t, "Cathy", at(9))).toBe("Goedemorgen, Cathy");
  });

  it("copes with the messy whitespace a free-text name field allows", () => {
    expect(greetingLine(t, "  Cathy   Customer  ", at(20))).toBe("Goedenavond, Cathy");
  });

  it("drops the name rather than leaving an empty slot when there is none", () => {
    // "Goedemiddag, " with nothing after it reads as a bug; the shorter line does not.
    expect(greetingLine(t, null, at(14))).toBe("Goedemiddag");
    expect(greetingLine(t, "", at(14))).toBe("Goedemiddag");
    expect(greetingLine(t, "   ", at(14))).toBe("Goedemiddag");
  });
});

describe("trustItemsFrom (ADR-0011)", () => {
  it("claims only transparent pricing when no platform data backs anything else", () => {
    expect(trustItemsFrom(t, null)).toEqual(["Transparante prijzen"]);
    expect(trustItemsFrom(t, { verifiedProCount: 0, ratingAvg: null })).toEqual(["Transparante prijzen"]);
  });

  it("adds the signals that do have real numbers behind them", () => {
    expect(trustItemsFrom(t, { verifiedProCount: 12, ratingAvg: 4.72 })).toEqual([
      "Geverifieerde vakmensen",
      "4.7★ gemiddeld",
      "Transparante prijzen",
    ]);
  });

  it("withholds the rating when there is no average, even with verified pros present", () => {
    expect(trustItemsFrom(t, { verifiedProCount: 3, ratingAvg: null }))
      .toEqual(["Geverifieerde vakmensen", "Transparante prijzen"]);
  });

  it("shows a genuine zero average rather than hiding it as falsy", () => {
    // 0.0★ would be alarming but true; `!= null` is what keeps it from being dropped
    // the way a loose falsy check would.
    expect(trustItemsFrom(t, { verifiedProCount: 0, ratingAvg: 0 })).toContain("0.0★ gemiddeld");
  });
});
