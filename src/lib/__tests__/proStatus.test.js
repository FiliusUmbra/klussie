// Two of these three decide what work a professional is allowed to see and take, which
// makes them compliance rules rather than styling. The third decides whether klussie
// claims a professional is being promoted.
import { describe, it, expect } from "vitest";
import {
  SPECIALIST_CATEGORY_ID,
  PRO_TYPE_FLEXI,
  isBoosted,
  offeredCategoryIds,
  isCategoryLocked,
} from "../proStatus.js";

describe("isBoosted", () => {
  const now = new Date("2026-08-11T12:00:00Z");

  it("is active while the promotion still has time left", () => {
    expect(isBoosted({ boosted_until: "2026-08-18T12:00:00Z" }, now)).toBe(true);
  });

  it("expires the moment the window closes", () => {
    // Not "on or after" — a boost that ended is over, and showing it as active would
    // claim placement the professional is no longer getting.
    expect(isBoosted({ boosted_until: "2026-08-11T12:00:00Z" }, now)).toBe(false);
    expect(isBoosted({ boosted_until: "2026-08-04T12:00:00Z" }, now)).toBe(false);
  });

  it("is false for a profile that has never been boosted", () => {
    expect(isBoosted({ boosted_until: null }, now)).toBe(false);
    expect(isBoosted({}, now)).toBe(false);
    expect(isBoosted(null, now)).toBe(false);
  });

  it("returns a real boolean, not a truthy timestamp", () => {
    expect(isBoosted({ boosted_until: "2026-08-18T12:00:00Z" }, now)).toStrictEqual(true);
  });
});

describe("offeredCategoryIds", () => {
  const services = [
    { id: "s1", cat: "plumbing" },
    { id: "s2", cat: "plumbing" },
    { id: "s3", cat: "painting" },
  ];

  it("collapses offered services down to their distinct categories", () => {
    expect(offeredCategoryIds(["s1", "s2", "s3"], services).sort()).toEqual(["painting", "plumbing"]);
  });

  it("drops a service the catalog no longer has", () => {
    // A stale row must not widen a professional's lead feed to a category they never
    // chose — or, worse, put an undefined in the realtime subscription filter.
    expect(offeredCategoryIds(["s1", "gone"], services)).toEqual(["plumbing"]);
  });

  it("returns nothing for a professional who has selected no services yet", () => {
    expect(offeredCategoryIds([], services)).toEqual([]);
    expect(offeredCategoryIds(null, services)).toEqual([]);
    expect(offeredCategoryIds(undefined, services)).toEqual([]);
  });
});

describe("isCategoryLocked", () => {
  it("closes certified work to flexi-job workers", () => {
    expect(isCategoryLocked(SPECIALIST_CATEGORY_ID, PRO_TYPE_FLEXI)).toBe(true);
  });

  it("opens it to registered businesses", () => {
    expect(isCategoryLocked(SPECIALIST_CATEGORY_ID, "business")).toBe(false);
  });

  it("locks nothing else, whatever the registration type", () => {
    expect(isCategoryLocked("plumbing", PRO_TYPE_FLEXI)).toBe(false);
    expect(isCategoryLocked("painting", "business")).toBe(false);
  });
});
