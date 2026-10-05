// Every number klussie charges, keeps, or reports — Belgian VAT and the flexi-job tax-free
// ceiling.
//
// Extracted from src/App.jsx, where the same rounding expression was written out inline
// three times and the rates were bare literals next to the components that spent them.
// Money math is the canonical example of "no business logic in UI"
// (ENGINEERING_STANDARDS.md): a commission rate that lives in a render function is a
// commission rate nobody can test, audit, or change in one place.
//
// Everything here is pure and currency-agnostic in the sense that it never formats —
// callers still run the result through the locale formatter from the lang context.
//
// PLATFORM_COMMISSION_RATE, platformFee() AND netPayout() ARE GONE — SUPERSEDED, NOT
// REFACTORED
//
// The monetization brief this reconciliation was done for supersedes "a flat 12% on
// every booked job" outright: the real acquisition fee (commerce.pricing_versions/
// commerce.acquisition_fee_assessments, migrations 0229-0231) is 5%, capped at €75,
// charged to the professional only on the first job with a given customer — most jobs
// now carry no fee at all. Nothing that showed the old flat figure to a customer
// (src/customer/RequestDetailSheet.jsx's own booked-quote card) can be kept accurate by
// changing a constant; it made a specific, now-false per-job claim, so it was removed
// rather than silently left wrong (Rule 9, trust beats growth). No historical financial
// record is affected — MONETIZATION.md's own "zero real revenue" was still true when
// this reconciliation happened, so there was nothing to preserve, only a demo display to
// stop showing.
//
// THE FLEXI TRACKER'S FLAT 12% IS GONE TOO (live review 2026-10-04, item 7)
//
// netEarnings() used to take a flat 12% off every job for the flexi-job tracker, which is
// the same superseded figure removed from the customer card above — and it contradicted the
// quote form, which (correctly) says the introduction fee is 5%, capped at €75, first job
// with a customer only. The Billing screen therefore told a professional two different
// things about their platform costs. The tracker now counts the GROSS quoted value of
// booked and completed jobs (grossEarnings()): the Belgian flexi ceiling is measured on
// income, not on income after an estimated platform cost, so gross is also the conservative
// reading for a tax-threshold bar. Its note says plainly what it counts and that the real
// introduction fee applies only to some jobs. No tax or accounting treatment is claimed.

/** Belgian standard VAT rate, applied on the demo invoice. */
export const VAT_RATE = 0.21;

/**
 * Belgian flexi-job tax-free ceiling for 2026. Demo figure only — the tracker that
 * renders it says so, and nothing here is tax advice.
 */
export const FLEXI_TAX_FREE_THRESHOLD = 18440;

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
 * The gross quoted value of the jobs a professional has booked or completed — what the
 * flexi-job tracker measures against the ceiling. Unrounded on purpose: it feeds a progress
 * percentage and a single rounded display figure, never an invoice line.
 */
export function grossEarnings(jobs, proId) {
  return jobs.reduce((sum, request) => {
    const quote = request.quotes.find((q) => q.proId === proId);
    return sum + (quote ? quote.price : 0);
  }, 0);
}

/**
 * How full the flexi-job tax-free allowance is, as a whole percentage capped at 100 —
 * the bar can fill, but it can never overflow its track.
 */
export function flexiProgressPct(earnedNet) {
  return Math.min(100, Math.round((earnedNet / FLEXI_TAX_FREE_THRESHOLD) * 100));
}
