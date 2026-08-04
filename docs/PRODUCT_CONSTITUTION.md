# The Klussie Product Constitution

This is the law. Every pull request should satisfy it. When a rule and a deadline
conflict, the rule wins — cite the rule number in review if a change doesn't.

**Rule 1 — AI before forms.**
If AI can remove a click, remove the click. If AI can remove a form, remove the form.
Don't make a user fill in something the system could have inferred or asked for
conversationally.

**Rule 2 — Never hardcode business logic.**
Categories, services, pricing rules, thresholds — if it's a business decision, it's
data, not source code. A new service should be a config change (see Phase 5, the
Marketplace Engine), not a deploy.

**Rule 3 — Everything configurable.**
Follows from Rule 2. Feature flags, per-tenant settings, per-country rules — build the
knob before you need to turn it, not after.

**Rule 4 — Everything measurable.**
No feature ships without knowing which of the Product KPIs (see
`docs/ENGINEERING_STANDARDS.md`'s sibling KPI table in the architecture review) it's
supposed to move. "It seemed useful" is not a metric.

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

**Rule 10 — Every feature must improve at least one KPI.**
See the Product KPIs table in the architecture roadmap. If a proposed feature doesn't
move time-to-first-booking, AI accuracy, first-time fix rate, pro response time,
booking completion, NPS, or either retention number — it doesn't ship yet, no matter
how interesting it is to build.
