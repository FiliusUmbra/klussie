# Epic 13 — Design Review (before any SQL)

Requested explicitly, before implementation: review the Conversation
Engine design against everything now real (Epics 03–12), determine how
each completed engine should naturally enrich conversations, identify
assumptions that predate those engines, and propose roadmap changes —
only then build.

Sources re-read in full for this review: `DATABASE_ARCHITECTURE.md` §20,
`PLATFORM_DOMAIN_MODEL.md` §15, `SYSTEM_ARCHITECTURE.md` §8.5, the
current `public.conversations`/`messages` schema (migrations 0001, 0009),
and `src/lib/messages.js` (the real client behaviour being replaced).

---

## 1 · What the frozen documents actually say, verbatim

**The subject list is exactly five, no more, no fewer** (§15): "a
marketplace engagement, an asset, a maintenance record, a property, or
the workspace itself." **Location is conspicuously absent** — a
location-scoped conversation ("the leak in the basement") is intuitive,
but not what the frozen model names. Not added in this epic; see §4.

**Conversations may span workspaces, and this is the ordinary case, not
the exception** (§15): "A marketplace conversation has participants from
two workspaces." Isolation is per-participant, not per-workspace-member:
"Participants see the thread and exactly the context their grant allows
— not each other's workspaces" (§20).

**Messages are immutable; translations are derived, never a
substitute** (§20). The original text and language are permanent.

**"How it evolves" names three real future directions** (§15): additional
channels reaching the same thread; structured moments (a quote, a
schedule change, an approval) that are both readable and machine-usable;
and the platform's own assistant as an explicit, labelled participant
(Intelligence, Epic 17 — not this epic).

**Dependencies** (§8.5): "Workspace, Identity, Capability, Intelligence
(translation), and the subject's owning engine." Intelligence (Epic 17)
does not exist as a formal engine yet — see §3.

---

## 2 · Engine by engine — how each completed epic naturally enriches
Conversation, checked against what each engine actually built rather
than assumed

**Workspace + Capability (Epics 03/04).** Every participant is a real
person (`identity.identities.person_ref`, surviving erasure — the same
no-FK pattern every durable record in this schema already uses) acting
on behalf of a real workspace. Participation is its **own** managed
concept, not inferred from workspace membership — §8.5 names
`ParticipantAdded`/`ParticipantRemoved` as real produced events, and
"managing participation across workspace boundaries" as an explicit
responsibility distinct from membership itself. **A real, concrete
connection**: `platform.capabilities.team_collaboration`'s own catalogue
description (§6.7) is *"Multiple members, assignment of work, **internal
discussion**, scoped roles at depth"* — a workspace-subject conversation
(§15's fifth type) is literally what that capability names. Not gated
live in this epic (no capability check is wired anywhere yet — the same
restraint every engine epic has held since Epic 09), but the connection
is real and worth recording, not inventing.

**Property + Location + Asset (Epics 05–07).** Property and Asset are
both named subject types and both real, workspace-resolved aggregates.
Location is real too, but genuinely not named as a subject — respected,
not silently extended (§4).

**Document (Epic 08).** Not a named conversation subject. A message
referencing an attached document ("see the photo I sent") is a real,
plausible future connection — `property.document_attachments` already
excludes "message" as a subject the same way it excluded "maintenance
record" and "marketplace engagement" before Epics 10/12 existed. Named
here as a future connection, not built — extending an already-open,
already-reviewed Epic 08 migration from this epic's branch is exactly
the restraint Epic 11 held for the identical situation.

**Workflow (Epic 09).** Not a named subject, and no workflow-instance
binding exists on any real aggregate to attach to yet regardless. The
real connection is narrower and concrete: "structured moments... a
quote, a schedule change, an approval" (§15) describes exactly what a
workflow transition or a marketplace event *is*. A message can carry an
optional, typed reference to one — see §5.

**Maintenance (Epic 10).** "A maintenance record" is named as a subject.
Read against §13.1 (Maintenance) and §13.2 (Service Record) sitting in
the *same* domain-model chapter, with both terms used distinctly one
section apart — "a maintenance record" is interpreted here as `work.
maintenance_obligations` (Epic 10: what is due), not the Service Record.
This is a real interpretive choice, stated rather than assumed silently.

**Service Record (Epic 11).** **Not named** in §15's list of five. This
reads as a real, plausible omission — a conversation clarifying or
disputing completed work seems at least as natural as one about a still-
open maintenance obligation — but the frozen document does not name it,
and this review does not add a subject type the domain model itself
does not state. Flagged as a genuine candidate for a future ADR or
domain-model amendment, not built here. See §4.

**Marketplace (Epic 12).** **The single largest correction this review
found.** §15 names the subject as "a marketplace **engagement**." Legacy
`public.conversations.request_id` binds to the *request* — created, once,
at the moment `handle_quote_accepted()` fires (`on conflict (request_id)
do nothing`), which is *already* conceptually "at acceptance," i.e. at
the engagement. The legacy schema could not bind to an engagement because
none existed as a real row until Epic 12. It now does. **New
conversations bind to `work.engagements.id`, not a request id** — see §4
for the concrete change this produces.

---

## 3 · A dependency gap, read honestly rather than routed around

§8.5 lists Intelligence (translation) as a dependency. Intelligence
(Epic 17) is not built and is not next — Epics 14–18 remain ahead of it
in the roadmap's own sequencing, and Conversation is explicitly
sequenced *before* Intelligence. This is not a blocker: the current
product already calls a real, working translation mechanism (the AI
Gateway's `translate()`, referenced in this session's own memory of the
stack) directly, no formal "Intelligence Engine" contract involved.
`messages.translations` (legacy, migration 0009) already caches this as
a `jsonb` column keyed by locale, populated lazily on first view. This
epic reuses that exact mechanism — a `translations jsonb` column on the
new message table — the same restraint Epic 12 held reusing
`public.categories`/`services` rather than waiting for a taxonomy engine
that does not exist yet.

---

## 4 · Concrete changes this review makes to Epic 13's own design,
before any table is created

1. **Bind conversations to `work.engagements.id`, not a request id.**
   The frozen subject is the engagement; Epic 12 makes this a real FK
   target for the first time. `work.requests`/`work.assets`/
   `work.maintenance_obligations`/`property.properties`/
   `workspace.workspaces` are the other four real subject tables — five
   nullable subject columns, exactly one required, the same
   `num_nonnulls(...) = 1` idiom this schema has used since Epic 08.
2. **Participation is a first-class, explicit table**
   (`work.conversation_participants`: `person_ref`, `workspace_id`,
   `joined_at`, `left_at` nullable), not inferred from workspace
   membership. This is a real behavioural correction from legacy's fixed
   `customer_id`/`pro_id` pair, and from what a naive "OR the requesting/
   performing workspace" isolation predicate (this epic's own nearest
   precedent, Marketplace's engagement policy) would have produced —
   that shape was checked against §15/§20's own text and found to
   over-grant: it would let *any* member of either workspace see the
   thread, not only the people actually part of it.
3. **Per-participant read state, not a single `read_at` column.**
   Legacy's `messages.read_at` is a single timestamp because exactly two
   parties ever exist. With participation now open-ended (§15: "how it
   evolves... additional channels," multiple people per workspace side),
   read state must be per participant — `conversation_participants.
   last_read_at`, not a column on the message.
4. **Structured moments are a real, typed, optional reference on a
   message** — `reference_type text null, reference_id uuid null` — not
   free text. A `QuoteSubmitted` or `EngagementCompleted` system message
   can point at the real `work.quotes`/`work.engagements` row that
   produced it, "readable and machine-usable" exactly as §15 asks,
   reusing `platform.emit_event()`'s own polymorphic-subject convention
   rather than inventing a new one.
5. **Translations stay a `jsonb` column on the message**, matching
   legacy exactly (§3) — no new Intelligence-shaped contract invented
   ahead of Epic 17.
6. **This epic does not add Location or Service Record as subject
   types.** Both are real, plausible connections; neither is named in
   §15. Recorded as findings for a future ADR, not built.
7. **This epic does not wire the Team Collaboration capability check**
   (§2) — the same "no live wiring" restraint every engine epic has held
   since Epic 09, now stated for a sixth time.
8. **This epic does not build a Document attachment path for messages**
   (§2) — the same restraint Epic 11 held for Service Record photos.

## 5 · What this means for scope and risk, matching Epic 12's own
precedent

Nothing about Conversation carries Epic 09/12's "single largest
behavioural risk" character — there is no equivalent of five live
triggers currently deciding real behaviour that this epic would need to
leave alone. This epic follows the ordinary shape every engine epic since
09 has used: full schema, backfill of every real legacy conversation and
message, complete contract, diagnostics, no live wiring, no client
switch. The roadmap's own Epic 13 one-liner ("Conversations bound to
subjects; messages immutable; originals permanent; translations derived.
Migrates existing messages and the `translations` cache") undersold what
is now possible — it was written when none of the five real subject
types existed. Updated in `IMPLEMENTATION_ROADMAP.md` directly, alongside
this document.
