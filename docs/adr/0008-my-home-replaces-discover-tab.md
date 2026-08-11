# ADR-0008: "My Home" Replaces the Discover Tab, Not a New Tab

**Status:** Implemented (design direction — not yet built; see
[ADR-0007](0007-conversational-homepage-ia.md), which this depends on)
**Date:** 2026-08-06
**Related:** `../product/HOME_OPERATING_SYSTEM.md`,
`../product/PROPERTY_MEMORY.md`

## Context

The Home Operating System vision needed an information-architecture
decision: once Klussie starts remembering a customer's home (assets,
systems, history, trusted pros, documents), where does that surface
live? The brief was explicit that this evolution must not add
unnecessary navigation or complexity. Two options existed: add a new
top-level tab dedicated to "My Home," or fold it into an existing
surface that already serves a similar personal, non-transactional
role.

## Decision

"My Home" is what today's Profile tab becomes once there's something
real to hold — not a new tab. It's organized into five groups (the home
itself, systems, history, people, documents), two of which (history,
people) are already real data from completed requests and reviews, not
new collection. The approved conversational canvas
([ADR-0007](0007-conversational-homepage-ia.md)) remains the sole front
door for starting something new; My Home is where a relationship that
already exists gets looked back on.

## Consequences

- No new tab means no new top-level navigation decision compounding on
  top of ADR-0007's — the nav bar's shape stays exactly as it is today.
- "The home itself," "Systems," and "Documents" are genuinely new
  schema and UI work with no shortcuts — no `home_assets` or
  `home_documents` table exists yet (see `../architecture/ROADMAP.md`
  Phase 13, which this design is the spec for).
- This is a design decision, not yet implemented — the Profile tab in
  `src/App.jsx` today has none of these five groups.

## Status update — V1 shipped (2026-08-11)

Two of the five groups are now real, which is what this ADR predicted
would be possible without new schema:

- **History and People are implemented.** `src/lib/homeTimeline.js`
  derives the property record entirely from existing rows — completed
  jobs, the professionals actually booked on them, reviews, AI analyses
  and request photos. No table was added for any of it.
- **My Items is implemented and did need new schema.** `household_items`
  (migration 0016) is the first real Property Memory storage: items a
  person enters by hand, with `source` and `ai_suggestion` columns so a
  later photo-recognition flow can propose a brand and model for the
  owner to confirm. The check constraint has no value for unconfirmed
  model output, so "the user always confirms" is enforced in the
  database rather than in whichever client wrote last.
- **The home itself, Systems and Documents remain unbuilt**, exactly as
  this ADR said. `src/lib/homeInventory.js` still returns empty for
  rooms, installations, maintenance and documents, and the surfaces say
  so per section rather than with one blanket "not built yet" note.

The IA decision itself is unchanged: still no new tab, still sections of
the conversational front door.
