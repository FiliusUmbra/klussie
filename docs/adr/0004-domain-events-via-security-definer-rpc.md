# ADR-0004: Route Domain Events Through `emit_domain_event()` RPC

**Status:** Implemented
**Date:** 2026-08-04
**Related:** `supabase/migrations/0010_phase1_foundation.sql`,
`api/_lib/events.js`, `../architecture/ARCHITECTURE.md`

## Context

Klussie Core's planned event-driven pattern (layers publish what
happened; other layers subscribe) needed a real `domain_events` table
as its seed. Two ways existed to let application code write to it:
direct table inserts guarded by RLS policies, or a narrow
security-definer function that's the only write path.

Direct-insert RLS policies would need to allow *some* authenticated
writes (a client legitimately needs to trigger an event as a side
effect of its own action), which risks a client eventually being able
to write arbitrary event types or payloads if the policy is ever
loosened carelessly — the same risk `audit_log` is designed to avoid
entirely by having no client policies at all.

## Decision

`domain_events` has no direct client policies. The only way to write a
row is `emit_domain_event(p_event_type, p_payload)`, a
`security definer` SQL function that does exactly one thing — insert a
row — and nothing else. Application code (`api/_lib/events.js`) calls
this RPC, never the table directly.

## Consequences

- A caller can add narrowly-shaped events but can never write arbitrary
  rows to what is effectively a system log table.
- `emitEvent()` in `api/_lib/events.js` deliberately swallows its own
  errors after logging them — a failure to record an event should
  never break the caller's actual request. This is a considered
  trade-off: event delivery is best-effort, not transactional, with the
  underlying user-facing action as the one that must succeed.
- The same security-definer pattern is reused for future audit-log
  writes once phases that need them ship, keeping the "no direct client
  writes to system tables" posture consistent across the codebase.
