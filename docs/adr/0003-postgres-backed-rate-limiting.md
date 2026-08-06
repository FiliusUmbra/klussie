# ADR-0003: Postgres-Backed Rate Limiting Instead of Redis

**Status:** Implemented
**Date:** 2026-08-04
**Related:** `api/_lib/rateLimit.js`, `../engineering/SECURITY.md`

## Context

The AI endpoints (`api/ai-intake.js`, `api/translate-message.js`)
needed per-user rate limiting to prevent cost abuse once
authentication closed the "anyone can call this for free" gap. The
standard approach for rate limiting is an in-memory store like Redis
(or a managed equivalent), which Klussie's infrastructure didn't
otherwise need or already have provisioned.

## Decision

Count this user's recent rows in a real Postgres table (`ai_usage_log`)
within a rolling time window, rather than introducing a new piece of
infrastructure. RLS on that table already scopes each user to their own
rows, so the same per-request authenticated Supabase client
`verifyAuth()` returns can do the counting — no service-role key or
separate connection needed.

## Consequences

- No new infrastructure dependency (no Redis instance to provision,
  monitor, or pay for) at current scale.
- Every rate-limit check is an extra Postgres round-trip per request —
  acceptable at today's traffic, worth revisiting if AI-endpoint
  volume grows enough that this becomes a measurable latency or load
  concern.
- The rate-limit window (20 calls / 10 minutes, per user, per endpoint)
  is a named constant in `rateLimit.js`, not a magic number, and easy
  to tune without infrastructure changes.
