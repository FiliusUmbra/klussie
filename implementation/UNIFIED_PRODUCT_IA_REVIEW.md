# One Klussie: Information Architecture Review

**This document owns:** a structural review of the product as one
application, not three — written before any screen redesign, per the
explicit instruction governing it: *"redesign the product structure
first."* It does not propose visual designs, component APIs, or copy.
It names what the structure is today, where it leaks backend concepts
into the experience, and what the structure should become.

**Status.** Review. No code changes in this pass. Every finding below
was checked directly against the current codebase (file and line),
not assumed from the roadmap docs describing intent.

**Relationship to existing docs.** `ROADMAP_A/B/C` and
`docs/product/HOME_OPERATING_SYSTEM.md`/`EXPERIENCE_VISION.md` remain
the owning documents for *why* the product exists and what it's for.
This document sits one layer below them: it is the structural
consequence of the same mandate that produced them, applied to how
the app is currently *organized*, not what it's *for*. Where this
review finds a real contradiction between an existing doc and what's
actually built, that's named explicitly, not silently resolved.

---

## 0 · The core diagnosis, stated once

**Klussie is not one application today. It is three, switched by a
backend value.** Checked directly in `src/shell/AppShell.jsx`:

```js
} else if (isOperator) {
  body = <OperatorApp />;
} else if (effectiveRole === "pro") {
  body = proProfile ? <ProApp showToast={showToast} /> : <BecomeProPrompt .../>;
} else {
  body = <CustomerApp showToast={showToast} />;
}
```

Three separate component trees — `CustomerApp`, `ProApp`,
`OperatorApp` — each with its own tab set, its own bottom nav (or, for
Operator, no bottom nav at all), its own Profile-equivalent screen.
`deriveEffectiveRole()`'s own comment names the mechanism honestly:
*"which entire app a person sees."* Switching context — tapping
`WorkspaceSwitcher` — doesn't change what one screen shows; it
unmounts one application and mounts a different one. That is the
literal, mechanical cause of "feels like entering another
application," not a visual-design symptom to polish over.

This review is not a call to merge the three files into one. Given
`ENGINEERING_STANDARDS.md`'s own "no business logic in UI" discipline
and this codebase's own feature-boundary convention
(`src/customer`, `src/pro`, `src/operator`), separate implementation
files are fine — a customer's screens and a business's screens
*should* differ in content and depth. **The problem is not separate
code. The problem is that the seams between them are visible to the
person using the product, and named after backend concepts when they
are.**

---

## 1 · Navigation hierarchy

**Today:** three independent hierarchies, not one with depth.

| | Customer | Professional | Operator |
|---|---|---|---|
| Nav pattern | Bottom tab bar (`BottomNav`) | Bottom tab bar (`BottomNav`, same component) | Top segmented control, no bottom nav |
| Tabs | Home · Requests · Messages · Profile | Dashboard · Jobs · Business · Messages · Profile | Audit · Workspaces |
| Localized | Yes, 10 locales | Yes, 10 locales | **No — hardcoded English**, by explicit design comment |
| Own heading | Conversational canvas, no chrome heading | Same | **"Klussie Operations"** — a second product name |

Customer and Professional already share the real `BottomNav`
component and the same visual language — that consistency is real and
should be preserved, not rebuilt. **Operator is the actual break**: a
different nav pattern, a different heading that reads as a separate
product ("Klussie Operations," "Signed in as an operator"), and a
`WorkspaceLookup` tab literally labeled **"Workspaces."** An operator
who is also a real customer (a genuine, named case in `ADR-0030`)
experiences a harder context switch than the customer→pro one this
whole review exists to fix.

**What "one hierarchy" means, structurally:** not that a customer and
an operator see the same tabs — they shouldn't. It means the *pattern*
(bottom nav, consistent chrome, one voice) stays constant while the
*content* of the tabs is what expands with responsibility. Operator
needs to adopt the same shell pattern Customer/Pro already share, not
invent its own.

---

## 2 · Screen ownership

**Today:** ownership is assigned by backend workspace type, not by
what the screen is *about*. `ProProfile.jsx` and `CustomerProfile.jsx`
are two entirely separate files with separate layouts, separately
duplicating structurally identical concerns (avatar, stats,
workspace/language switchers, "Hulp & uitleg," sign out) — checked
directly, both files carry near-identical blocks with different
prop names and different surrounding sections.

This is not necessarily wrong — a pro's profile legitimately needs
sections a customer's doesn't (services offered, portfolio, the flexi
tracker). But the *ownership boundary* is drawn at "which app is
this," when the more natural boundary — matching the mandate's own
"users interact with their home, their work, their conversations,
themselves" — is **by subject**, with capability determining how much
of that subject is visible, not which screen exists.

**A concrete instance:** "Themselves" (Profile/identity/settings)
should arguably be **one screen that reveals more sections as
capability grows** — the same screen a solo customer, a working pro,
and eventually a business owner all open, showing more each time,
never a rebuilt screen with a different name. Today it's three files
that happen to look similar because they were built by copying one
into the other, not because they're structurally one screen.

---

## 3 · Context switching

**Today, the switcher changes which application is mounted, not which
context a stable application is viewing.** Already covered mechanically
in §0. Two further findings specific to the switching experience
itself:

**Finding A — the word "workspace" is user-facing in three real
places**, not a naming nitpick but the literal thing the new mandate
prohibits:
- `WorkspaceSwitcher.jsx`: `t.workspaceSwitchLabel` renders as
  "Werkruimte"/"Workspace" depending on locale, above a switcher
  showing `m.workspace_name || m.workspace_type` — meaning an
  unnamed workspace falls back to literally printing `"personal"` or
  `"professional"` to the user.
- `OperatorApp.jsx`: hardcoded `"Workspace"` label, plus a tab
  literally named `"Workspaces"`.
- `AppShell.jsx`'s topbar-only demo toggle, `previewingAs` — not real
  production behavior, but a second, parallel switching mechanism
  that coexists with the real one, which is its own consistency
  problem (§7).

**Finding B — two switching mechanisms coexist, one real and one
demo, and nothing in the UI tells them apart.** `WorkspaceSwitcher`
(real, `≥2` live memberships) and the `previewingAs` segmented
control (a same-session customer/pro *preview* toggle, unconnected to
real membership data, existing from before Epic 03) render in the
exact same topbar slot, styled identically. A real professional with
exactly one workspace still sees the demo toggle, not the real
switcher — meaning the mechanism they interact with to "become who
they are" is, structurally, a leftover demo affordance.

**What "context switching" should mean structurally:** the person
never leaves Klussie to switch context — the *shell* stays mounted,
and the *content within it* reflects the chosen identity. The switch
itself should read as choosing which hat they're wearing right now
("Home" vs. a business's own name), the same vocabulary the mandate
specifies, never a technical membership list.

---

## 4 · Progressive disclosure

**What's already real and working:** `PLATFORM_DOMAIN_MODEL.md` §27's
own rule — a single-workspace person sees no workspace concept
anywhere — is genuinely honored in the single-membership path
(`resolveActiveWorkspace`'s own null/single-membership handling,
`AppShell`'s `multiWorkspace` gate). This is real progressive
disclosure, already built, and should be the model extended everywhere
else, not replaced.

**Where it breaks down:** the moment a second capability appears
(becoming a pro, an operator also holding a personal workspace), the
product doesn't progressively reveal more *within one experience* — it
swaps the whole experience out from under the person (§0). Progressive
disclosure today is binary (0 or 1 memberships: nothing extra shown; ≥2:
a completely different app becomes reachable) rather than gradual
(more sections appear within a stable shell as capability grows).

**The Service Record editor's own private annex** (`.private-annex`,
shipped this session) is the one place in the current codebase that
already does progressive disclosure correctly *within* a single
screen — a visually distinct section, collapsed by default, revealing
business-only depth without ever becoming a different screen. That
pattern — not a new invention — is the right template to extend
upward from screen-level (annex-in-a-form) to shell-level (business
capabilities-within-one-app).

---

## 5 · Role expansion

**This is the review's most urgent concrete finding.** Checked
directly: **there is no real, reachable way to become a professional
on an actual phone today.**

`BecomeProPrompt`/`BecomeProSheet` — the only code path that starts
this flow — is mounted exclusively from `AppShell.jsx`'s `role ===
"pro"` branch, which is only reachable by tapping the `previewingAs`
segmented control in the topbar. That topbar is `.topbar{
display:none }` below 460px in `appStyles.js` — **every real phone**,
the identical CSS rule this session already found and fixed twice this
week for `WorkspaceSwitcher` (PR #75) and `LanguageSwitcher` (PR #76).
Grep confirms no call site for `BecomeProPrompt` or a "become a pro"
action exists anywhere under `src/customer/` or `src/profile/`'s own
profile screens. **The single most important role-expansion moment in
the entire product — the literal mechanism behind "capabilities
expand as responsibilities grow" — is currently invisible on the
platform's own primary surface.**

This is worse than the two prior instances: WorkspaceSwitcher and
LanguageSwitcher were unreachable *conveniences* for people who
already held a second capability. This is the *on-ramp itself*,
unreachable for everyone who doesn't have one yet. It should be
treated with the same urgency as those two fixes, not folded quietly
into a larger redesign.

**The pattern established this session for becoming a pro** (the
tour, PR #81) already assumes this moment is reachable and well-lit —
`GUIDANCE_SYSTEM.md` §17.2.1's own opener fires "the instant
`BecomeProSheet.onDone()`," which today can only happen through a
topbar control nobody on a phone can see.

**Business/Enterprise** — the next rung — has no UI at all yet
(`GUIDANCE_SYSTEM.md` §17.2.2, already honest about this: "no
`BecomeBusinessSheet`, no business dashboard"). Out of scope for this
review to design (per the same document's own restraint against
"inventing steps for a control that isn't there") but named here as
the next expansion this IA needs room for structurally, even before
any of its own screens exist.

---

## 6 · Empty states

Not surveyed screen-by-screen here (that's implementation detail, not
structure), but one structural pattern worth naming: this session's
own established discipline — *"empty states should educate and
encourage"* — has been applied well in isolation (`ServiceRecordSummary`'s
"your pro will write this up," `BecomeProPrompt`'s invitation framing)
but has no connective tissue between instances. An empty Requests tab,
an empty Service Record, and the "become a pro" invitation are three
unrelated pieces of copy with three different visual treatments
(`.empty-block` used inconsistently with and without an icon, a button,
or a two-line message). Once the shell is unified (§0-§3), empty
states are the natural first place role-expansion itself gets
*taught*, not just tolerated — an empty Jobs tab for a customer who
hasn't tried a service yet is a legitimate place to mention, quietly,
that offering services is possible, the same way `BecomeProPrompt`
already frames it as an invitation rather than a wall.

---

## 7 · Discoverability

Three concrete, already-identified discoverability failures, gathered
here because they share one root cause — **critical controls placed
only in the desktop-mockup topbar, which is invisible on every real
phone**:

1. **WorkspaceSwitcher** — fixed, PR #75.
2. **LanguageSwitcher** — fixed, PR #76.
3. **Become a pro** — *not yet fixed* (§5 above), and the most
   consequential of the three.

The fact that this exact bug class has now been found three times
independently is itself a structural finding: **the desktop-mockup
topbar should not be treated as a real, reachable surface for any
control a real user needs**, full stop, rather than each instance
being fixed as it's separately discovered. Any future control placed
only there should be treated as not shipped until it also has a home
in the real, mobile-reachable shell.

---

## 8 · Home Operating System principles

`HOME_OPERATING_SYSTEM.md` §2 describes My Home as *"not a new
screen... the Profile tab, grown up... no new tab, no unnecessary
navigation."* Checked against what's actually shipped
(`ROADMAP_A_CUSTOMER_EXPERIENCE.md` §3.2, and confirmed live in the
browser this session): **My Home is not the Profile tab grown up — it
lives nested inside the Home tab** ("Klussie / Mijn woning / Mijn
spullen"), while Profile stayed identity/account settings. This is a
real, unresolved drift between the original HOS vision document and
what actually shipped, not a design choice this review should
silently paper over.

**Which one is right, structurally, matters for this review's own
recommendation:** the shipped placement (My Home inside the Home tab)
is the one that actually holds up under the "one product" mandate —
it keeps Profile as the one stable "themselves" surface every
capability level shares (§2), rather than overloading it with subject
matter (the home itself) that has nothing to do with identity. This
review recommends the HOS document be corrected to match what
shipped, not the other way around — flagged here for a documentation
follow-up, not decided unilaterally in this pass.

**The deeper HOS principle that *does* apply structurally, and isn't
yet honored:** *"not a platform people visit when something breaks,
but the place they keep the truth about their home."* A product a
person "keeps the truth" in is definitionally one they don't leave —
which is the strongest possible argument, independent of the explicit
mandate, for why Klussie cannot feel like three switchable
applications. The HOS vision and the "one product" mandate are the
same requirement, arrived at from two different directions.

---

## 9 · What this means, structurally — not yet a screen design

Per the governing instruction, this section states the target
*structure*, not its visual form:

1. **One shell, always mounted.** The chrome (nav pattern, header
   language, the identity switcher) does not remount when identity
   changes. Only its content depth changes.
2. **Identity switching is human language, not workspace language.**
   "Home" / a business's own name / "Platform Operations" (operators
   only) — never "workspace," never a raw `workspace_type` fallback.
   This applies to Operator too — it is not exempt from the product's
   own voice merely because its audience is internal.
3. **Screens are owned by subject, not by backend role.** Profile
   ("themselves") is one screen that reveals more as capability grows,
   not three separate files. The same reasoning extends to any future
   screen a customer, pro, and business owner would all recognize as
   "the same place, more of it."
4. **Role expansion is an in-product invitation, always reachable on
   a real phone**, never a topbar-only control. Becoming a pro,
   eventually becoming a business, should each read as the product
   growing with the person, discoverable from the stable shell itself
   (most naturally: from within the unified Profile/"themselves"
   screen §2 already establishes), not from a separate settings-like
   surface.
5. **Operator adopts the same shell pattern as everyone else.**
   Different tabs, same nav mechanism, same chrome, same voice, real
   localization (or a deliberate, explicitly-decided exemption — not
   a silent one). "Klussie Operations" as a second product identity
   is retired in favor of Operator being a capability level within
   the one product, the same as Business will eventually be.

**What this deliberately does not do:** merge `CustomerApp.jsx`,
`ProApp.jsx`, and `OperatorApp.jsx` into one file, redesign any
screen's visuals, or propose new components. Those are the *next*
pass, once the structure above is agreed — consistent with the
instruction this review exists to satisfy.

---

## 10 · Suggested sequencing, not yet committed to

In rough order of urgency, each independently shippable:

1. **Fix "become a pro" discoverability** (§5) — the same class of
   fix as PRs #75/#76, and the most consequential single gap found in
   this review. Does not require the shell unification below to ship
   first.
2. **Retire the `previewingAs` demo toggle**, or make its relationship
   to the real switcher explicit — two switching mechanisms in the
   same slot is a real, confusing inconsistency independent of
   anything else in this document.
3. **Rename "workspace" out of every user-facing string** (§3, Finding
   A) — a contained, mechanical fix once the human-language identity
   names (§9.2) are decided.
4. **Unify Operator into the shared shell pattern** (§1, §9.5) — the
   single biggest visible "separate application" signal in the
   product today.
5. **The deeper structural work** (one Profile screen, subject-owned
   screens more broadly, §2/§9.3) — the largest, slowest-moving
   change, and the one most worth a full design pass rather than a
   quick fix, once 1-4 are settled and the vocabulary they establish
   is stable.

This document does not decide this order — it is offered as a
starting point for that decision, which belongs to the CPO role, not
assumed by the review that surfaces it.
