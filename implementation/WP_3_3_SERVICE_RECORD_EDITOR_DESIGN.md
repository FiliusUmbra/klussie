# WP 3.3 — The Service Record Editor: Design Note

**This document owns:** the UX architecture for WP 3.3, written *before*
implementation per the product-phase mandate's own instruction
("whenever a better UX architecture becomes apparent, document it
before implementing"). It applies
[`ROADMAP_B_PROFESSIONAL_EXPERIENCE.md`](ROADMAP_B_PROFESSIONAL_EXPERIENCE.md)
§5.5 and §8 Phase B3, and `PLATFORM_DOMAIN_MODEL.md` §13.2, against the
real schema WP 3.0 (0163/0164) already shipped a contract for — it does
not restate their reasoning, only what follows from it concretely.

**Status.** Design only. No editor code exists yet. WP 3.1 (the
reachability decision) and WP 3.2 (the customer's own read view) are
both shipped — see
[`SLICE_3_SERVICE_RECORD_REPUTATION_ACTIVATION.md`](SLICE_3_SERVICE_RECORD_REPUTATION_ACTIVATION.md).

---

## 1 · The constraint this whole design serves

§5.5, verbatim: *"a four-field record must never feel like failure, and
a two-hundred-field statutory inspection must never feel like the norm."*
§13.2 states why this is architectural, not cosmetic: *"a professional
who finds it tedious will produce thin records — which starves
everything downstream... the cost of writing them is an architectural
concern, not a UI detail."*

`ItemFormSheet.jsx` already proves this pattern works in this codebase
— eight fields, one required (its own header: *"a form that refuses to
save until they do teaches them to type something plausible instead —
which would poison the record"*). This design applies the identical
philosophy to a richer object, not a new one.

## 2 · What the schema actually requires — checked directly, not assumed

`work.service_records` has exactly two `NOT NULL` fields beyond the ids
the editor resolves automatically (`performing_workspace_id`,
`property_id`, both already handled by
`create_service_record_for_caller`, WP 3.0): **`performed_at`** (defaults
to now — never a real prompt) and **`work_performed`** (free text — the
one field a pro must actually write). Everything else on the core row
— `agreed_price`, `price_currency`, `warranty_until`, `ai_summary`,
`recommendations`, `content` — is nullable. Both annex tables
(`service_record_performing_annexes`, `_property_annexes`) have no
required field at all beyond their own ids.

**The true minimum record is one sentence.** The editor's default state
must reflect that literally — not "collapsed by default," genuinely
absent until asked for.

## 3 · Field tiers — grounded in the real columns, not §13.2's full conceptual list

§13.2's "what it can contain" table names six groups (problem, work,
parts, evidence, commercial, aftermath) — a conceptual model, not a
literal field list. The schema does not have a column for every cell in
that table (no structured `parts` array, no `labour_breakdown` column);
`content jsonb` is where anything without its own column lives. The
tiers below map what actually exists today:

**Tier 0 — always visible, nothing to expand.**
`work_performed` (textarea, the one required field), `performed_at`
(date, pre-filled to today).

**Tier 1 — one tap away, the fields most jobs actually have.**
`agreed_price` (pre-fillable from `work.engagements.agreed_price` —
already known, never re-typed), `recommendations` ("anything to keep an
eye on?"), `warranty_until` (date, optional).

**Tier 2 — "Add more detail," collapsed, for the job that needs it.**
Everything else on the core row (`ai_summary` is system-written later,
not a form field — see §6) plus `content` — a free-structure area for
whatever a specific trade needs (measurements, technician notes, a
symptom description) that has no dedicated column. **This is new UI,
not new backend**: `content` already exists and accepts arbitrary
JSON; the editor's job is offering a small number of common key/value
pairs as suggestions (e.g. "Technicians present," "Time on site") while
never restricting what can go in it. No schema change.

**The performing annex — a visually separate section, not a tab or a
checkbox.** `internal_cost`, `margin`, `supplier_used`, `supplier_price`,
`scheduling_notes`, `internal_commentary`. §5.2's own instruction is
explicit: *"private by construction, not by a checkbox someone can get
wrong."* This section renders inside a visibly different container —
distinct background, a "Only your business sees this" label at the top,
never interleaved field-by-field with the shared core — so the
boundary is legible without reading a tooltip. Entirely optional;
skipping it entirely is a normal, expected save.

## 4 · What genuinely needs new backend — found here, not assumed away

**Evidence photos are a real gap, not a UI omission.** §13.2 names
"before/after photos and video" as shared-and-visible core content —
not optional polish. Checked directly:
`property.document_attachments` enforces *exactly one* subject
(`property_id`/`location_id`/`asset_id`/`workspace_id`/`request_id` —
a `CHECK (num_nonnulls(...) = 1)` constraint) and **has no
`service_record_id` column**. A photo cannot be attached to a Service
Record today.

**The fix needs no new column, because a Service Record's own request
id is already resolvable.** `work.engagements.request_id` correlates to
exactly the `work.requests` row this job came from, and
`property.create_document_for_request()` (0149) — the same function
`RequestPhotosStrip.jsx`/`requestPhotos.js` already use — accepts a
`request_id` subject today. Attaching evidence to *that* request,
tagged with a new `type_key` (e.g. `service_evidence`, extending the
existing catalog the same way `warranty`/`certificate`/`manual`/`other`
already work — `documentTypeLabelKey()` already has the plumbing for a
new key), is real, minimal, additive infrastructure — exactly the
mandate's own bar ("only introduce new backend infrastructure if it is
genuinely required to unlock a product capability").

**One real design question this creates, not resolved here:**
`RequestPhotosStrip.jsx` already renders every photo attached to a
request, undifferentiated — a pre-job "here's what's broken" photo and
a post-job "here's the finished work" photo would land in the same
strip today. Distinguishing them (by `type_key`, most likely) is a
small, real decision the implementation phase must make explicitly, not
an accident of reusing the same attachment point.

## 5 · One creation call, no draft — a real constraint, not a choice this design gets to make

`work.create_service_record()`'s own comment (0084): *"records are
created already complete... never drafted then finalised."* There is no
partial-save on the backend — `create_service_record_for_caller`
(0163) is called exactly once, with whatever the pro has filled in at
that moment. Two consequences for the editor:

- **The "Save" button creates the record.** Local form state is the
  only draft that exists; closing the sheet before saving discards it,
  the same way `ItemFormSheet.jsx` already behaves. No autosave, no
  resume-later — adding either would be new backend infrastructure
  (a real drafts table) the mandate's own test doesn't justify yet.
- **Editing an already-saved record is a different action, not a
  re-open of the same form.** §13.2: *"neither may silently alter a
  completed record: corrections are amendments with their own
  authorship and time, never overwrites."* Once
  `work.engagements.service_record_id` is set, the editor's own entry
  point (§7) must not reopen as "edit" — it opens a **separate,
  smaller "Correct a detail" flow** against
  `work.amend_service_record_for_caller` (already shipped, WP 3.0),
  which asks for a reason on every change. This is not optional
  politeness; §13.2 calls a silently-editable service history
  "worthless as evidence."

## 6 · AI-proposed structure — explicitly deferred, not silently dropped

§5.5 names this as a design constraint: *"let intelligence propose
structure from a photo and a sentence."* [[klussie AI intake engine]]
is the same, already-identified blocker — the AI Gateway path returns
404/JSON-parse errors on staging, unresolved pending Anthropic API key
setup. **This design does not build toward it yet** — `ai_summary`
stays a plain, empty, optional field the pro can fill in by hand (or
leave blank) until that blocker clears, at which point it becomes a
system-written suggestion over `work_performed` + any evidence photos,
not a new column or a new UI surface. Naming it here so it is not
re-discovered as a surprise gap later.

## 7 · Mandatory fields gated by Compliance capability — out of scope, correctly

§5.5's third constraint: mandatory fields "gated strictly by Compliance
capability." The **Compliance** capability exists in the catalogue
(§6.7, `PLATFORM_DOMAIN_MODEL.md`) but nothing in `work.service_records`
or its write contract currently checks for it — no workspace holding
Compliance today gets a different, stricter form. Building that gate
now would be exactly the "backend simply because another work package
exists" pattern the mandate warns against: **no workspace on this
platform currently holds Compliance**, so there is nothing real to gate
yet. The editor ships with the same optional-everything shape for every
workspace; this becomes real work only once a real Compliance-holding
workspace exists to design against.

## 8 · The entry point — reusing WP 3.1's decision and WP 3.0's own two-sided read

WP 3.1 decided the gate (`SLICE_3_SERVICE_RECORD_REPUTATION_ACTIVATION.md`
§3): a completed engagement with no `service_record_id` yet.
`ProJobDetailSheet.jsx`'s own `completed` segment is where this
resolves — and needs no new read: `api.resolve_service_record_for_request()`
(0164) is already two-sided (checked directly — its own predicate
covers `requesting_workspace_id or performing_workspace_id`), so the
exact function WP 3.2 uses on the customer side answers the same
question for the pro. Zero rows → show "Write up what you did"; a row
→ show the record's own summary plus the §5 "Correct a detail" entry
point instead, never a re-opened editor.

## 9 · Screen shape

A `Drawer` (the established sheet primitive), opened from
`ProJobDetailSheet.jsx`'s completed segment — not a new route, not a
full-page takeover, matching every other form sheet in this codebase.

```
[ Drawer ]
  sheet-title: the job's own service name
  sheet-sub: the customer's name (same header shape ProJobDetailSheet uses)

  Tier 0 — always visible
    work_performed (textarea, autofocus)
    performed_at   (date, defaults today)

  Tier 1 — visible, not collapsed (small, low-cost fields worth surfacing)
    agreed_price   (pre-filled from the engagement, editable)
    recommendations
    warranty_until

  [ Add more detail ▾ ]  — collapsed, Tier 2 (content jsonb suggestions)

  ── divider, visually distinct background ──
  "Only your business sees this"
    internal_cost, margin, supplier_used, supplier_price,
    scheduling_notes, internal_commentary

  Evidence photos (§4) — same upload affordance as RequestPhotosStrip's
  own attachment point, tagged service_evidence

  [ Save service record ]  — the one commit, per §5
```

## 10 · What this design deliberately does not decide

- The exact `content` jsonb key suggestions for Tier 2 (trade-specific;
  belongs to implementation, informed by real usage, not guessed here).
- Whether "Correct a detail" (§5) is its own sheet or an inline mode of
  the read view — a smaller decision than the ones above, safe to make
  during implementation.
- Any reputation-facing surfacing of record quality (WP 3.4's own
  concern, sequenced after this ships).

---

Version 1.0 — 2026-08-22, written under the product-phase mandate,
before any WP 3.3 implementation began.
