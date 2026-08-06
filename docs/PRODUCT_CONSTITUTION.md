# The Klussie Product Constitution

**This document owns:** permanent product philosophy — the Principles that
justify *why* something gets built, and the Rules that enforce *how*. It
does not own current implementation status (`MASTER_CONTEXT.md`) or
code-level enforcement mechanics (`ENGINEERING_STANDARDS.md`).

This is the law. Every pull request should satisfy it. When a rule and a deadline
conflict, the rule wins — cite the rule number in review if a change doesn't.

## Product Principles

The permanent *why* behind every product decision. Principles don't
change; how progress against them is measured does — see the Product KPIs
table in `MASTER_CONTEXT.md` §14, which is expected to evolve.

- **Trust** — the platform is worth nothing if people don't believe in it.
- **Simplicity** — every removed click, form field, or decision is a win.
- **Conversion** — a request that doesn't become a booking helped no one.
- **Retention** — a one-time user is a failed marketplace, not a success.
- **Scalability** — a solution that only works at today's size isn't one.
- **Marketplace Liquidity** — supply and demand have to find each other,
  reliably, or nothing else here matters.

Principles and KPIs are complementary, not alternatives: a Principle is the
reason a feature is worth building; a KPI is the proof it worked. Rule 10
requires both.

## Rules

**Rule 1 — AI before forms.**
If AI can remove a click, remove the click. If AI can remove a form, remove the form.
Don't make a user fill in something the system could have inferred or asked for
conversationally.

**Rule 2 — Never hardcode business logic.**
Categories, services, pricing rules, thresholds — if it's a business decision, it's
data, not source code. A new service should be a config change (see Phase 5, the
Marketplace Engine), not a deploy.

**Rule 3 — Everything configurable.**
Follows from Rule 2. Feature Flags, per-tenant settings, per-country rules — build the
knob before you need to turn it, not after.

**Rule 4 — Everything measurable.**
No feature ships without knowing which Product KPI (`MASTER_CONTEXT.md`
§14) it's supposed to move. "It seemed useful" is not a metric.

**Rule 5 — Everything secure.**
Least privilege by default. No client code holds a secret it doesn't need. No
endpoint trusts a caller it hasn't verified. See `api/_lib/auth.js` for the pattern:
authenticate as the calling user, never reach for a service-role key just because
it's more convenient.

**Rule 6 — Accessibility is mandatory.**
Not a phase, not a nice-to-have. Every interactive element is keyboard-reachable,
every state change is announced, every color choice holds contrast in both themes.

**Rule 7 — Performance is a feature.**
A slow AI response, a janky list, a blocked main thread — these are bugs, not
"future optimization work." Ship the loading state; then go fix the thing that needed
one.

**Rule 8 — One source of truth.**
A fact lives in exactly one place. If `SERVICE_QUESTIONS` and the AI's prompt both
need to know a service's fields, one of them reads from the other — they don't each
maintain their own copy that can drift.

**Rule 9 — Trust beats growth.**
When a growth tactic and a trust commitment conflict, trust wins. A fake "boost"
button that doesn't charge anyone, a certification badge with no evidence behind it —
these are the kind of shortcuts this rule exists to rule out.

**Rule 10 — Every feature must serve a Principle and move a KPI.**
Principles (above) are why a feature is worth building; KPIs
(`MASTER_CONTEXT.md` §14) are proof it worked. If a proposed feature
doesn't serve at least one Product Principle, or isn't expected to move
Time to first booking, AI understanding accuracy, First-time fix rate,
Professional response time, Average booking completion, NPS, Customer
retention, or Professional retention — it doesn't ship yet, no matter how
interesting it is to build.

## Design Constitution

Klussie wins through trust, not novelty.

Every interface should reduce stress.

Every interaction should increase confidence.

Beauty is not decoration.

Beauty is clarity.

AI should disappear into the experience.

Technology should never become the personality of the product.

People trust people.

The interface should always feel human.

The actionable version of this — brand personality, color/typography/motion
rules, component litmus test — is `design/DESIGN_SYSTEM.md`. This section is why;
that document is how.

---

Version 1.1 — 2026-08-06 (added: Product Principles section, Design Constitution; backfilled the version footer this document was missing since it predates that convention)