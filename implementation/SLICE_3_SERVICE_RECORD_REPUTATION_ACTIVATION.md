# Slice 3 — Service Record & Reputation Activation: Scoping

**This document owns:** the concrete work-package breakdown for
[`PLATFORM_ACTIVATION_PROGRAMME.md`](PLATFORM_ACTIVATION_PROGRAMME.md)
§5, Slice 3. It does not own the Programme's cross-cutting reasoning
(the Four Questions, §2; the Activation Priority, §1.1), which this
document applies rather than restates.

**Status.** Scoping. Written under the product-phase mandate (2026-08-21
— "the objective is no longer 'finish engines'... turn the completed
platform into an exceptional product"), immediately after Slice 2's own
close (WP 2.4-2.6 shipped and verified live). Slice 3 is the mandate's
own worked example: Epic 11 (Service Record Engine) is a **fully
complete, real backend** — ten contract functions, real RLS isolation,
the authorship split enforced structurally — that **zero client code
anywhere references**. Not a gap in the roadmap; a gap between what was
built and what a real person can reach.

---

## 1 · The Four Questions (Programme §2), answered before scoping

**1 · Homeowner.** Sees a real, structured Service Record — diagnosis,
work performed, parts, evidence, warranty — as "what happened to my
boiler," not an invoice line (`ROADMAP_A` §5.1 step 5, §7). Today: no
record exists, ever, for any completed job; `RequestDetailSheet.jsx`'s
own `completed`/`reviewed` states show a flat "mark complete" and a
review, nothing else.

**2 · Professional.** Authors it. `ROADMAP_B` §5.5 names this "the
journey the whole platform depends on" and §8 Phase B3 calls it "the
highest-leverage single screen in this entire roadmap — everything in
Part V of the domain model (Timeline, Memory, Knowledge, Intelligence)
is starved without it." Today: `ProJobDetailSheet.jsx` (WP 2.4, shipped
2026-08-21) shows a completed job's review and nothing about the work
itself — the exact gap this slice closes, in the exact surface already
built to receive it.

**3 · Platform Operations.** `ROADMAP_C` §5.1's Trust & Safety case view
gains real evidence to act on instead of a bare `reports` row with
nothing to check it against. Out of scope for this slice's own work
packages — named here because §2's own discipline requires naming it,
not deferring the question.

**4 · Legacy replaced.** The hand-computed trust score
(`src/lib/pros.js`) and the flat "mark complete" action — both named
explicitly in the Programme's own Legacy Inventory (§3) as "Fully
legacy — Slice 3."

---

## 2 · What was found before scoping this

### 2.1 · The backend is complete, real, and has never been reached

Epic 11 (`DATABASE_ARCHITECTURE.md` §17's own "highest-risk visibility
surface in the platform") built, in full: `work.service_records` (the
shared core), `work.service_record_performing_annexes` /
`_property_annexes` (private, asymmetric, per §13.2's authorship
split), `work.service_record_amendments` (append-only corrections),
real two-path RLS isolation (`0083` — performing-workspace membership
OR current property stewardship, independently), and ten contract
functions (`0084`): `create_service_record`, `record_service_record_
approval`, `write_performing_annex`, `write_property_annex`, `amend_
service_record`, `resolve_service_record`, `my_service_records`, `my_
performing_annex`, `my_property_annex`, `service_record_history`.

**`grep -rln "service_record" src/ --include="*.jsx" --include="*.js"`
returns nothing.** Not a thin read switch with a fallback (Property's
own pattern) — a complete absence. No `api.*` delegate exists for any
of the ten functions either.

### 2.2 · No function does its own caller-authorization — by design, not oversight

Unlike Marketplace's `_for_caller` wrappers (WP 2.3), none of the ten
`work.service_record*` functions checks who is calling. Their own
comments say so directly: `work.my_service_records()` — "this function
is not SECURITY DEFINER-invoked through RLS the way a client read
would be"; `work.my_performing_annex()` — "visibility is the caller's
own responsibility (no client caller yet)." `0083`'s own RLS policies
cover **reads only** — `for select`, nothing else — which is the tell:
the intended shape is RLS-backed reads through a thin `SECURITY
DEFINER` `api.*` delegate (Property's own established pattern), but
**real caller-checked `_for_caller` writes**, because no `INSERT`/
`UPDATE` policy exists anywhere in `0083` for these tables to lean on.
This is exactly Marketplace's own WP 2.1 (reads) / WP 2.3 (writes)
split, not a new pattern to invent.

### 2.3 · Records are authored, not auto-generated — a real question this scoping pass resolved, not assumed

`SYSTEM_ARCHITECTURE.md` §8.2 lists "Events consumed: `EngagementCompleted`"
against this engine, which reads, at a glance, like WP 2.4's own
consumer shape (an event triggers a background write). It is not the
same shape, and building it that way would be a real mistake: `work.
create_service_record()`'s own required parameters include `p_work_
performed text not null` — the diagnosis and work actually done — which
**does not exist anywhere in `marketplace.engagement.completed`'s own
payload** (empty `{}`, checked directly against `0090`). The function's
own comment states the design outright: *"records are created already
complete... never drafted then finalised."* A background consumer
cannot author a diagnosis. **`EngagementCompleted` is what makes the
authoring screen reachable/prompted in the professional's own UI — a
client-side state check against `work.engagements.status`, already
tracked — not a trigger for a database-side auto-creation.** No
consumer is built in this slice; §2.3 below is why.

---

## 3 · Work packages

### WP 3.0 — Read contract — **DONE, PR #77, merged 2026-08-22**

Ten `api.*` delegates mirroring `resolve_service_record`/`my_service_
records`/`my_performing_annex`/`my_property_annex`/`service_record_
history` (five reads) and `create_service_record`/`record_service_
record_approval`/`write_performing_annex`/`write_property_annex`/
`amend_service_record` (five writes, each needing a real `work.*_for_
caller()` wrapper first — §2.2). Same two-tier shape as every prior
read/write switch this programme has built. Verified on staging via
`VERIFY_SERVICE_RECORD_CONTRACT.sql`'s adversarial suite; found and
fixed a real, pre-existing bug along the way (`work.engagements_
reject_terminal_mutation()`, 0087, unconditionally blocked the one
write 0087's own header predicted this work package would need to
make).

**Follow-up, same PR, migration 0164:** wiring WP 3.2 below exposed a
real gap WP 3.0 itself left open — no existing read exposed `work.
engagements.service_record_id`, so a client had no way to answer "does
this request have a record yet" at all. `work.resolve_service_record_
for_request(p_request_id)` closes it, two-sided, matching `work.
resolve_engagement_for_request()`'s (0152) own established idiom
rather than widening an already-shipped list read's shape (0152's own
header already rejected that once, for the identical reason).

### WP 3.1 — Decision: what "authoring is reachable" means, concretely — **DONE, built as part of WP 3.3**

A completed engagement (`work.engagements.status = 'completed'`,
already true the moment `api.complete_engagement()` runs) **and** no
`service_record_id` set yet is what unlocks the editor entry point —
not a new column, not a new event; both facts already existed on
`work.engagements` by the time a job reaches `completed`.
`ProJobDetailSheet.jsx` (WP 2.4) is the host, exactly as decided: it
already rendered per-job, already knew the engagement id, already had
a `completed` segment (`ProServiceRecordSection.jsx`, new). The
real entry point ("Leg vast wat je gedaan hebt"/"Write up what you
did") ships in the same PR as the editor it opens — no window where a
button opened nothing.

### WP 3.2 — Client: the customer's own read view — **DONE, this PR**

`RequestDetailSheet.jsx`'s `completed`/`reviewed` states gain the real
record once one exists — `ROADMAP_A` §5.1 step 5's own bar: "what
happened to my boiler," not an invoice line. `ServiceRecordSummary.jsx`
(new, self-fetching, the same idiom `RequestPhotosStrip.jsx` already
establishes) renders the shared core (work performed, recommendations,
warranty) plus a real Approve action wired to WP 3.0's own write
contract, or an educating empty state — "your pro will write this up
once the job is finished" — for every request today, since no
authoring UI exists yet. Smaller than WP 3.3, as expected: no
authorship, no progressive disclosure design questions, a real read
and one real write against WP 3.0's own contract.

### WP 3.3 — Client: the Service Record editor — **DONE, per `ROADMAP_B` §8 Phase B3**

Built against
[`WP_3_3_SERVICE_RECORD_EDITOR_DESIGN.md`](WP_3_3_SERVICE_RECORD_EDITOR_DESIGN.md),
written first, per the mandate's own instruction to document a better
UX architecture before implementing one. `ServiceRecordEditorSheet.jsx`
(new) covers the design's own field tiers — Tier 0 (work performed,
date) always visible; Tier 1 (price, pre-filled from the job's own
accepted quote, recommendations, warranty) visible, not collapsed;
Tier 2 collapsed; the performing annex in its own visually distinct
container (`.private-annex`, amber rather than this app's usual sage —
deliberately the one palette break in the app, so private-vs-shared
needs no tooltip). One creation call, no draft, per 0084's own design;
the annex and evidence photos are separate, genuinely optional writes,
never sent when empty.

**Migration 0165 closes the one genuinely-required new capability the
design note's own §4 found**: evidence photos are named as core shared
content in `PLATFORM_DOMAIN_MODEL.md` §13.2, but no write path let the
*performing* side attach a document to a request at all —
`property.create_document_for_request()` (0149) is single-sided to the
requesting workspace by design, and widening it would have blurred a
real authorization boundary. `property.create_document_for_service_record()`
is the narrower, dedicated fix — checked against the performing side,
`type_key` hardcoded to a new `service_evidence` (retention_class
`evidence`, never deletable), shared back to the requesting workspace
via `property.document_shares` (an existing, unused mechanism —
`property.my_documents()`'s own request-subject visibility has no
two-sided branch, found live while wiring this).

Verified live on staging through the actual UI, both sides: logged in
as the real pro test account, opened a fresh completed job with no
record, filled and saved the editor (core fields, the private annex,
expanded and filled), confirmed the pro's own read-only summary
replaced the entry point immediately, confirmed both the core record
and the annex persisted server-side, then logged in as the customer
and confirmed the exact same shared core rendered — with zero trace of
the private annex (internal cost, margin, supplier) anywhere.

### WP 3.4 — Reputation onto the real engine — **NEXT**

`ROADMAP_B` §8 Phase B4. Replaces `src/lib/pros.js`'s hand-computed
`trustScore()` with a real, Service-Record-derived aggregate. Depends
on real records existing in volume — sequenced last, deliberately: a
reputation engine computed over zero (or a handful of test) records is
the identical "zero discrepancies is true and worthless" trap this
programme has already named twice (Epic 02 WP 02.05, Slice 2's own WP
2.0). Now unblocked structurally (WP 3.3 shipped, real records can
exist) but genuinely needs volume before it means anything — a real
sequencing question for the next session, not assumed away here.

---

## 4 · Sequencing

```
WP 3.0 (read + write api.* contracts) ── DONE
   │
   ├──► WP 3.2 (client: customer read view) ── DONE
   │
   └──► WP 3.1 (decision: reachability) ── DONE ──► WP 3.3 (client: the editor) ── DONE
                                                                │
                                                                ▼
                                                      WP 3.4 (reputation, real data) ── NEXT
```

WP 3.2 and WP 3.1/3.3 were independent once WP 3.0 shipped — the
customer's own read view needed nothing WP 3.3 decides, so it shipped
first, ahead of the editor. WP 3.4 is next, but not automatic: it
needs real records to aggregate, and this slice's own live-verification
records are test data, not volume.
