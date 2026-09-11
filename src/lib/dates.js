// A date-only value — a Postgres `date` column, or a <input type="date">'s own
// "YYYY-MM-DD" string — names a calendar day, not an instant. Comparing it to "now" the
// obvious way, `new Date(dateOnly) < new Date()`, is a well-known JS footgun: a date-only
// ISO string parses as UTC midnight (never local midnight), so for the whole span between
// UTC midnight and local midnight on that calendar day, the comparison lies. klussie's own
// users are Belgian (billing.js's own VAT rate and flexi-job ceiling are both Belgian),
// always one or two hours ahead of UTC — so a warranty or document "valid until 2026-09-15"
// read as already expired from roughly 1-2am local time onward on the 15th itself, nearly
// the entire day it was still meant to be valid. (ServiceRecordEditorSheet.jsx's own
// today() had the mirror image of this bug — a *default* date built from the UTC day
// instead of the local one — found and fixed first; this is the same underlying footgun
// on the read side.)
//
// The fix a date-only value actually needs is a calendar-day comparison, never an instant
// one: compare "YYYY-MM-DD" strings (lexically sortable, same shape) and never construct a
// Date from the date-only string at all.

/** Today's own calendar date, in the viewer's local timezone, as "YYYY-MM-DD". */
export function todayLocalDateString() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Whether a date-only "YYYY-MM-DD" value has fully passed — false for today itself, since
 * "valid until" or "due on" a day means valid for the whole of that day, not expired the
 * instant it begins. Falsy input (no date set at all) is never past.
 */
export function isPastLocalDate(dateOnly) {
  return !!dateOnly && todayLocalDateString() > dateOnly;
}
