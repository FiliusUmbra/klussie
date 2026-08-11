// Every number klussie charges, keeps, or reports — the platform commission, Belgian
// VAT, the flexi-job tax-free ceiling, and the boost price.
//
// Extracted from src/App.jsx, where the same rounding expression was written out inline
// three times and the rates were bare literals next to the components that spent them.
// Money math is the canonical example of "no business logic in UI"
// (ENGINEERING_STANDARDS.md): a commission rate that lives in a render function is a
// commission rate nobody can test, audit, or change in one place.
//
// Everything here is pure and currency-agnostic in the sense that it never formats —
// callers still run the result through the locale formatter from the lang context.

/** Share of a booked quote klussie keeps. */
export const PLATFORM_COMMISSION_RATE = 0.12;

/** Belgian standard VAT rate, applied on the demo invoice. */
export const VAT_RATE = 0.21;

/**
 * Belgian flexi-job tax-free ceiling for 2026. Demo figure only — the tracker that
 * renders it says so, and nothing here is tax advice.
 */
export const FLEXI_TAX_FREE_THRESHOLD = 18440;

/** One week of profile promotion, in euro. */
export const BOOST_WEEKLY_PRICE = 9;

// The "typical price" band on a service is the catalog's base price widened either way.
// Named because a bare 0.8 and 1.3 in a template literal is exactly the magic number the
// standards forbid.
const TYPICAL_PRICE_LOW_FACTOR = 0.8;
const TYPICAL_PRICE_HIGH_FACTOR = 1.3;

// Money is displayed and invoiced to the cent, so every customer-facing figure rounds to
// two decimals rather than trailing a float artefact into an invoice line.
function toCents(amount) {
  return Math.round(amount * 100) / 100;
}

/** What klussie deducts from a booked quote, to the cent. */
export function platformFee(price) {
  return toCents(price * PLATFORM_COMMISSION_RATE);
}

/** What the professional receives for a booked quote, to the cent. */
export function netPayout(price) {
  return toCents(price - platformFee(price));
}

/**
 * The three lines of the demo invoice. `amount` is the quote excluding VAT, which is
 * what the professional quoted — klussie does not add VAT on top of the commission.
 */
export function invoiceTotals(price) {
  const vat = toCents(price * VAT_RATE);
  return { amount: price, vat, total: toCents(price + vat) };
}

/** Indicative price band shown on a service before any professional has quoted. */
export function typicalPriceRange(base) {
  return {
    low: Math.round(base * TYPICAL_PRICE_LOW_FACTOR),
    high: Math.round(base * TYPICAL_PRICE_HIGH_FACTOR),
  };
}

/**
 * What a professional has earned across their booked and completed jobs, after
 * commission — the figure the flexi-job tracker measures against the ceiling.
 *
 * Deliberately unrounded, matching the behaviour this replaced: it feeds a progress
 * percentage and a single rounded display figure, never an invoice line, so rounding
 * each job individually would only introduce drift the tracker doesn't need.
 */
export function netEarnings(jobs, proId) {
  return jobs.reduce((sum, request) => {
    const quote = request.quotes.find((q) => q.proId === proId);
    return sum + (quote ? quote.price * (1 - PLATFORM_COMMISSION_RATE) : 0);
  }, 0);
}

/**
 * How full the flexi-job tax-free allowance is, as a whole percentage capped at 100 —
 * the bar can fill, but it can never overflow its track.
 */
export function flexiProgressPct(earnedNet) {
  return Math.min(100, Math.round((earnedNet / FLEXI_TAX_FREE_THRESHOLD) * 100));
}
