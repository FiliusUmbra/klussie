# Activation Ratio — the Overview screen's first real content

Scoping note, written 2026-08-25. Follows `PLATFORM_ACTIVATION_PROGRAMME.md`
§4's own formula and journey inventory directly — nothing here invents new
policy, it makes an already-decided metric computable and visible for the
first time.

## 1 · Why this, why now

Slice 5 (Trust & Safety) shipped 2026-08-23/24, and the Programme document
marks Slices 0–5 as its own definition of Beta 1's gate — but §4/§5 are
explicit that a slice is not actually "done" on ratio grounds until:

> "its row in this table crosses an agreed threshold ... **and the legacy
> write path for that journey is deleted, not merely deprecated.**"

Neither half of that gate has ever been checked, because the mechanism to
check the first half doesn't exist: the Activation Ratio is supposed to live
on Platform Operations' own **Overview** screen (`ROADMAP_C` §3.1), and no
such screen exists today — `OperatorApp.jsx` has Audit, Workspaces, Reports,
and Profile, nothing else. This work package builds that missing mechanism.

**Deliberately scoped down, matching WP 4.2's own "reachability, not a
duplicate inbox" precedent**: `ROADMAP_C` §3.1 describes a full mission-control
board — active-workspace counts, marketplace funnel health, notification
pipeline lag, a combined "needs attention" list. Building all of that is a
separate, larger undertaking. This work package builds exactly what the Beta
1 gate needs and nothing more: the Activation Ratio table, per journey, over
a window. The rest of §3.1 stays real, named, future work — not silently
folded in, not pretended already done.

## 2 · The five journeys, made concrete

§4's own table names five journeys, tracked from Slices 1–5. Each needs a
real `platform.events` `event_type` (the "real" numerator) and a real legacy
comparator (the denominator's other half). Checked directly against the
current schema and client code, not assumed:

| # | Journey | Platform event_type | Legacy comparator | Live dual-write? |
|---|---|---|---|---|
| 1 | Property/asset recorded | `property.asset.created` | `public.household_items` rows created | **Yes** — `ItemFormSheet.jsx` (`src/home/`) still writes here; WP 1.9 (retiring it) is deliberately deferred, waiting on a production observation window |
| 2 | Request → booking | `marketplace.request.created` | `public.service_requests` rows created | **Yes** — `src/lib/requests.js` dual-writes both on every `createRequest()` call (WP 2.6's own bridge) |
| 3 | Work performed → Service Record | `service_record.service_record.created` | *(see §2.1 below — no legacy table predates this journey)* | N/A |
| 4 | Conversation | `conversation.conversation.opened` | `public.conversations` rows created | **No** — checked directly: no client code and no server-side trigger writes here any more (only the original 0001/0012 seed migrations ever did) |
| 5 | Report / dispute | `safety.case.filed` | `public.reports` rows created | **No** — `ReportSheet.jsx`/`src/lib/reports.js` call `fileCase()` only; the legacy table has had zero real writers since WP 5.1 |

Journeys 4 and 5 are expected to read at or near 100% for any recent window
— that is the *correct* reading for a slice whose client cutover is
genuinely finished, not a bug in the metric. Journeys 1 and 2 are expected to
read close to 50%, because every real action currently writes to **both**
places (a bridge, not two competing flows) — until the bridge write is
deleted, the formula cannot read above ~50% by construction. That is exactly
the worked example §4 itself gives ("a journey fully cut over reads 100%"),
not a flaw in this design.

### 2.1 · Journey 3 has no legacy table — measured differently, honestly

Service Records (Epic 11) are a wholly new capability; nothing before them
recorded "what happened to the boiler" in a structured way. §4's own formula
(`platform ÷ (platform + legacy)`) has no legacy half to divide by here.
Rather than force a fabricated denominator, this journey is measured against
**completed engagements in the same window** instead:

```
Journey 3 ratio = count(service_record.service_record.created, window)
                  ÷ count(work.engagements where status = 'completed'
                          and completed_at in window)
```

This answers a different, still honest question — "of the jobs that
finished, how many actually got a real Service Record" — labeled distinctly
in the UI as completion adoption, not legacy replacement, so it is never
misread as the same kind of number as the other four rows.

## 3 · The read path

One new function, following `platform.list_audit_records()`'s (0133) own
established shape exactly — same EXISTS-gated operator check, same
`stable`/no-`SECURITY DEFINER` split, same "zero rows for a non-operator
caller, never an exception" posture:

```sql
platform.activation_ratios_for_caller(p_window_days integer default 30)
returns table (
  journey_key      text,
  platform_count   bigint,
  legacy_count     bigint,
  ratio            numeric,   -- null when both counts are zero — "not started", not 0/0
  window_from      timestamptz,
  window_to        timestamptz
)
```

**Deliberately a read, not a `_for_caller` write wrapper** — no new role
distinction applies here. A support-access grant reading this table is the
same "read-only by default" posture already established for
`list_audit_records()`/`search_workspaces()`/Trust & Safety's own reads (see
`SUPPORT_ACCESS_DESIGN.md` §1.3(b)) — not re-litigated, just followed.

`ratio` is `null`, not `0`, when a journey has produced nothing at all in the
window (division by zero) — matching §4's own "reads 0%, honestly, rather
than being invisible" only for a journey that has *started but stalled*; a
journey with literally nothing yet is a distinct, more honest state than
"stalled at zero."

## 4 · The screen

A new **Overview** tab on `OperatorApp.jsx`, first in the tab order (per
`ROADMAP_C` §3.1's own "front door" framing) and the new default landing tab
— replacing Audit as where an operator lands first. Five rows, one per
journey: platform count, legacy count, the ratio as a percentage bar, and the
window (fixed at 30 days for this first cut — no filter UI yet, matching
`list_audit_records()`'s own "sufficient for this work package's screen,
nothing more" precedent).

## 5 · What this does not do — named, not silently skipped

- **Does not decide a threshold.** §4 is explicit this is "a real product
  decision, not set by this document." This screen makes the number visible;
  it does not gate anything on it.
- **Does not delete any legacy write path.** `household_items` and
  `service_requests` dual-writes stay exactly as they are — deleting either
  is real, consequential, separately-scoped work, not a side effect of
  building a dashboard.
- **Does not build the rest of `ROADMAP_C` §3.1** — active-workspace counts,
  marketplace funnel health, notification pipeline lag, the combined "needs
  attention" list are all still real, unbuilt, future work.
- **No window picker, no per-workspace breakdown, no trend-over-time
  chart.** A single fixed 30-day snapshot is the whole of this cut.
