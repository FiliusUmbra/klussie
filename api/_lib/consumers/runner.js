// Cursor-based consumer scaffolding (SUPABASE_ARCHITECTURE.md §13).
//
// A consumer reads forward from its position, does something with each event, and records
// how far it got. Two properties make that survivable in production, and they are the two
// this module exists to provide:
//
//   · A consumer that stops mid-stream resumes from its cursor, with no gap.
//   · An event the consumer cannot process is quarantined with its position recorded, so
//     one bad event never halts a stream indefinitely.
//
// AT-LEAST-ONCE, AND WHY THAT IS THE HONEST GUARANTEE.
//
// The cursor is saved after the handler succeeds. A process that dies in between has
// handled an event it has not recorded, and will be handed it again on restart. Saving the
// cursor first would trade that for the opposite failure — an event skipped entirely,
// which no retry recovers.
//
// So re-delivery is designed in, and "no duplicated effect" is the handler's guarantee,
// not this module's: §13 requires every consumer to be idempotent, deduplicating on
// event_id (ADR-0019 calls it "the idempotency key every consumer deduplicates on"). This
// runner makes at-least-once true and cheap; it cannot make a non-idempotent handler safe,
// and pretending otherwise would hide the requirement rather than meet it.
//
// WHY THE STORE IS INJECTED.
//
// There is no application-code path into the `platform` schema. PostgREST does not expose
// it and must not — SUPABASE_ARCHITECTURE.md §12 makes the events table not
// client-readable, so exposing the schema to reach a cursor would expose the stream too.
// A real consumer therefore needs a direct database connection, which this repository does
// not yet have (raised in WP 01.06's findings, and see WP 01.07's).
//
// The storage exists as of migration 0024. The adapter that connects to it belongs to the
// epic that builds a real consumer and gives it a connection. Until then the runner takes
// its store as an argument, which is also what lets the resumption and quarantine
// behaviour be tested without one.

/**
 * The store contract a real adapter must satisfy, against migration 0024's tables:
 *
 *   loadCursor(consumerName, partitionIndex)
 *       → { lastOccurredAt, lastEventId } | null    (null = never read this partition)
 *
 *   readForward({ partitionIndex, after, limit })
 *       → events, ascending by (occurred_at, event_id), strictly after `after`.
 *         The comparison is the row form — (occurred_at, event_id) > (:at, :id) — which
 *         is what events_cursor_idx serves and what makes two events sharing a timestamp
 *         unambiguous (SUPABASE_ARCHITECTURE.md §12).
 *
 *   saveCursor(consumerName, partitionIndex, { lastOccurredAt, lastEventId })
 *
 *   quarantine({ consumerName, eventId, occurredAt, workspaceId, failureReason })
 *       → upsert on (consumer_name, event_id), incrementing attempts.
 */

// One event: hand it to the handler, and if that fails, set it aside rather than stopping.
//
// The catch is deliberately broad. §13's rule is that one bad event never halts a stream
// indefinitely, and a handler can fail for reasons this module cannot enumerate — a
// malformed payload, a downstream timeout, a bug. Distinguishing "retryable" from
// "poisoned" here would be guessing; the quarantine records the reason and an operator
// decides.
async function processEvent(event, { name, handle, store }) {
  try {
    await handle(event);
    return { quarantined: false };
  } catch (err) {
    await store.quarantine({
      consumerName: name,
      eventId: event.eventId,
      occurredAt: event.occurredAt,
      workspaceId: event.workspaceId,
      failureReason: err?.message ?? String(err),
    });
    return { quarantined: true };
  }
}

/**
 * Reads one batch forward from the consumer's cursor for one partition.
 *
 * Returns { processed, quarantined, cursor, exhausted } — `exhausted` meaning the
 * partition had nothing more to give, which is how a caller knows to stop or sleep.
 *
 * The cursor advances past a quarantined event as well as a handled one. That is the whole
 * point of quarantining: leaving the cursor behind a poisoned event is exactly the halted
 * stream §13 forbids.
 */
export async function runConsumerBatch({ name, partitionIndex, store, handle, batchSize = 100 }) {
  if (typeof handle !== "function") {
    throw new Error("a consumer needs a handle(event) function");
  }

  let cursor = await store.loadCursor(name, partitionIndex);
  const events = await store.readForward({ partitionIndex, after: cursor, limit: batchSize });

  let processed = 0;
  let quarantined = 0;

  for (const event of events) {
    const result = await processEvent(event, { name, handle, store });
    if (result.quarantined) quarantined += 1;
    else processed += 1;

    // Per event, not per batch. A batch-level save re-delivers the whole batch after a
    // crash; this re-delivers at most one event, and the handler is idempotent either way.
    cursor = { lastOccurredAt: event.occurredAt, lastEventId: event.eventId };
    await store.saveCursor(name, partitionIndex, cursor);
  }

  return { processed, quarantined, cursor, exhausted: events.length < batchSize };
}

/**
 * Drains one partition: batches until there is nothing left.
 *
 * `maxBatches` is a stop, not a tuning knob — an unbounded loop over a stream that is
 * still being written to never returns. A caller that wants to keep going calls again.
 */
export async function drainPartition({ maxBatches = 100, ...options }) {
  let processed = 0;
  let quarantined = 0;
  let cursor = null;

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const result = await runConsumerBatch(options);
    processed += result.processed;
    quarantined += result.quarantined;
    cursor = result.cursor;
    if (result.exhausted) return { processed, quarantined, cursor, drained: true };
  }

  return { processed, quarantined, cursor, drained: false };
}
