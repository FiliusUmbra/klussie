# ADR-0001: Adopt a Capability-Based AI Gateway

**Status:** Implemented
**Date:** 2026-08-04
**Related:** `api/_lib/aiGateway.js`, `../architecture/AI_ARCHITECTURE.md`

## Context

Klussie's product depends on AI for job-intake understanding (text,
voice, photo) and chat translation, with more AI capabilities
(speech-to-text, home-profile reasoning, marketplace intelligence)
planned across the roadmap. Two real options existed for how the
codebase talks to an AI provider:

1. A single "AI client" module wrapping the provider SDK directly,
   with each capability being whatever call shape that provider's SDK
   happens to expose.
2. A gateway organized around named **capabilities** (what the caller
   needs done) rather than around the provider (which model does it),
   so speech, vision, reasoning, and translation could each be
   independently swapped to a different provider without touching
   every call site.

## Decision

Build the AI Gateway (`api/_lib/aiGateway.js`) around capability
functions — `reason()` and `translate()` today — not a generic
provider client. Callers pass capability-shaped parameters (a system
prompt, text, images, an output schema); nothing outside this one file
knows Anthropic's tool-forcing or content-block shapes.

## Consequences

- A future provider swap for one capability (e.g. a dedicated
  translation provider like DeepL) means changing `translate()`'s
  function body, not every endpoint that calls it.
- New capabilities (`speech()`, a dedicated `vision()`) can be added
  independently as the roadmap needs them, without redesigning the
  Gateway's shape.
- Every AI call in the codebase is auditable from one file — no
  endpoint can quietly start calling a provider SDK directly.
