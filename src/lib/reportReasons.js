// The reasons a customer can give when reporting a professional.
//
// Extracted from src/App.jsx, where the list of reason codes and the map from code to
// locale key sat in two different places in the same component. These are the values that
// go into the reports table (see supabase/migrations), so the codes are contract, not
// presentation — a rename here is a migration, which is exactly why they deserve a module
// rather than an array literal above a sheet.

/** Reason codes, in the order they are offered. The first is the default selection. */
export const REPORT_REASONS = ["no_show", "poor_quality", "billing_issue", "other"];

// Keys into `t` — copy never lives in src/lib.
const REASON_LABEL_KEYS = {
  no_show: "reportReasonNoShow",
  poor_quality: "reportReasonPoorQuality",
  billing_issue: "reportReasonBillingIssue",
  other: "reportReasonOther",
};

/** Locale key naming a reason code, or undefined for a code this client doesn't know. */
export function reportReasonLabelKey(reason) {
  return REASON_LABEL_KEYS[reason];
}
