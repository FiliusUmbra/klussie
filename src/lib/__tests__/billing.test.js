// Money is the one place where "close enough" is a bug report. These tests pin the
// rounding and the rates, so a refactor that moves this math somewhere else has to keep
// producing the same cents.
//
// platformFee()/netPayout() are gone — superseded by the real, capped, first-job-only
// acquisition fee (commerce.acquisition_fee_assessments, Payments Slice A). See
// billing.js's own header for the full reconciliation note; their pinned-rate tests
// (platformFee(100) === 12, etc.) are removed with them, not left testing a function
// that no longer exists.
import { describe, it, expect } from "vitest";
import {
  PLATFORM_COMMISSION_RATE,
  VAT_RATE,
  FLEXI_TAX_FREE_THRESHOLD,
  invoiceTotals,
  typicalPriceRange,
  netEarnings,
  flexiProgressPct,
} from "../billing.js";

describe("rates", () => {
  it("holds the published figures the UI quotes to users", () => {
    // Changing any of these changes what klussie charges. They are pinned so that a
    // change is a deliberate edit to this test, never an accident in a component.
    expect(PLATFORM_COMMISSION_RATE).toBe(0.12);
    expect(VAT_RATE).toBe(0.21);
    expect(FLEXI_TAX_FREE_THRESHOLD).toBe(18440);
  });
});

describe("invoiceTotals", () => {
  it("adds VAT on top of the quote rather than carving it out", () => {
    // The professional quoted 100 excluding VAT; the customer owes 121.
    expect(invoiceTotals(100)).toEqual({ amount: 100, vat: 21, total: 121 });
  });

  it("rounds VAT to the cent", () => {
    expect(invoiceTotals(65)).toEqual({ amount: 65, vat: 13.65, total: 78.65 });
  });

  it("keeps the total consistent with the lines above it", () => {
    const { amount, vat, total } = invoiceTotals(87.5);
    expect(total).toBeCloseTo(amount + vat, 10);
  });
});

describe("typicalPriceRange", () => {
  it("brackets the catalog base price and returns whole euro", () => {
    expect(typicalPriceRange(100)).toEqual({ low: 80, high: 130 });
    expect(typicalPriceRange(65)).toEqual({ low: 52, high: 85 });
  });

  it("always returns a range in the right order", () => {
    for (const base of [1, 40, 65, 300]) {
      const { low, high } = typicalPriceRange(base);
      expect(low).toBeLessThanOrEqual(high);
    }
  });
});

describe("netEarnings", () => {
  const job = (proId, price) => ({ quotes: [{ proId, price }] });

  it("counts only this professional's own quote on each job", () => {
    const jobs = [job("me", 100), job("someone-else", 500)];
    expect(netEarnings(jobs, "me")).toBeCloseTo(88, 10);
  });

  it("ignores a job this professional never quoted on", () => {
    expect(netEarnings([{ quotes: [] }], "me")).toBe(0);
  });

  it("returns nothing for a professional with no jobs at all", () => {
    expect(netEarnings([], "me")).toBe(0);
  });

  it("sums across jobs after commission", () => {
    expect(netEarnings([job("me", 100), job("me", 200)], "me")).toBeCloseTo(264, 10);
  });
});

describe("flexiProgressPct", () => {
  it("reports how full the tax-free allowance is", () => {
    expect(flexiProgressPct(0)).toBe(0);
    expect(flexiProgressPct(FLEXI_TAX_FREE_THRESHOLD / 2)).toBe(50);
    expect(flexiProgressPct(FLEXI_TAX_FREE_THRESHOLD)).toBe(100);
  });

  it("caps at 100 so the bar can fill but never overflow its track", () => {
    expect(flexiProgressPct(FLEXI_TAX_FREE_THRESHOLD * 3)).toBe(100);
  });
});
