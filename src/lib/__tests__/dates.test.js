// Found by code audit, 2026-09-11, while fixing ServiceRecordEditorSheet.jsx's own
// UTC-vs-local "today" bug: two more call sites (ItemDetailSheet.jsx's WarrantyLine,
// panelParts.jsx's DocumentRowContent) compared a date-only "YYYY-MM-DD" value to "now"
// with `new Date(dateOnly) < new Date()` — dates.js's own header explains why that reads
// as expired for most of the actual day it expires, for any timezone ahead of UTC
// (every timezone klussie's own Belgian users are ever in).
import { describe, it, expect, vi, afterEach } from "vitest";
import { isPastLocalDate, todayLocalDateString } from "../dates.js";

describe("todayLocalDateString", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("reads the viewer's own local calendar day, not the UTC one", () => {
    vi.stubEnv("TZ", "Europe/Brussels");
    // 2026-01-01T23:30Z is already 2026-01-02 00:30 in Brussels (UTC+1 in January).
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 1, 23, 30, 0)));

    expect(todayLocalDateString()).toBe("2026-01-02");
  });
});

describe("isPastLocalDate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("returns false for no date at all", () => {
    expect(isPastLocalDate(null)).toBe(false);
    expect(isPastLocalDate(undefined)).toBe(false);
    expect(isPastLocalDate("")).toBe(false);
  });

  it("returns false for a date clearly in the future", () => {
    expect(isPastLocalDate("2099-01-01")).toBe(false);
  });

  it("returns true for a date clearly in the past", () => {
    expect(isPastLocalDate("2000-01-01")).toBe(true);
  });

  // The whole point of this helper: a date-only value is valid for the *entire* day it
  // names. `new Date("2026-09-15")` parses as UTC midnight, which in a timezone ahead of
  // UTC (Brussels, +2 in September) is already 2am local on the 15th — so from 2am local
  // onward, the old `new Date(dateOnly) < new Date()` comparison called a value expiring
  // "on the 15th" already expired for the rest of that same day. Local noon on the 15th
  // sits squarely in that window: well past the UTC-midnight instant, but still the same
  // local calendar day the value is supposed to remain valid through.
  it("treats a value expiring today as still valid at local noon, not just past local midnight", () => {
    vi.stubEnv("TZ", "Europe/Brussels");
    vi.useFakeTimers();
    // 2026-09-15T10:00Z = 2026-09-15 12:00 local (CEST, UTC+2 in September).
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 15, 10, 0, 0)));

    expect(isPastLocalDate("2026-09-15")).toBe(false);
  });

  it("treats a value from the day before as past, at that same local noon", () => {
    vi.stubEnv("TZ", "Europe/Brussels");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 15, 10, 0, 0)));

    expect(isPastLocalDate("2026-09-14")).toBe(true);
  });
});
