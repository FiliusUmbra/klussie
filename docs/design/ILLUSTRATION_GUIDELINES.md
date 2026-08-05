# Illustration Guidelines

**This document owns:** visual asset direction — photography today,
illustration once it exists. There is no dedicated `PHOTOGRAPHY.md` in
this documentation set (flagged when this architecture was first
proposed); this document's scope was deliberately widened to cover both
rather than let photography direction go undocumented.

**Status: mostly Planned.** A full sweep of `public/`, `src/`, and the
separate `marketing/` project found **zero photography or illustration
assets anywhere in this codebase** — no hero images, no onboarding
illustrations, no marketing photography. The only image files that exist
at all are `favicon.svg` and `icons.svg` (icon sprites, not photography or
illustration — see `ICONOGRAPHY.md`). Every image a user actually sees in
the product today is user-generated content (an avatar, a portfolio
photo, a job photo) fetched from Supabase Storage — not curated,
commissioned, or art-directed. That distinction matters: this document
governs the latter, which doesn't exist yet, not the former, which does
and follows different rules (see Current image handling, below).

---

## Photography direction

Carried forward from `DESIGN_SYSTEM.md`'s original Photography section,
unchanged — this document is where it now lives in full:

**Use:** real homes, real professionals, real people, warm lighting,
authentic environments.

**Avoid:** corporate offices, fake stock imagery, artificial staging.

No photography commissioned or sourced yet, so this is direction for
whenever it is — not a description of anything that exists.

## Illustration style

**Planned.** No custom illustrations exist anywhere in the product or
marketing site. If Klussie ever commissions illustration (an empty-state
character, an onboarding graphic), the style should be decided against
this document's Brand Personality inheritance (`DESIGN_SYSTEM.md`: warm,
human, approachable, never futuristic or corporate) before any asset is
produced — not reverse-engineered from whatever the first commissioned
piece happens to look like.

## Current image handling (real, not photography)

What actually exists today, since it's adjacent enough to belong here
even though it isn't "photography" in the curated sense:

| Context | Real treatment |
|---|---|
| Avatar (profile photo) | Circular, `object-fit:cover`, two sizes (default 36px, `-lg` 52px) — see `COMPONENT_LIBRARY.md`'s `Avatar` entry |
| Portfolio photos | Square (`aspect-ratio:1`), 3-column grid, soft border + card shadow — see `LAYOUT_SYSTEM.md`'s `.portfolio-grid` |
| Job-request photos | 64×64 thumbnails in a horizontal scroll strip (`.photo-strip-thumb`) |

All three are entirely user-uploaded content with no cropping guidance,
no quality/resolution standard, and no moderation — outside this
document's scope (that's a trust/safety and storage-pipeline question,
not a visual-design one), but worth naming so a future photography
pipeline doesn't get confused with the user-upload system already in
place.

## Asset pipeline

**Planned.** No pipeline exists — there's nothing to source, license, or
store yet. Once real photography is commissioned, the storage question
(stay on Supabase Storage, used today for user uploads, or move to a
dedicated image CDN) is already tracked as an open decision in
`MASTER_CONTEXT.md` §16 — this document doesn't duplicate that decision,
just points to it.

---

Version 1.0 — 2026-08-05
