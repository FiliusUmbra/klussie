# Family coordination — first release

Family is reachable from the application header and `/app/family`. The URL survives refresh and supports browser Back. Family workspaces are independent of personal/professional workspaces and physical properties. No family membership grants property or professional access.

## Delivered

- Create a family or join using a single-use code. Codes expire after seven days, are stored as hashes, and can be revoked by the organiser. No messages or emails are sent automatically.
- Adult logins use real workspace memberships. Organisers can add managed adult/child profiles for assignment without login accounts; these do not confer access.
- Shared named lists, assigned items, completion/reopen, edit and archive.
- Assigned chores with optional due dates and repeat-after-completion intervals of 1, 7, 14 or 30 days. A recurring completion advances to `max(previous due date, local completion date) + interval`; it does not generate missed occurrences.
- Today shows due/overdue tasks and today's/upcoming plans.
- All-day calendar plans and inclusive, multi-day holidays. Calendar dates remain dates across time zones. Calendar month layout uses the Gregorian calendar and Monday-first weeks.
- Automatic refresh every 30 seconds and on window focus; manual refresh is always available. Open form drafts survive refreshes and failed saves.
- Dutch and English copy. Other app languages intentionally fall back to a complete English Family interface for this first release.

## Data and access

Private `family` schema, RLS enabled with no direct client table access. Thin authenticated-only `api.family_snapshot` and `api.family_command` delegates follow ADR-0026. All read/write operations derive the caller from `identity.identities` and check the existing workspace permission engine and `family_coordination` capability. No user-metadata authorization.

`family` is an additional workspace type. Owner permissions include invitations/member removal; member permissions include shared records. Managed child profiles have no membership. Removed members lose access on the next database call. A failed permission refresh clears the rendered data.

Writes use client-generated identifiers, idempotency receipts and canonical audit events. Task/event versions reject conflicting edits. Recurring completion is locked and versioned to prevent a duplicate completion from advancing twice. Cross-family assignment/list references are rejected. Archive is soft retirement; there is no end-user archive recovery screen yet.

The migration was generated with the Supabase CLI and its filename aligned with the version recorded when applied to **klussie-staging**. Production is unchanged.

## Verification

`supabase/tests/family_coordination.sql` runs inside BEGIN/ROLLBACK against synthetic identities: creation, retries, lists, completion/reopen, recurrence, holidays, owner/member permissions, outsider isolation, single-use invitations and immediate access revocation. It creates no durable test accounts or records.

Frontend tests cover local dates/year boundaries, holiday spans, due filtering, retained drafts, optimistic versions, selected calendar dates, role-based controls, out-of-order family loads, no stale records during family switching, access revocation and retry command identity.

Security advisors flag private deny-all tables and the two intentionally authenticated SECURITY DEFINER API delegates. These match the existing architecture: all grants and allow/deny behavior are exercised by the database contracts. Existing unrelated project advisories are not changed by this feature.

## Next slices

Shared budget and holiday savings with separate financial permissions; timed calendar events/calendar connections; notifications/reminders; rotating chore schedules; child login/access design; complete localization; pagination for long histories; archive recovery and family ownership transfer/closure. None are advertised as functioning controls in this release.

Retention is the intended product outcome. Measure repeat weekly family use and task completion from aggregate command events; never record task titles, invitation codes or calendar notes in analytics. No improvement claim is made without a measured baseline.
