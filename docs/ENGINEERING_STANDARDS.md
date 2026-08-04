# Klussie Engineering Standards

Concrete rules that keep `docs/PRODUCT_CONSTITUTION.md` enforceable in code review,
not just in spirit.

- **No component over 300 lines.** `src/App.jsx` is 2,784 lines and violates this
  today, by a wide margin — that's not a contradiction, it's the reason Phase 1's
  design-system extraction is the first real cut into that file, not a someday
  cleanup.
- **No function over 40 lines.** If it's longer, it's doing more than one thing —
  split it.
- **Everything typed.** TypeScript adoption starts in Phase 2, incrementally
  (smallest/most-depended-on files first, never a big-bang rewrite).
- **Everything documented.** A module that isn't obvious from its name gets a comment
  explaining *why*, not just *what* — see the existing `src/lib/*.js` files for the
  house style.
- **Everything reusable.** If you're about to copy-paste a component or a query
  shape, it belongs in the design system or a shared `src/lib` module instead.
- **No duplicated code.** Same rule, different angle.
- **No inline SQL.** Migrations live in `supabase/migrations/`; application code calls
  through `src/lib/*.js` or, server-side, through Core modules — never a raw query
  string assembled inside a component.
- **No inline prompts.** AI prompts live in `/ai/{module}/prompt.md` plus the
  prompt-construction code that needs runtime data (see `api/ai-intake.js` for the
  current pattern) — not as a string buried in an endpoint with no home of its own.
- **No magic numbers.** `CONFIDENCE_THRESHOLD`, `MAX_PHOTOS`, `WINDOW_MINUTES` — name
  the constant, even when it's only used once.
- **No business logic in UI.** Commission math, trust-score computation, matching
  rules — these belong in `src/lib` or a Core module, not inline in a component's
  render function.

## Where the codebase stands against this today

Honest accounting, so this document doesn't read as aspirational fiction:

| Standard | Status |
|---|---|
| No component over 300 lines | ✗ — `src/App.jsx` is still 2,823 lines. The design system (`src/design-system/`, 4 files, ~220 lines total) is real and has genuine usages wired in (Discover, RequestsList, pro leads, RequestDetailSheet, ProProfile), but most of App.jsx's inline patterns aren't migrated yet — that's follow-up work, not a one-phase job |
| No function over 40 lines | Mixed — most `src/lib` functions comply, several App.jsx components don't |
| Everything typed | ✗ — plain JS/JSX throughout; starts Phase 2 |
| Everything documented | Mostly — `src/lib/*.js` and `src/design-system/*.jsx` are well-commented; inline component logic in App.jsx less so |
| Everything reusable | Improving — 14 design-system components exist (Button, Card, Modal, Drawer, Avatar, Badge, Rating, ServiceCard, AIMessage, JobCard, Timeline, QuoteCard, TrustBadge, PriceTag), each with at least one real call site, not speculative scaffolding. Still many inline `.svc-card`/`.ticket`/`.quote-card` instances in App.jsx not yet migrated |
| No duplicated code | Mostly — `SERVICE_QUESTIONS` is correctly shared between client and `api/ai-intake.js`; `Avatar`/`Badge`/`Rating`/`Sheet` now have exactly one implementation each instead of being defined once and copy-referenced |
| No inline SQL | ✓ |
| No inline prompts | ✓ as of this phase — prompts now have a `/ai/` home; prompt-construction logic with runtime dependencies stays in the endpoint by design (see `ai/intake/prompt.md`) |
| No magic numbers | Mostly ✓ — see `CONFIDENCE_THRESHOLD`, `MAX_PHOTOS`, `WINDOW_MINUTES`, `MAX_CALLS_PER_WINDOW` |
| No business logic in UI | ✗ — commission math and trust-score computation are still inline in `src/App.jsx` |

## Known follow-up (not done in this pass)

- Most of App.jsx's remaining inline `.svc-card`/`.ticket`/`.quote-card`/price patterns
  (SendQuoteSheet, ProJobs, CustomerProfile, ProPublicProfileSheet, and others) still
  write their own markup instead of using the design system — migrated opportunistically
  as those areas get touched, not swept all at once.
- A handful of places in `src/App.jsx` render literal `\uXXXX` escape-sequence text
  instead of the real character (JSX text content doesn't interpret backslash escapes
  the way a JS string does) — one instance fixed in `RequestDetailSheet`, the rest
  flagged as a separate follow-up task.
