# Klussie — AI Architecture

**This document owns:** the AI Gateway's internal design, the prompt
library convention, and the evaluation framework — how Klussie talks to
AI providers and how that's kept honest over time. It does not own the
product-facing request/response contracts of the endpoints that call
into it (`API_SPEC.md`) or the threat model around AI abuse
(`../engineering/SECURITY.md`).

## Why a gateway at all

Nothing in the client or in `api/*.js` route handlers talks to Anthropic
directly. Every AI call goes through `api/_lib/aiGateway.js`, which
exposes **capabilities** (`reason()`, `translate()`), not a provider
client. A caller asks for a capability with capability-shaped
parameters — a system prompt, text, images, an output schema — and
never sees an Anthropic-specific type. This is the one and only file
that knows Anthropic's tool-forcing and content-block shapes; swapping a
capability to a different provider later means changing that function's
body, not every call site (`../product/PRODUCT_CONSTITUTION.md`, Rule 1
and Rule 8 — one source of truth for how the platform talks to AI).

**Capability-based, not provider-based.** The Gateway is organized
around what a caller needs done (*reason about this*, *translate this*)
rather than which model does it. Today `reason()` and `translate()`
both happen to call Claude, but a future capability like `speech()` or
a dedicated `vision()` could route to an entirely different provider
without touching `reason()`, `translate()`, or any of their callers.

## Capabilities implemented today

### `reason({ systemPrompt, text, images, toolSchema, model, maxTokens })`

Structured classification/analysis, optionally over images. Backs
job-intake understanding. Forces a tool call
(`tool_choice: { type: "tool", name: toolSchema.name }`) so the model
can only respond in the exact JSON shape the caller asked for — there
is no "the model replied in prose instead of JSON" failure mode by
construction. Default model: `claude-sonnet-5`.

Vision is handled as part of `reason()`, not a separate capability:
Claude analyzes text and photos in one multimodal call, which is closer
to how a real dispatcher actually works than a
describe-then-reason two-step pipeline would be. If a future provider
can't do combined multimodal reasoning, vision becomes its own
capability function at that point — not speculatively split out now.

### `translate({ text, targetLocale, targetLanguageName, model, maxTokens })`

Built on top of `reason()` with a fixed system prompt and a
single-field `submit_translation` tool schema. Kept as its own exported
function (not just "call `reason()` with a translation prompt" inline
at each call site) specifically so a specialized translation provider
(DeepL, for instance) could replace this implementation without
touching `reason()` or intake's callers. Default model:
`claude-haiku-4-5-20251001` — deliberately smaller/cheaper than the
reasoning model, since translation is a lighter-weight task run far
more frequently (once per chat message vs. once per job description).

## The prompt library

Convention: `/ai/{capability}/prompt.md` + `/ai/{capability}/evaluation.md`.
Prompts live here, not as strings buried in an endpoint file
(`../engineering/ENGINEERING_STANDARDS.md`, "no inline prompts") — the
prompt-construction *code* that needs runtime data (the live service
catalog, per-service field schemas) stays in the endpoint by design,
since a prompt that depends on live database content can't be a static
markdown file alone.

Real today:
- `ai/intake/prompt.md` + `ai/intake/evaluation.md`
- `ai/translation/prompt.md` + `ai/translation/evaluation.md`

### Intake prompt, in detail (`api/ai-intake.js`)

The system prompt is built per-request from three real, live inputs —
not a static string:
1. The service catalog passed in the request body (`id`, `category`,
   `name`, `blurb` per service).
2. Per-service structured field schemas, sourced from
   `src/lib/serviceQuestions.js` — the same `SERVICE_QUESTIONS` object
   the client's `QuoteFormSheet` renders from (Constitution Rule 8, one
   source of truth: the AI doesn't get its own copy of these fields).
3. The customer's locale, so every free-text output field
   (`problem`, `description`, `possibleCauses`, follow-up questions) is
   written in the customer's own language.

Named constants govern behavior rather than magic numbers buried in
the prompt text: `CONFIDENCE_THRESHOLD = 85` (below this, the model is
instructed to ask at most 2 concrete, multiple-choice follow-up
questions instead of guessing) and `MAX_PHOTOS = 4` (a hard server-side
cap on how many images get sent per call, independent of whatever the
client tried to attach).

**Guardrail worth naming explicitly:** the endpoint never trusts a
`matchedServiceId` the model returns. It's checked against the real
`services` list the request was given; if the model hallucinated an id
that isn't in the catalog, the endpoint resets `matchedServiceId`,
`categoryId`, and `structuredFields` to null/empty rather than letting
a client create a `service_requests` row against a nonexistent service.

### Translation prompt, in detail (`api/translate-message.js`)

Fixed system prompt, target language resolved from a small
`LANGUAGE_NAMES` map (the same 8 locales as everywhere else in the
product). Explicitly instructed to keep tone "casual and natural, like
a real chat message — not a formal document," and to return the
original text unchanged if it's already in the target language (so
translation is idempotent rather than paraphrasing text that didn't
need changing).

## Evaluation framework

**Current state: benchmark cases exist, automated running does not.**
`ai/intake/evaluation.md` documents three real cases — a clear-cut
plumbing leak (expects a specific service match, medium/high urgency,
sub-85% confidence prompting follow-up questions), an ambiguous
synthetic photo (tests OCR/brand-detection honesty — the model should
report low confidence rather than confabulate), and a high-confidence
text-only case (expects zero follow-up questions). Two of the three
have already been run manually against the live production endpoint,
with their actual observed output recorded next to the expectation.

`ai/translation/evaluation.md` exists alongside it with the same
convention for the translation capability.

**What "wired into CI" will mean** (`ROADMAP.md` Phase 2): a prompt
change to any AI module should produce a visible pass/fail delta
against these benchmark cases — not a guess about whether a prompt
edit made things better or worse. Evaluation is checked the same way
unit tests are: on every change, not just when someone remembers to
manually re-verify.

**Adding a case:** format is input → expected structured fields, not
exact prose matches. Confidence scores and free-text fields vary run to
run by nature of the model; check the *shape* and *plausibility* of the
response, not byte-for-byte equality.

## Rate limiting and abuse controls

Not AI-specific, but load-bearing for AI cost control: every AI Gateway
caller sits behind `api/_lib/rateLimit.js` — 20 calls per 10-minute
window, per user, per endpoint, counted against `ai_usage_log` (a real
Postgres table, RLS-scoped so a user can only see/write their own rows —
no Redis or other external service needed at current scale). See
`../engineering/SECURITY.md` for the fuller threat-model treatment of
what this does and doesn't protect against.

## Planned capability expansion

Per `ROADMAP.md`:

- **Phase 1** *(shipped)* — `reason()`, `translate()`, structured
  output contract, prompt library, evaluation-case authoring.
- **Phase 2** — evaluation cases wired into CI; failing an eval blocks
  a merge the same way a failing unit test does.
- **Phase 9** — translate the request's own text (today only chat
  messages are translated, not the original job description); a
  fraud/spam confidence signal using the `reasoning` field pattern.
- **Phase 10** — a periodic batch-analysis capability, distinct from
  per-request `reason()` calls, summarizing marketplace-wide signals
  into plain language; an internal-assistant endpoint answering
  natural-language questions over the Analytics layer using the same
  reasoning capability already exposed.
- **Phase 13** — the deepest integration: every intake, photo, and
  completed job feeds a persistent Home Profile; on a new request, the
  Gateway pulls the relevant asset's history as context before even
  asking a follow-up question.

None of the above exist yet — don't assume a capability beyond
`reason()`/`translate()` is callable.

---

Version 1.0 — 2026-08-06 (Foundation Freeze, Phase 3)
