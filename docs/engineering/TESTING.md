# Klussie — Testing & Regression Baseline

**This document owns:** what counts as a behavioural regression, the
complete inventory of the platform's current user-facing behaviour, and
which parts of it are protected by automated tests versus manual
verification. It is the artefact every future epic compares against.

It does not own the testing *strategy* per epic
(`../IMPLEMENTATION_ROADMAP.md` §8) or code rules
(`ENGINEERING_STANDARDS.md`).

> **This is a baseline, not a wish list.** Everything below describes
> what Klussie does **today**, including the parts it does wrong. A
> baseline that records intended behaviour is useless for detecting
> change.

---

## 1 · What counts as a behavioural regression

> **A behavioural regression is any change to what the platform does that
> was not the stated intent of the work package that caused it.**

The emphasis is on *stated intent*. A work package that says it changes
nothing and changes something has regressed, even if the change is an
improvement. Six categories:

| # | Category | Example |
|---|---|---|
| 1 | **Visible output** | Copy, layout, formatting, currency, dates, or which data appears on a surface |
| 2 | **State transitions** | A request, quote or job moving between states differently, or not moving |
| 3 | **Persistence** | Something written that was not, not written that was, or written with different values |
| 4 | **Visibility and access** | Who can see or do what — including a row appearing for the wrong account |
| 5 | **Lifecycle and timing** | When something appears, fires, expires or is emitted |
| 6 | **Silent fixes** | **A known defect corrected without being declared** — see §6 |

**Category 6 is the one this project has been bitten by.** During the
Engineering Health sprint, twelve places rendering literal escape text
were found and deliberately left alone, because fixing them would change
what a customer reads inside a refactor that promised not to. A refactor
that silently fixes things is a refactor whose diff cannot be trusted.

### What is *not* a regression

- Internal restructuring with identical observable output.
- Performance changes that do not alter output.
- Added tests, added documentation, added types.
- A declared, intended behaviour change, stated in the work package's
  acceptance criteria and recorded in `CHANGELOG.md`.

**The distinction is declaration, not desirability.** Fixing a bug is
good; fixing it inside a package that claimed to be behaviour-preserving
is a regression against this baseline, and should be split out.

## 2 · How to use this baseline

**Before an epic:** read §4 and §5 for the surfaces it touches.

**During:** the automated baseline runs with every `npm test`. If
`src/__tests__/regression/` fails, behaviour changed — establish whether
that was intended before doing anything else.

**After:** for each surface the epic touched, walk its §5 rows on staging.
Record the result in the epic's completion record.

**If behaviour changed intentionally:** update this document *and*
`CHANGELOG.md` in the same package. A baseline that lags reality protects
nothing.

## 3 · The automated baseline

`src/__tests__/regression/` holds tests whose only job is to detect
unintended change. They assert **current** behaviour, not correct
behaviour.

| File | Protects |
|---|---|
| `knownDefects.test.js` | The defects in §6, so none is fixed silently |
| `baselineCoverage.test.js` | This document's completeness — a new surface that is not listed here fails the build |

**`baselineCoverage.test.js` is what stops this document rotting.** The
acceptance criterion for the baseline is *"no flow is unlisted"*, and a
promise to keep a list current is worth very little. That test makes the
promise mechanical.

### 3.1 · SQL diagnostics — added in Epic 01, extended in Epic 02

`npm test` runs no database. Epic 01 created schemas, partitioned tables,
grants, an emission function and consumer storage, and **none of what
those do is visible in their SQL text** — a grant's effect, a partition's
routing, an append-only guard's refusal. So the epic added a second
verification layer under `supabase/diagnostics/`, run with `psql` against
staging:

| Diagnostic | Verifies |
|---|---|
| `VERIFY_GRANTS.sql` | Engine ownership: each role reaches its own schema and no other |
| `VERIFY_EXTENSIONS.sql` | `ltree` and `pg_cron` installed, and **no** extension anywhere in `public` |
| `VERIFY_EVENTS.sql` | Envelope shape, partitioning, append-only, routing, refusals, empty default partitions |
| `VERIFY_AUDIT.sql` | Record shape, writable by nobody, both scopes in one table, immutability |
| `VERIFY_EMISSION.sql` | An event in a rolled-back transaction does not exist; a committed one does |
| `VERIFY_CONSUMERS.sql` | Cursors advance, nobody can delete one, open quarantines are surfaced |
| `VERIFY_IDENTITY.sql` | The identity row's shape; **no table anywhere foreign-keys to it** |
| `VERIFY_IDENTITY_BACKFILL.sql` | One identity per profile; re-running mints nothing |
| `VERIFY_IDENTITY_DUAL_WRITE.sql` | Drives the **real signup trigger**: one signup, one identity, transactionally |
| `VERIFY_IDENTITY_READ_PATH.sql` | Both sources agree for every person; contacts unreachable; `identity` off the API surface |
| `VERIFY_IDENTITY_ERASURE.sql` | Personal data gone, reference still a key, **no cascade** |
| `RECONCILE_IDENTITY.sql` | **A gate, not a report** — blocks the read switch, and refuses to pass on an empty database |

```bash
psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_EVENTS.sql
```

Each check raises an exception naming what is wrong, so `ON_ERROR_STOP=1`
turns the file into a pass/fail gate. Connection details are in
`../operations/POSTGRES_TOOLS_WINDOWS.md` §5.

**Two of these are ongoing operational checks rather than one-time
acceptance**, and will start mattering the moment anything writes: an
occupied default partition means a time range was missing when a row was
written, and an open quarantine means a consumer set an event aside and
is waiting for a person.

> **A gate's characteristic failure is passing.** `RECONCILE_IDENTITY.sql`
> refuses to run against a database with no profiles, because zero
> discrepancies over zero rows reads exactly like success and would clear
> the one package that can regress the product.
>
> **The discipline that goes with them: prove a check can fail before
> trusting it.** Every gate in Epic 01 was probed by deliberately breaking
> what it asserts and confirming the failure, then reverting. That
> discipline found a real defect — two diagnostics whose failure paths
> raised a PostgreSQL type error instead of their intended message,
> because `array || 'literal'` is ambiguous. The gates still failed
> closed; the messages were wrong, on exactly the paths someone reads
> under pressure. **A probe that exercises one branch of a check has
> verified one branch.**
>
> In Epic 02 the same discipline found four defects no test run would
> have surfaced: a read path that would have put erased people's names
> back on screen, two `SECURITY DEFINER` functions callable anonymously,
> a profile merge that dropped the onboarding flags, and a privacy check
> of my own that passed while checking nothing.

## 4 · Automated coverage today

561 tests across 42 files, plus the regression suite and the twelve SQL
scripts above. Coverage is uneven, and the shape of it matters more
than the number:

| Area | Automated coverage |
|---|---|
| `src/lib/*` — rules, pricing, status, matching, i18n parity | **Strong.** Every module has unit tests |
| Homepage, conversation home, onboarding, Property Memory panels | **Strong.** 111 render tests across three files |
| Design system capture components | **Partial.** 19 tests |
| Migration structure — schemas, grants, extensions, events, audit, emission, cursors, identity, backfill, erasure | **Strong.** 76 tests reading the frozen documents and ADRs, so a migration diverging from them fails the build |
| Identity read path and dual-write | **Strong.** 28 tests — the merged profile's shape, identity winning over profiles, erased people resolving to nothing |
| Consumer scaffolding — resumption, redelivery window, quarantine | **Strong.** 13 tests |
| Supabase client configuration | **Strong.** 9 tests; validation at startup and at first use |
| **`src/customer` (11 components)** | **None** |
| **`src/pro` (5 components)** | **None** |
| **`src/auth` (3), `src/profile` (6)** | **None** |
| **`src/messaging` (2), `src/requests` (4)** | **None** |

**Thirty-one user-facing components have no render test.** That is the
existing debt in `../MASTER_CONTEXT.md` §12 — *"their rules are tested,
their markup is not"* — and it is why §5 exists and is long. Closing it
is tracked separately as a Phase 2 item; **this baseline records the gap
rather than pretending to fill it.**

## 5 · Manual verification list

**The complete inventory of user-facing flows.** Every one is either
automated (§4) or listed here. Walk the rows relevant to what changed.

### 5.1 · Authentication and entry

| # | Flow | Surface |
|---|---|---|
| A1 | Welcome screen renders for a signed-out visitor | `WelcomeScreen` |
| A2 | Sign up with email and password | `EmailAuthSheet` |
| A3 | Sign in with existing credentials | `EmailAuthSheet` |
| A4 | Invalid credentials show an error, not a crash | `EmailAuthSheet` |
| A5 | Role selection appears exactly once for a new account | `RoleSelectionScreen` |
| A6 | Choosing "professional" routes to the pro app | `RoleSelectionScreen`, `AppShell` |
| A7 | Sign out returns to the welcome screen | `AppShell` |
| A8 | Session survives a page reload | `AppShell` |

### 5.2 · Customer — home and intake

| # | Flow | Surface |
|---|---|---|
| C1 | Home renders hero, section tabs and "today" card | `ConversationHome` *(automated)* |
| C2 | First-login tour appears once | `CustomerOnboarding` *(automated)* |
| C3 | Describe a job as free text | `ConversationCanvas` *(automated)* |
| C4 | Voice capture produces a transcript | `VoiceCapturePanel` *(partial)* |
| C5 | Photo capture attaches an image | `PhotoCapturePanel` *(partial)* |
| C6 | AI analysis returns a structured, editable draft | `AiIntakeSheet` |
| C7 | Low-confidence analysis asks follow-up questions | `AiIntakeSheet` |
| C8 | AI failure degrades to the manual form, no dead end | `AiIntakeSheet`, `ServiceSheet` |
| C9 | Structured per-service questions render for the chosen service | `ServiceSheet` |
| C10 | Submitting creates a request in `collecting` | `ServiceSheet` |
| C11 | One-tap booking creates a directed request | `ConversationHome` *(automated)* |

### 5.3 · Customer — requests, quotes and completion

| # | Flow | Surface |
|---|---|---|
| C12 | Requests list shows the customer's own requests only | `RequestsList` |
| C13 | Status pill matches the request's state | `StatusPill` |
| C14 | Request detail shows the timeline for its status | `RequestDetailSheet` |
| C15 | Photos and AI summary render on the detail sheet | `RequestPhotosStrip`, `AiAnalysisSummary` |
| C16 | Incoming quotes are listed with price and pro | `RequestDetailSheet` |
| C17 | **Accepting a quote books the request, declines the others, and opens a conversation** | `RequestDetailSheet` |
| C18 | Marking complete moves the request to `completed` | `RequestDetailSheet` |
| C18a | A completed/reviewed request's Service Record shows the pro's own write-up once one exists, or an educating empty state ("your pro will write this up") for every request until WP 3.3 ships an authoring UI — plus a real Approve action against WP 3.0's write contract | `ServiceRecordSummary` *(automated)* |
| C19 | Leaving a review updates the pro's rating | `ReviewSheet` |
| C20 | Invoice shows totals, VAT and commission | `InvoiceSheet` |
| C21 | Reporting a business submits a report | `ReportSheet` |
| C22 | Discover filters the catalogue | `Discover` |

**C17 is the highest-consequence flow in the platform.** It is one
database transaction doing four things, and every schema epic touches
something it depends on.

### 5.4 · Customer — My Home and My Items

| # | Flow | Surface |
|---|---|---|
| C23 | My Home shows the derived property timeline | `MyHomePanel` *(automated)* |
| C24 | My Items lists household items | `MyItemsPanel` *(automated)* |
| C25 | Adding an item persists it with a photo | `ItemFormSheet` |
| C26 | Item categories render and filter | *(automated)* |
| C27 | Adding a room persists it under the property, nested under a chosen parent | `LocationFormSheet` |
| C28 | Adding a document uploads its file and persists it attached to the property | `DocumentUploadSheet` |

### 5.5 · Professional

**P6, corrected 2026-08-22.** Previously read "Marking a job complete
emits completion | `ProJobs`" — checked directly against the code
while investigating a flagged mismatch and found genuinely wrong, not
merely stale wording: no pro-side "mark complete" action exists
anywhere in `src/pro/*.jsx`, and it never should — `work.
complete_engagement_for_caller()`'s own comment (migration 0146) states
the design outright: *"confirming completion is the customer's own
decision, matching markComplete()'s own shape."* C18 already documents
the real flow correctly on the customer side. `ProJobs.jsx` itself
does something else worth pinning — see the corrected row below.

| # | Flow | Surface |
|---|---|---|
| P1 | Becoming a pro creates a pro profile | `BecomeProSheet`, `BecomeProPrompt` |
| P2 | Dashboard shows matching leads for the pro's services and city | `ProDashboard` |
| P3 | A flexi pro cannot see specialist-category leads | `ProDashboard` |
| P4 | Sending a quote moves the request to `quotes_ready` | `SendQuoteSheet` |
| P5 | Jobs list separates active from completed | `ProJobs` |
| P6 | A completed job shows the customer's own review, or says plainly that none has arrived yet — never a blank card | `ProJobs` *(automated)* |
| P7 | Pro profile shows rating, badge and trust signals | `ProProfile` |
| P8 | Portfolio items can be added and appear publicly | `PortfolioItemSheet`, `ProPublicProfileSheet` |
| P9 | Testimonials can be added and appear publicly | `AddTestimonialSheet` |
| P10 | Pause toggle removes the pro from matching | `ProProfile` |
| P11 | Flexi tax tracker shows earnings against the threshold | `ProProfile` |
| P12 | Boost shows its price and expiry | `ProProfile` |
| P13 | My Business reuses the customer physical twin against the pro's own workspace, lazily creating its first property on first open | `MyBusinessPanel` |
| P14 | Tapping a booked or completed job opens its detail — timeline, a direct link into the conversation, and (once WP 2.4's scoped grant resolves it) the customer's own property twin; a "sent" (quoted, not yet booked) job stays unclickable | `ProJobDetailSheet` |

### 5.6 · Messaging

| # | Flow | Surface |
|---|---|---|
| M1 | Conversations list shows threads with unread counts | `MessagesList` |
| M2 | Sending a message delivers it to the other party | `ConversationSheet` |
| M3 | Messages arrive without a reload (Realtime) | `ConversationSheet` |
| M4 | A message in another language is translated on open | `ConversationSheet` |
| M5 | Translation is cached — reopening makes no new call | `ConversationSheet` |
| M6 | "View original" shows the untranslated text | `ConversationSheet` |
| M7 | Unread badge clears on read | `BottomNav`, `MessagesList` |

### 5.7 · Profile

| # | Flow | Surface |
|---|---|---|
| F1 | Profile shows the signed-in user's details | `CustomerProfile` |
| F2 | Editing name and city persists | `EditProfileSheet` |
| F3 | Avatar upload replaces the image | `EditProfileSheet` |
| F4 | Contact details stay private until a booking exists | `ProPublicProfileSheet` |

### 5.8 · Cross-cutting

| # | Flow | Surface |
|---|---|---|
| X1 | All 10 locales render without missing keys | *(automated — `homeStrings.test.js`)* |
| X2 | Arabic and Persian render right-to-left | All surfaces |
| X3 | Bottom navigation switches tabs in both apps | `BottomNav` |
| X4 | Loading states appear and clear | `Loading` |
| X5 | Toasts appear and dismiss | `AppShell` |
| X6 | Modal focus trap and focus restoration work | `overlays.jsx` |
| X7 | Touch targets stay at least 44px | All surfaces |
| X8 | No console errors on any surface | All surfaces |
| X9 | A single-workspace person sees the pre-Epic-03 "Previewing as" toggle and no other workspace chrome | `AppShell` |
| X10 | A person with two live workspaces (Epic 03 WP12 — today, an existing pro's Personal + Professional pair) sees `WorkspaceSwitcher` instead, listing both by name; picking one switches which app renders and is remembered on reload. Reachable in two places since 2026-08-22 — AppShell's own topbar (desktop-width phone-mockup view only, `display:none` below 460px) and Profile (`CustomerProfile`/`ProProfile`/`OperatorApp`, the real path on an actual phone) — both read the identical `useAuth()` state, so switching from either shows the same result in the other | `WorkspaceSwitcher` |
| X11 | The language picker changes `langCode` immediately, every locale's own strings render, and the choice is reachable on an actual phone — not only the desktop-width topbar (`display:none` below 460px), which is where this lived exclusively until 2026-08-22, when it was found unreachable on mobile the same way `WorkspaceSwitcher` was | `LanguageSwitcher` |

## 6 · Known defects — preserved deliberately

**These are current behaviour.** They are wrong, they are known, and they
are **pinned by `knownDefects.test.js`** so that none is corrected
without the correction being a declared change.

### 6.1 · Literal escape text rendered to customers

Fourteen sites render escape sequences as literal text instead of the
character, because JSX text content does not interpret backslash escapes
the way a JavaScript string does. Customers see the raw sequence where a
euro sign, bullet or dash belongs.

| Sequence | Occurrences | Should render as |
|---|---|---|
| `u20AC` | 9 | € |
| `u2022` | 3 | • |
| `u2013` | 1 | – |
| `u00B7` | 1 | · |

Across `AiIntakeSheet`, `InvoiceSheet`, `QuoteFormSheet`, `ServiceSheet`,
`ProProfile`, `SendQuoteSheet`, `AppShell` — **including the invoice
totals and quote prices**, which is where a customer is most likely to
notice.

Recorded in `../MASTER_CONTEXT.md` §12. Fixing them is a one-line change
per site and **a declared behaviour change** requiring a `CHANGELOG.md`
entry, not a tidy-up inside another package.

### 6.2 · `awaiting_pro` leaks untranslated

`src/lib/requestStatus.js` has no entry for the status a directed request
sits in (ADR-0012), so the fallback returns `{ labelKey: null }` and the
raw enum value reaches the customer in all locales. The detail sheet also
shows no timeline for it.

The *rule* is pinned by `requestStatus.test.js`. What the customer
*sees* is not, because those surfaces have no render tests (§4).

## 7 · Not user-facing surfaces

Component files that are helpers rather than flows, listed so
`baselineCoverage.test.js` can distinguish "unlisted" from "not a flow":

**Containers and routing** — they render the flows above rather than
being flows themselves: `CustomerApp.jsx`, `ProApp.jsx`.

**Presentational parts and shared primitives:** `myHomeParts.jsx`,
`panelParts.jsx`, `primitives.jsx`, `overlays.jsx`, `domain.jsx`,
`tabs.jsx`, `KlussiePanel.jsx`, `HomeHero.jsx`, `HomeTodayCard.jsx`,
`IntentSuggestions.jsx`, `SafetyNotice.jsx`, `Loading.jsx`,
`JobDetailsSummary.jsx`.

## 8 · Updating this baseline

1. Make the behaviour change, declared in the work package.
2. Update the affected §5 row, or §6 if a known defect was fixed.
3. Update `src/__tests__/regression/` if a pinned defect changed.
4. Add a `CHANGELOG.md` entry.
5. Note it in the epic's completion record.

**A failing regression test is not a test to fix. It is a question to
answer:** was this change intended?

---

Version 1.0 — 2026-08-12 (Epic 00 WP08)
