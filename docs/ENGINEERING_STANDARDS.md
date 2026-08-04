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
| No component over 300 lines | ✗ — `src/App.jsx`, 2,784 lines |
| No function over 40 lines | Mixed — most `src/lib` functions comply, several App.jsx components don't |
| Everything typed | ✗ — plain JS/JSX throughout; starts Phase 2 |
| Everything documented | Mostly — `src/lib/*.js` is well-commented; inline component logic less so |
| Everything reusable | Partial — data-access layer is clean; UI has no shared component library yet (Phase 1) |
| No duplicated code | Mostly — `SERVICE_QUESTIONS` is correctly shared between client and `api/ai-intake.js` rather than duplicated |
| No inline SQL | ✓ |
| No inline prompts | ✓ as of this phase — prompts now have a `/ai/` home; prompt-construction logic with runtime dependencies stays in the endpoint by design (see `ai/intake/prompt.md`) |
| No magic numbers | Mostly ✓ — see `CONFIDENCE_THRESHOLD`, `MAX_PHOTOS`, `WINDOW_MINUTES`, `MAX_CALLS_PER_WINDOW` |
| No business logic in UI | ✗ — commission math and trust-score computation are still inline in `src/App.jsx` |
