# ADR-0015: Service Records, the Digital Twin, the Knowledge Graph, Workflows and Execution Strategies

**Status:** Implemented (domain model; no application code yet)
**Date:** 2026-08-11
**Related:** `0013-workspace-centred-platform-domain-model.md`,
`0014-capability-model-as-the-platform-organising-concept.md` (both
extended, neither superseded),
`../architecture/PLATFORM_DOMAIN_MODEL.md` §9.2, §13.2, §14, §19.2, §32

## Context

ADR-0013 and ADR-0014 established the workspace model and the Capability
Engine. A final review before database design identified five gaps that
would directly shape the storage model and would be expensive to correct
afterwards.

- **Work performed had no first-class representation.** Maintenance
  described care over time; the marketplace described a transaction.
  Neither owned the actual record of what was done — the diagnosis, the
  parts, the measurements, the evidence. That record is the single richest
  input to Property Memory, and it had nowhere to live.
- **The composition of property, locations, assets, records, events,
  memory and relationships had no name**, which meant future technologies
  (IoT, BIM, floor plans, building automation, energy monitoring) had no
  stated attachment point and would each have arrived as an architectural
  question.
- **Knowledge was modelled as records rather than connections.** The
  questions the platform exists to answer — has this failed before, is
  this part compatible, what else stops if this stops, which regulation
  applies — are all relational and unanswerable from independent
  collections.
- **Process was implicitly hardcoded.** Residential repair, warranty
  claim, inspection, insurance claim, emergency response and enterprise
  approval are materially different processes over the same objects.
  Nothing in the model said where that difference lives, which invited it
  into application code or storage-layer triggers.
- **Execution was under-specified.** ADR-0014 established that the
  marketplace is not the entry point, but did not enumerate the
  alternatives or commit to how the platform chooses between them when
  the best answer earns it nothing.

## Decision

Five concepts are added to `PLATFORM_DOMAIN_MODEL.md`, and one principle.

**1 · Service Record (§13.2)** — the permanent record of work performed.
The consequential part is that it is **one shared object, not two
records**: written once, belonging permanently to both the property's
history and the performing workspace's operational history, read by each
from its own perspective.

Visibility is split by a stated rule: **facts about the work are shared;
commercial and internal context is not.** A part number is a fact about
the building; the margin on it is a fact about the business. Completed
records are amended with authorship and time, never overwritten, because
they will be asked to serve as evidence in warranty claims, insurance
claims, compliance audits, disputes and sales.

**2 · Digital Twin (§9.2)** — the named composition of property,
locations, assets, documents, maintenance, service records, events,
timeline, memory, knowledge and relationships. Explicitly *not* a 3D
model. It is named so that IoT, BIM, floor plans, building automation,
energy monitoring, smart home and enterprise facilities each have a
stated attachment point and none requires structural change.

**3 · Knowledge Graph (§19.2)** — understanding held as connections
between things rather than records about things. It has **two tiers**: a
workspace graph (private, containing this workspace's own reality) and a
world graph (shared, containing manufacturers, models, parts,
compatibility, regulations and general failure patterns). A fact may be
promoted from the first to the second **only if it remains true once every
reference to its origin is removed** — which makes `PROPERTY_MEMORY.md`
§6's two loops a structural rule rather than an intention. Asserted and
inferred edges stay permanently distinguishable.

**4 · Workflow Engine (§14.2)** — every process is a versioned workflow
definition held as configuration; no process is hardcoded, and in-flight
work keeps the definition version it started under. One engine
interprets all definitions; capability gates which are available;
jurisdiction and vertical are configuration.

This also answers, for the first time, where the platform's business
rules live: **in versioned workflow definitions interpreted by one
engine** — not distributed across application code, and not embedded in
storage-layer triggers. Rules expressed as data can be varied by
jurisdiction, gated by capability, versioned per instance, inspected by
the intelligence, and tested. Rules embedded in a storage technology can
do none of those.

**5 · Execution Model (§14.1)** — a stated sequence of Intent →
Diagnosis → Plan → Execution → Outcome → Learning, with eleven
enumerated execution strategies: warranty, DIY guidance, watch and wait,
insurance, manufacturer, internal team, trusted provider, contracted
provider, procurement, marketplace, and future automation. Most earn the
platform nothing.

**New Principle 11 — Outcome Over Activity:** the platform always
optimises for the best outcome for the workspace, never for marketplace
volume; where those diverge, the workspace wins, including when the best
outcome earns the platform nothing. This carries a structural obligation:
**the platform must record the outcomes it earns nothing from**, or it
will have a hole in its memory exactly where its most trust-building
advice lives.

Principles grow from thirteen to fourteen; derived rules from twenty to
twenty-two. `PLATFORM_DOMAIN_MODEL.md` is declared **Version 1.0 and
frozen**, with a recorded architectural verification in §32.

## Consequences

**Makes easier**

- Property Memory gains its richest input. Diagnosis, parts, measurements
  and technician notes now reach the property instead of staying with the
  provider.
- Disputes become resolvable, because there is one record of what
  happened rather than two accounts of it.
- Internal and external work become comparable, since both produce the
  same record.
- New building technologies attach to a named structure instead of
  prompting an architecture discussion each time.
- Relational questions — compatibility, dependency, recurrence,
  regulation — become ordinary traversal.
- New processes, verticals and countries become workflow definitions
  rather than code.
- The platform can give the answer that earns nothing, which is what makes
  it worth asking first.

**Makes harder**

- Service Records require a deliberate visibility split. A mistake exposes
  a business's cost base to its customer or a household's private notes to
  a contractor. This is now the most safety-critical detail for
  `DATABASE_ARCHITECTURE.md`.
- The Knowledge Graph is the most demanding thing in the domain model for
  storage to satisfy. Traversal depth, not volume, is the cost.
- Configurable workflows are less predictable than fixed code: a badly
  authored definition can deadlock, and "why is this stuck?" is harder to
  answer about an interpreted definition.
- Rich service records burden the person holding the tools, and thin
  records starve everything downstream. The cost of writing a record is
  therefore an architectural concern, not a UI detail.
- The world graph is the second platform-level structure to cross the
  workspace boundary after aggregate analytics. Two crossings are twice
  the surface area of one.

**Rules out**

- Separate customer-side and professional-side records of the same work.
- Overwriting a completed service record.
- Hardcoded process logic, including business state machines embedded in
  the storage layer.
- Treating the marketplace as the default or only execution strategy.
- Discarding outcomes that generate no revenue.
- Promoting any property-specific fact into shared platform knowledge.

**Review findings, recorded in §32.** The review found one genuine
violation and corrected it: this revision initially introduced two
near-identical six-stage loops (the Execution Model and the intelligence
lifecycle), which would have produced two implementations. They are now
stated as one loop entered from two directions. It also clarified that
"AI is capability-independent" means **one engine, bounded reach** — the
engine is the same everywhere, but it cannot exceed its workspace's
capabilities, since an assistant that can do what its workspace cannot is
a bypass of the capability gate.

**Relationship to ADR-0013 and ADR-0014.** Both are extended; neither is
superseded. Every prior decision stands. Their texts are left intact per
the convention in `README.md` that an ADR records a point-in-time
decision and is never rewritten.

**Architecture freeze.** With this ADR the platform architecture is
frozen. `PLATFORM_DOMAIN_MODEL.md` Version 1.0 is the definitive
foundation, and `DATABASE_ARCHITECTURE.md` is designed from it. Changes
to the frozen model require a new ADR.
