# Unified Profile — Design Note (IA review §10 item 5)

**This document owns:** the target structure for "one screen owned by
subject, not by backend role," written *before* implementation, per the
CPO mandate's own "document before implementing" discipline — the same
discipline `WP_3_3_SERVICE_RECORD_EDITOR_DESIGN.md` already followed.
It applies `implementation/UNIFIED_PRODUCT_IA_REVIEW.md` §2 and §9.3
against the real code that exists today — it does not restate that
review's reasoning, only what follows from it concretely.

**Status.** Design only. No component code changes yet. §10 items 1-4
are all shipped (PRs #83-#87) — see
[`UNIFIED_PRODUCT_IA_REVIEW.md`](UNIFIED_PRODUCT_IA_REVIEW.md) §10 for
the full sequencing and [[klussie-unified-product-ia-review]] for the
memory record.

---

## 1 · What exists today, checked directly against the code

Three files render "themselves" today, one per app tree:

- `src/customer/CustomerProfile.jsx` (82 lines)
- `src/pro/ProProfile.jsx` (222 lines)
- `src/operator/OperatorApp.jsx`'s own `tab === "profile"` block (~25
  lines, inline, not a separate file)

Diffed section-by-section, the overlap is not superficial:

| Section | Customer | Pro | Operator |
|---|---|---|---|
| Avatar + name + identity line | `profile-head` block, `Avatar` + name + email | `profile-head` block, `Avatar` + name + `TrustBadge` | plain "Signed in as an operator" text, no avatar |
| Workspace switcher + language switcher | `<WorkspaceSwitcher t={t} /><LanguageSwitcher light />` | identical, byte-for-byte | inline `segmented` reimplementation of the same switcher, not the shared component |
| Stats row | requests sent / jobs completed | jobs done / status / trust score | none |
| Subject-specific content | reviews received | pause toggle, pro type, flexi tracker, services offered, portfolio, testimonials, boost | none (audit/lookup live in their own tabs, not here) |
| Role-expansion invitation | "become a pro" block (`onBecomePro`, gated on `!proProfile`) | none (already a pro) | none (not applicable) |
| Help / replay tour | `helpSectionTitle` + `helpReplayTour` button | identical block, identical strings | none (no operator tour exists) |
| Edit profile | `btn-secondary` → `EditProfileSheet` | identical, plus `onSaved={onProfileSaved}` | none |
| Sign out | `btn-secondary` + `LogOut` icon | identical | identical, but hand-written rather than shared |

Five sections — identity header, switchers, help/replay-tour, edit
profile, sign out — are byte-for-byte or near-byte-for-byte duplicates
maintained in three places today (Operator's switcher and sign-out are
worse than duplicated: they're a *third, independent implementation* of
the same two behaviors, which is exactly the "workspace" leak §3
Finding A already caught once in this same file before PR #85 fixed the
label — the underlying component was never unified, only its string
was).

This confirms §2's own diagnosis without needing to re-argue it: the
duplication is real, structural, and already causing drift (Operator's
switcher reimplementing `humanWorkspaceName` correctly but the sign-out
button not reusing any shared component at all).

## 2 · What must NOT be unified — the genuine, capability-driven differences

Per §9's own restraint ("this deliberately does not... redesign any
screen's visuals, or propose new components" at the shell level — the
same restraint applies one level down, to Profile specifically):

- **Pro-only sections are real, not duplicated-by-accident**: pause
  toggle, pro type, flexi tracker, services offered, portfolio,
  testimonials, boost. A customer has none of these because a customer
  *has none of these things*, not because the screen forgot to show
  them. These stay pro-only content, gated by capability, exactly as
  they are today.
- **Operator's Profile tab legitimately stays the thinnest** — no
  stats, no reviews, no portfolio. An operator's "themselves" really is
  just identity + switcher + sign-out. This is not a screen that needs
  more; it already is the unified shape's minimum, which is itself
  useful confirmation that the target structure in §3 is right (Operator
  is close to what the shared shell alone should render with every
  optional section switched off).
- **Reviews (customer) vs. reputation stats (pro) are not the same
  section wearing two names** — a customer's reviews are what they
  *wrote*; a pro's trust score/badge are what they *earned*. These
  render from different data and stay conceptually distinct sections,
  not one unified "reviews" block.

## 3 · Target structure

One component, `src/profile/Profile.jsx` (new location — `src/profile`
already exists and holds every sheet all three current files already
share: `EditProfileSheet`, `PortfolioItemSheet`, `AddTestimonialSheet`,
`BecomeProSheet`, `BecomeProPrompt`; the parent screen belongs beside
its own sheets, not inside `src/customer` or `src/pro`), composed of:

**3a. Shared sections — one implementation, rendered for everyone:**
- `ProfileIdentityHeader` (avatar, name, the one identity-line
  variant per audience — email for a customer, `TrustBadge` for a pro,
  nothing extra for an operator — passed as a `subtitle` slot, not a
  branching prop)
- `WorkspaceSwitcher` + `LanguageSwitcher` — already shared components;
  Operator's inline reimplementation (§1's third-implementation problem)
  is retired in favor of calling the real ones, closing the drift this
  design note exists partly to catch
- Help / replay tour — already string-identical between Customer and
  Pro; becomes one block, rendered whenever an `onReplayTour` prop is
  passed (Operator has no tour, so it simply omits the prop, exactly
  like `onBecomePro` already works as an optional prop in
  `CustomerProfile` today)
- Edit profile button + sign out button

**3b. Capability-gated sections — same component tree, present only
when the subject has the underlying thing:**
- Stats row: which stats, computed from what props, stays per-audience
  — but rendered through one `<StatRow items={...}/>` primitive instead
  of three copies of `stat-row`/`stat`/`stat-num`/`stat-label` markup
- Reviews (customer) / standing block: pause toggle, pro type, flexi
  tracker, services, portfolio, testimonials, boost (pro) — these stay
  exactly as complex and pro-specific as they are today; they simply
  live in the same file as sections, not a separate file
- Role-expansion invitation (`onBecomePro`): already the right pattern
  — an optional prop, present only when applicable. The eventual
  "become a business" invitation (not yet built) slots in the same way,
  which is precisely §9.3's "future screen a customer, pro, and
  business owner would all recognize as the same place, more of it."

**3c. What decides which sections render:** capability the caller
already resolves today — `proProfile` (null vs. set), `isOperator`
(AppShell already computes this) — passed as props from each app's own
composition root (`CustomerApp.jsx`, `ProApp.jsx`, `OperatorApp.jsx`
still each own their own data-fetching and pass what `Profile` needs;
this design does not merge the three app files, matching §9's own
explicit non-goal one level up).

## 4 · What this deliberately does not do

Same restraint §9 states for the shell-level unification, restated here
because it applies again one level down:

- Does not merge `CustomerApp.jsx`, `ProApp.jsx`, `OperatorApp.jsx` —
  each still owns its own tabs, its own data fetching, its own
  subscriptions. Only the Profile *tab's content* becomes one component.
- Does not change any visual design — same markup classes
  (`profile-head`, `stat-row`, `section-title`, `btn-secondary`), same
  CSS, same copy. This is a structural consolidation, not a redesign.
- Does not touch Operator's stated non-localization exemption (§9.5,
  already resolved) — `Profile.jsx` accepts whatever `t` its caller
  passes, and Operator keeps passing its own hardcoded-English stand-in
  object, exactly as `OperatorApp.jsx`'s header already documents.
- Does not add a "Business" capability tier — there is no business
  workspace type yet to gate on. This design's job is making the
  *existing* three tiers (customer/pro/operator) share one
  implementation so that a fourth tier, when it exists, is a new gated
  section in one file rather than a fourth copy of the whole screen.

## 5 · Suggested implementation shape, not yet committed to

1. Extract `ProfileIdentityHeader` and `StatRow` as the two genuinely
   new shared primitives (§3a/§3b) — smallest possible first cut,
   independently testable against all three current call sites'
   existing snapshots/tests.
2. Build `Profile.jsx` in `src/profile/`, initially just wrapping the
   three existing bodies behind a `variant` prop, to prove the
   composition root and props contract work end-to-end without
   touching any markup yet.
3. Fold `CustomerProfile.jsx`'s and `ProProfile.jsx`'s own JSX into
   `Profile.jsx`'s capability-gated sections; delete the two old files.
4. Retire Operator's inline switcher/sign-out reimplementation in favor
   of the shared component, closing §1's drift.
5. Update `CustomerApp.jsx`/`ProApp.jsx`/`OperatorApp.jsx` to render
   `<Profile variant=.../>` instead of their current per-file imports.

Each step is independently shippable and revertable, matching the same
incremental discipline `WP_3_3_SERVICE_RECORD_EDITOR_DESIGN.md` §8 used
for the editor build-out.

This document does not decide *when* to start step 1 — it exists so
that decision, and any review of it, has a real target to react to
rather than the review's own one-paragraph sketch (§9.3) alone.
