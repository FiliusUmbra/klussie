// The reasons a customer can give when reporting a professional.
//
// Extracted from src/App.jsx, where the list of reason codes and the map from code to
// locale key sat in two different places in the same component. These are the values that
// go into the reports table (see supabase/migrations), so the codes are contract, not
// presentation — a rename here is a migration, which is exactly why they deserve a module
// rather than an array literal above a sheet.

/** Reason codes, in the order they are offered. The first is the default selection. */
export const REPORT_REASONS = ["no_show", "poor_quality", "billing_issue", "other"] as const;

/**
 * A reason code this client knows about.
 *
 * Derived from REPORT_REASONS rather than written out a second time, so the codes stay
 * defined in exactly one place — the same reason this module exists at all.
 */
export type ReportReason = (typeof REPORT_REASONS)[number];

// Keys into `t` — copy never lives in src/lib.
//
// Typed by ReportReason so that adding a code without adding its locale key fails to
// compile. The test asserts the same thing at runtime; this makes it a build error first.
const REASON_LABEL_KEYS: Record<ReportReason, string> = {
  no_show: "reportReasonNoShow",
  poor_quality: "reportReasonPoorQuality",
  billing_issue: "reportReasonBillingIssue",
  other: "reportReasonOther",
};

/** Locale key naming a reason code, or undefined for a code this client doesn't know. */
export function reportReasonLabelKey(reason: string): string | undefined {
  // Widened at the lookup rather than narrowing `reason`: a code arriving from a stored
  // row may genuinely not be one this client knows, and the undefined that comes back is
  // the honest answer — not a case to assert away.
  return (REASON_LABEL_KEYS as Record<string, string | undefined>)[reason];
}
