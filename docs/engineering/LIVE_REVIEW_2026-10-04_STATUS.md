# Live review 2026-10-04 — fix tracking

Source: `review-artifacts/Klussie-live-review-2026-10-04.md` (owner-supplied handoff). Each of the 19 items is tracked to **fixed**, **verified already resolved**, or **blocked** (with the precise reason). Updated as work lands on branch `fix-live-review-2026-10-04`.

| # | Item | Status | Root cause / what changed | Verification |
|---|---|---|---|---|
| 1 | Recurring maintenance "Klaar melden" fails | Fixed | The 2026-09-14 "projected next occurrence" entries (id = schedule id, no obligation row yet) flowed into an item's task list, so Mark done called `api.complete_maintenance_obligation` with an id that rightly doesn't exist. Projected entries are now flagged (`projected: true`) and kept out of the item's actionable task list; they show only as the schedule line with "Stop future reminders". A real obligation (generated on its due date by the 0205 nightly job, or seeded when the first date is already due) completes as before. Completing an occurrence *before* it exists is deliberately not offered. | `maintenance.test.js`, `ItemDetailSheet.test.jsx` |
| 2 | Maintenance crosses properties | Fixed | `usePropertyTwin` fetched maintenance per workspace and never scoped it. New `maintenanceForProperty()` keeps obligations on the active property's items/rooms (plus genuinely workspace-level ones); stays `null` (loading) until items and rooms are known. Request lists are intentionally account-wide (a request has its own one-time address) — see #2 follow-up below. | `maintenance.test.js`, `usePropertyTwin.test.js` |
