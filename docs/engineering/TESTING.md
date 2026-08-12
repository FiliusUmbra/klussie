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

## 4 · Automated coverage today

404 tests across 22 files, plus the regression suite. Coverage is uneven,
and the shape of it matters more than the number:

| Area | Automated coverage |
|---|---|
| `src/lib/*` — rules, pricing, status, matching, i18n parity | **Strong.** Every module has unit tests |
| Homepage, conversation home, onboarding, Property Memory panels | **Strong.** 111 render tests across three files |
| Design system capture components | **Partial.** 19 tests |
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

### 5.5 · Professional

| # | Flow | Surface |
|---|---|---|
| P1 | Becoming a pro creates a pro profile | `BecomeProSheet`, `BecomeProPrompt` |
| P2 | Dashboard shows matching leads for the pro's services and city | `ProDashboard` |
| P3 | A flexi pro cannot see specialist-category leads | `ProDashboard` |
| P4 | Sending a quote moves the request to `quotes_ready` | `SendQuoteSheet` |
| P5 | Jobs list separates active from completed | `ProJobs` |
| P6 | Marking a job complete emits completion | `ProJobs` |
| P7 | Pro profile shows rating, badge and trust signals | `ProProfile` |
| P8 | Portfolio items can be added and appear publicly | `PortfolioItemSheet`, `ProPublicProfileSheet` |
| P9 | Testimonials can be added and appear publicly | `AddTestimonialSheet` |
| P10 | Pause toggle removes the pro from matching | `ProProfile` |
| P11 | Flexi tax tracker shows earnings against the threshold | `ProProfile` |
| P12 | Boost shows its price and expiry | `ProProfile` |

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
