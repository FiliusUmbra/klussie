# ADR-0033: Property-First Home, a Real My Home Destination, and Category-Assisted Requests

**Status:** Accepted — supersedes [ADR-0007](0007-conversational-homepage-ia.md)
and [ADR-0008](0008-my-home-replaces-discover-tab.md)
**Date:** 2026-09-15
**Related:** `../product/HOME_OPERATING_SYSTEM.md`,
[0032](0032-multi-property-support-is-a-real-read-path.md),
`src/shell/AppShell.jsx`, `src/customer/CustomerApp.jsx`,
`src/home/ConversationHome.jsx`

## Context

ADR-0007 and ADR-0008 (2026-08-06) chose a conversational-first
homepage with zero category grid, and folded "My Home" into a
segmented section of that same front door rather than giving it its
own navigation destination — both explicitly reasoned from a brief
that rejected marketplace-style IA outright.

The founder has now reviewed a concrete mobile mockup (three screens:
Home, Request a service, My Home) and given explicit, unambiguous
direction: **this mockup is what Klussie is building toward, and any
earlier decision standing in its way is revoked.** The mockup shows:

- A home screen with a category icon row (Repairs, Painting, Heating,
  Garden, More) alongside the composer, and a property summary card
  with item/document/upcoming counts.
- A dedicated **My Home** screen (own header, own hero, own
  Overview/Items/Documents/Maintenance tab row) reached from a
  bottom-nav destination, not a segmented section of Home.
- A **Request a service** flow with an explicit numbered step
  indicator (1 What → 2 Details → 3 Send) and a 3×3 category grid
  (Plumbing/Electrical/Heating/Painting/Carpentry/Garden/Cleaning/
  Renovation/Other) alongside free-text description.
- A five-destination bottom nav: **Home, Jobs, Request (center,
  raised), My Home, Profile.**

This is a genuine reversal of the prior IA decision, not an extension
of it — ADR-0007's "no category grid" and ADR-0008's "no new nav
destination" are both directly contradicted by the brief this ADR now
follows. Per this repository's own rule that frozen architecture
changes only by ADR, that reversal is recorded here rather than made
silently through incremental PRs.

## Decision

**Both prior decisions are superseded, deliberately and by name.**

1. **My Home becomes a real bottom-nav destination**, not a segmented
   section inside the conversational canvas. It keeps everything
   ADR-0008's "V1 shipped" update already made real (history, people,
   items, rooms, documents, maintenance) — this is a navigation change,
   not a data rebuild.
2. **The bottom nav grows a fifth destination**, `request`, center-
   positioned as the primary action (the mockup's raised "+" button) —
   the customer's existing conversational-intake capability
   (`useIntentFlow`, `AiIntakeSheet`) is not thrown away; it becomes
   what this destination opens into, now reachable as its own flow
   with a real step indicator instead of only an inline composer.
3. **A category grid is a real, additional entry point** into request
   creation — alongside, not instead of, the free-text/voice/photo
   composer. Categories map onto the existing `CATS`/`BASE_SERVICES`
   taxonomy already used for matching (`src/lib/*` service catalog) and
   the intent taxonomy added for the 2026-09-15 homepage redesign
   (`homeIntents.js`) — this ADR does not invent a second, competing
   taxonomy; it exposes the existing one as tappable icons up front,
   the same information the AI-intake flow already asks for
   conversationally.
4. **`docs/adr/0007-*.md` and `docs/adr/0008-*.md` are marked
   Superseded** by this ADR, their own files updated with a pointer
   forward — their reasoning stays on record, not deleted, matching
   this repository's own supersession precedent (ADR-0002, ADR-0016).

**What this ADR does not decide**, left to the implementation PRs that
follow it:

- The exact pixel-level visual design — the mockup is a direction, not
  a locked spec, the same way every earlier mockup this session went
  through iteration before being built for real.
- Where Messages lives once the nav grows to five destinations — the
  mockup's own nav row does not show a Messages icon at all. Until
  resolved, Messages stays reachable exactly where it already is today
  (its current bottom-nav position) rather than being silently dropped;
  a genuine reduction in reachability needs its own explicit decision,
  not an implicit one made by omission.
- The property hero photo's real data source (Google Maps Street View
  Static API, per the founder's own choice) is gated behind a real API
  key being supplied — the integration point is built now; the live
  fetch activates once a key exists.
- The "Property health" signal is real, derived data (per the
  founder's own choice, not fabricated) — its exact formula is defined
  in the implementing PR, from data this schema already has (maintenance
  obligations overdue, address confirmation, document coverage), not
  invented wholesale here.

## Consequences

**Makes easier**

- The product finally matches a visual direction the founder has
  concretely approved, rather than an internal-only conversational
  canvas whose category-free restraint was never validated against a
  real design.
- My Home as its own destination gives Items/Documents/Maintenance real
  room to grow (tabs, hero, stat tiles) without competing for space
  inside a segmented control alongside the conversational composer.

**Makes harder**

- The bottom nav now needs a real answer for Messages (open question,
  above) — every future nav-touching PR must not silently drop it.
- Two taxonomies (`CATS`/`BASE_SERVICES` for matching, `HOME_INTENTS`
  for the conversational flow) now both need to render as tappable
  icons in two different places (category grid, intent tiles) —
  keeping their icons/labels from drifting apart is a real, ongoing
  cost this decision creates.
- The property hero photo and health score are real scope, not
  cosmetic additions — one blocked on external API credentials, the
  other needing a genuine formula design, both explicitly deferred
  above rather than rushed.

**Rules out**

- Treating ADR-0007/0008's reasoning as still governing — a future
  contributor citing "no category grid" or "no new nav tab" against a
  Home-foundation-era PR is citing a superseded decision; this ADR is
  the current one.
- Inventing a third service/intent taxonomy for the category grid —
  it must reuse `CATS`/`BASE_SERVICES` (or `HOME_INTENTS`, whichever
  fits the specific screen), never a new one.
