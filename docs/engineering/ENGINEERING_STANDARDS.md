# Klussie Engineering Standards

**This document owns:** engineering rules — the enforceable, code-level
version of `PRODUCT_CONSTITUTION.md`. It does not own product philosophy
or current project status (`MASTER_CONTEXT.md`).

Concrete rules that keep `docs/PRODUCT_CONSTITUTION.md` enforceable in code review,
not just in spirit.

- **No component over 300 lines.** Held as of the Engineering Health sprint: the
  largest component is `AiIntakeSheet.jsx` at 300. `src/App.jsx`, which spent most
  of Phase 1 in the thousands, is now 19 lines.
- **No function over 40 lines.** If it's longer, it's doing more than one thing —
  split it.
- **Everything typed.** TypeScript adoption starts in Phase 2, incrementally
  (smallest/most-depended-on files first, never a big-bang rewrite).
- **Everything documented.** A module that isn't obvious from its name gets a comment
  explaining *why*, not just *what* — see the existing `src/lib/*.js` files for the
  house style.
- **Everything reusable.** If you're about to copy-paste a component or a query
  shape, it belongs in the Design System or a shared `src/lib` module instead.
- **No duplicated code.** Same rule, different angle.
- **No inline SQL.** Migrations live in `supabase/migrations/`; application code calls
  through `src/lib/*.js` or, server-side, through Core Platform modules — never a raw
  query string assembled inside a component.
- **No inline prompts.** AI prompts live in `/ai/{module}/prompt.md` plus the
  prompt-construction code that needs runtime data (see `api/ai-intake.js` for the
  current pattern) — not as a string buried in an endpoint with no home of its own.
- **No magic numbers.** `CONFIDENCE_THRESHOLD`, `MAX_PHOTOS`, `WINDOW_MINUTES` — name
  the constant, even when it's only used once.
- **No business logic in UI.** Commission math, trust-score computation, matching
  rules — these belong in `src/lib` or a Core Platform module, not inline in a
  component's render function.
- **Every epic updates the changelog.** [`CHANGELOG.md`](../../CHANGELOG.md) records
  what changed for someone using or operating Klussie, written at epic completion as
  one of the gates in `../IMPLEMENTATION_ROADMAP.md` §7 — not per work package, which
  would make it a second commit log. It states its own format; a behaviour change that
  reaches users and isn't recorded there is a defect regardless of intent.

## Feature boundaries

The Engineering Health sprint replaced "everything lives in `App.jsx`" with folders
that mean something. Where a change belongs is now answerable without opening a file:

| Folder | Owns |
|---|---|
| `src/App.jsx` | Composition root. Auth provider wrapping the shell — nothing else |
| `src/shell/` | Chrome, locale switch, role preview, toast, and which surface renders |
| `src/auth/` | Getting signed in, and choosing a role once |
| `src/profile/` | Profile editing and pro-profile setup, shared by both sides |
| `src/customer/` | The customer experience: requests, quotes, intake, invoices, reviews |
| `src/pro/` | The professional experience: leads, quoting, jobs, pro profile |
| `src/messaging/` | Conversations and translation, shared by both sides |
| `src/requests/` | How a request is summarised wherever one is shown |
| `src/home/` | The conversation homepage (Epic 03) |
| `src/ui/` | App-level primitives too small for the Design System |
| `src/design-system/` | Reusable visual components |
| `src/lib/` | Every rule, every constant, every string table. No JSX |

The dependency direction is one-way: `App` → `shell` → feature → shared → `lib`.
A feature folder importing from a sibling feature is a smell; the two shared folders
(`requests`, `messaging`) exist precisely so it doesn't have to.

## Where the codebase stands against this today

Honest accounting, so this document doesn't read as aspirational fiction.
Status uses only: **Implemented**, **In Progress**, **Planned**.

| Standard | Status |
|---|---|
| No component over 300 lines | Implemented — largest single component is `AiIntakeSheet.jsx` at 300. Files above 300 that don't break the rule: `design-system/domain.jsx` (317) holds ~10 small components, and `homeStrings.js` (1,030) / `appStrings.js` (983) / `appStyles.js` (463) / `homeStyles.js` (360) / `homeFollowUpStrings.js` (242) are data across 10 locales, not components |
| No function over 40 lines | In Progress — one known violation in `src/lib` (`catalog.js`'s `fetchCatalog`, 51 lines); several render functions also exceed it, which is a JSX-length problem rather than a branching-complexity one |
| Everything typed | Planned — starts Phase 2 |
| Everything documented | Implemented — every module carries a header explaining *why* it exists; the feature split gave the previously uncommented inline components a home and a reason |
| Everything reusable | In Progress — 21 Design System components, each with a real call site. Inline `.quote-card`/`.ticket` markup remains in `ProProfile`, `ProPublicProfileSheet` and `CustomerProfile` |
| No duplicated code | Implemented — the sprint removed the last known duplicates: two status→label maps became `requestStatus.js`, two unread-count reductions became `unreadTotal`, the `Sheet`/`Drawer` double-name became `Drawer`, and six copies of the loading placeholder became `LoadingScreen` |
| No inline SQL | Implemented |
| No inline prompts | Implemented — prompts have a `/ai/` home; prompt-construction logic with runtime dependencies stays in the endpoint by design (see `ai/intake/prompt.md`) |
| No magic numbers | Implemented — the sprint named the last uncontained cases: `PLATFORM_COMMISSION_RATE`, `VAT_RATE`, `FLEXI_TAX_FREE_THRESHOLD`, `BOOST_WEEKLY_PRICE`, `TYPICAL_PRICE_*_FACTOR`, `CONFIDENCE_HIGH`/`_MEDIUM`, `TOAST_DURATION_MS`, `FALLBACK_QUOTE_PRICE` |
| No business logic in UI | Implemented — commission and VAT in `billing.js`, trust score in `pros.js`, request lifecycle in `requestStatus.js`, intake rules in `aiIntakeModel.js`, pro eligibility in `proStatus.js`. Each has unit tests |

## Known follow-up (not done in this pass)

- **The extracted feature components have no render tests.** Their rules are unit-tested
  (`src/lib/__tests__`, 404 tests total), but no test asserts that `RequestDetailSheet`
  renders a timeline or that `InvoiceSheet` shows the right total. The Engineering Health
  sprint verified the move by line-level diff, build, lint and a manual smoke test — good
  enough to trust the move, not good enough to protect the next one.
- **12 places render literal `\uXXXX` escape text** instead of the real character (JSX
  text content doesn't interpret backslash escapes the way a JS string does). Carried
  through the sprint unchanged and deliberately, since fixing it changes what a customer
  reads and that sprint's contract was identical behaviour. Every site now carries a
  comment pointing here.
- **Inline `.quote-card`/`.ticket`/price markup** in `ProProfile`, `ProPublicProfileSheet`
  and `CustomerProfile` still bypasses the Design System — migrated opportunistically as
  those areas get touched, not swept all at once.
- **`src/customer/Discover.jsx` is unreferenced.** Kept on purpose: EXPERIENCE_VISION.md
  §10 retires the category grid as an entry point but keeps the matching logic, and where
  the browse UI lands is still open. It now sits in its own file so the decision is
  visible rather than buried.

---

Version 1.3 — 2026-08-12 (Epic 00 WP02: added the changelog rule)

Version 1.2 — 2026-08-11 (Engineering Health sprint: feature boundaries introduced, App.jsx split, business logic extracted and tested; status table re-audited against the real tree)
