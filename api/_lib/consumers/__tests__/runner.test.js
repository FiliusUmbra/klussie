// Tests for the cursor-based consumer scaffolding.
//
// These are the epic's two hardest acceptance criteria, and both are about what happens
// when something goes wrong rather than when it goes right: a consumer stopped mid-stream
// resumes with no gap and no duplicated effect, and a poisoned event is quarantined rather
// than halting the stream (SUPABASE_ARCHITECTURE.md §13).
//
// The store double mirrors migration 0024's two tables, including the part that is easy to
// get wrong in a real adapter: readForward compares (occurred_at, event_id) as a row, not
// occurred_at alone. Two events can share a timestamp — emit_event() gives every event in
// one transaction the same one — and a cursor that compared only time would either skip
// the second or redeliver the first forever.
import { describe, it, expect } from "vitest";
import { runConsumerBatch, drainPartition } from "../runner.js";

function store(events = []) {
  const cursors = new Map();
  const quarantined = new Map();

  const key = (name, partition) => `${name}:${partition}`;
  const isAfter = (event, after) =>
    after === null ||
    event.occurredAt > after.lastOccurredAt ||
    (event.occurredAt === after.lastOccurredAt && event.eventId > after.lastEventId);

  return {
    cursors,
    quarantined,
    reads: [],
    async loadCursor(name, partitionIndex) {
      return cursors.get(key(name, partitionIndex)) ?? null;
    },
    async saveCursor(name, partitionIndex, position) {
      cursors.set(key(name, partitionIndex), position);
    },
    async readForward({ partitionIndex, after, limit }) {
      const page = events
        .filter((e) => e.partitionIndex === partitionIndex && isAfter(e, after))
        .sort((a, b) =>
          a.occurredAt === b.occurredAt
            ? a.eventId.localeCompare(b.eventId)
            : a.occurredAt.localeCompare(b.occurredAt)
        )
        .slice(0, limit);
      this.reads.push({ after, returned: page.map((e) => e.eventId) });
      return page;
    },
    async quarantine({ consumerName, eventId, failureReason }) {
      const k = `${consumerName}:${eventId}`;
      const existing = quarantined.get(k);
      // Upsert on (consumer_name, event_id), incrementing attempts — the primary key
      // migration 0024 chose, so that one event poisoning one consumer twice is one
      // problem with two attempts rather than two problems.
      quarantined.set(k, { eventId, failureReason, attempts: (existing?.attempts ?? 0) + 1 });
    },
  };
}

const event = (n, partitionIndex = 0, occurredAt = `2026-06-15T12:00:${String(n).padStart(2, "0")}Z`) => ({
  eventId: `0192${String(n).padStart(4, "0")}-0000-7000-8000-000000000001`,
  occurredAt,
  workspaceId: "01920000-0000-7000-8000-0000000000ff",
  partitionIndex,
  n,
});

describe("runConsumerBatch", () => {
  it("starts at the beginning when a partition has never been read", async () => {
    // A null cursor is "never read", which the store must not confuse with a position of
    // zero — migration 0024 keeps both parts of the position null together for this reason.
    const s = store([event(1), event(2)]);
    const seen = [];

    const result = await runConsumerBatch({
      name: "projection", partitionIndex: 0, store: s, handle: (e) => seen.push(e.n),
    });

    expect(seen).toEqual([1, 2]);
    expect(result.processed).toBe(2);
    expect(s.reads[0].after).toBeNull();
  });

  it("resumes from the cursor with no gap after stopping mid-stream", async () => {
    // The first acceptance criterion. The stop is simulated the way it actually happens:
    // the process is gone, and all that survives is what reached the store.
    const events = [event(1), event(2), event(3), event(4), event(5)];
    const s = store(events);
    const seen = [];

    // Batch of two, twice — the process "stops" after the second batch.
    await runConsumerBatch({ name: "projection", partitionIndex: 0, store: s, handle: (e) => seen.push(e.n), batchSize: 2 });
    await runConsumerBatch({ name: "projection", partitionIndex: 0, store: s, handle: (e) => seen.push(e.n), batchSize: 2 });
    expect(seen).toEqual([1, 2, 3, 4]);

    // Restart: a fresh run against the same store, as a new process would be.
    const afterRestart = [];
    await drainPartition({ name: "projection", partitionIndex: 0, store: s, handle: (e) => afterRestart.push(e.n), batchSize: 2 });

    expect(afterRestart, "the stream resumed somewhere other than where it stopped").toEqual([5]);
    expect([...seen, ...afterRestart]).toEqual([1, 2, 3, 4, 5]);
  });

  it("redelivers at most the one event a crash straddled", async () => {
    // At-least-once, made concrete. The cursor is saved after the handler succeeds, so a
    // process dying in between has handled an event it has not recorded. This test pins
    // the size of that window: one event, not one batch.
    const events = [event(1), event(2), event(3)];
    const s = store(events);
    const handled = [];

    // Handler succeeds on event 2, then the "process dies" before saveCursor can run.
    const crashingStore = {
      ...s,
      saveCursor: async (name, partition, position) => {
        if (position.lastEventId === events[1].eventId) throw new Error("process died");
        return s.saveCursor(name, partition, position);
      },
    };

    await expect(
      runConsumerBatch({ name: "projection", partitionIndex: 0, store: crashingStore, handle: (e) => handled.push(e.n) })
    ).rejects.toThrow("process died");
    expect(handled).toEqual([1, 2]);

    // Restart against the intact store: event 2 comes back, because its success was never
    // recorded. Event 1 does not.
    const afterRestart = [];
    await drainPartition({ name: "projection", partitionIndex: 0, store: s, handle: (e) => afterRestart.push(e.n) });
    expect(afterRestart).toEqual([2, 3]);
  });

  it("produces no duplicated effect when the handler is idempotent", async () => {
    // The other half of "no duplicated effect", and the half that is not this module's to
    // give: §13 requires every consumer to be idempotent, deduplicating on event_id. The
    // runner guarantees at-least-once; the handler turns that into exactly-once effect.
    const events = [event(1), event(2)];
    const s = store(events);
    const applied = new Set();
    const effects = [];

    const idempotentHandler = (e) => {
      if (applied.has(e.eventId)) return;   // ADR-0019: the idempotency key
      applied.add(e.eventId);
      effects.push(e.n);
    };

    await drainPartition({ name: "projection", partitionIndex: 0, store: s, handle: idempotentHandler });
    // Rewind the cursor, as a restart from an older position or a replay would.
    await s.saveCursor("projection", 0, null);
    s.cursors.delete("projection:0");
    await drainPartition({ name: "projection", partitionIndex: 0, store: s, handle: idempotentHandler });

    expect(effects, "a replayed event applied its effect twice").toEqual([1, 2]);
  });

  it("quarantines a poisoned event and keeps going", async () => {
    // The second acceptance criterion. The stream must not stop, and the bad event must
    // not vanish silently — §13 calls the quarantine "an operational alert rather than a
    // silent skip".
    const events = [event(1), event(2), event(3)];
    const s = store(events);
    const seen = [];

    const result = await drainPartition({
      name: "projection", partitionIndex: 0, store: s,
      handle: (e) => {
        if (e.n === 2) throw new Error("cannot parse payload");
        seen.push(e.n);
      },
    });

    expect(seen, "the poisoned event halted the stream").toEqual([1, 3]);
    expect(result.processed).toBe(2);
    expect(result.quarantined).toBe(1);

    const [quarantined] = [...s.quarantined.values()];
    expect(quarantined.eventId).toBe(events[1].eventId);
    expect(quarantined.failureReason).toBe("cannot parse payload");
  });

  it("advances the cursor past a quarantined event", async () => {
    // Leaving the cursor behind a poisoned event is precisely the halted stream §13
    // forbids: the consumer would re-read it forever and never reach anything after it.
    const events = [event(1), event(2)];
    const s = store(events);

    await drainPartition({
      name: "projection", partitionIndex: 0, store: s,
      handle: (e) => { if (e.n === 1) throw new Error("poison"); },
    });

    expect(s.cursors.get("projection:0").lastEventId).toBe(events[1].eventId);
  });

  it("counts attempts when the same event poisons the same consumer again", async () => {
    const events = [event(1)];
    const s = store(events);
    const poison = () => { throw new Error("poison"); };

    await drainPartition({ name: "projection", partitionIndex: 0, store: s, handle: poison });
    s.cursors.delete("projection:0");
    await drainPartition({ name: "projection", partitionIndex: 0, store: s, handle: poison });

    expect([...s.quarantined.values()][0].attempts).toBe(2);
  });

  it("keeps one cursor per partition", async () => {
    // §13: a consumer records its position per partition, so a slow tenant's partition
    // never blocks the other seven.
    const s = store([event(1, 0), event(2, 1), event(3, 1)]);
    const seen = [];

    await drainPartition({ name: "projection", partitionIndex: 1, store: s, handle: (e) => seen.push(e.n) });

    expect(seen).toEqual([2, 3]);
    expect(s.cursors.has("projection:0"), "reading one partition moved another's cursor").toBe(false);
  });

  it("keeps two consumers' positions independent", async () => {
    const s = store([event(1), event(2)]);
    await drainPartition({ name: "projection", partitionIndex: 0, store: s, handle: () => {} });

    const searchSaw = [];
    await drainPartition({ name: "search", partitionIndex: 0, store: s, handle: (e) => searchSaw.push(e.n) });

    expect(searchSaw, "one consumer's progress consumed another's stream").toEqual([1, 2]);
  });

  it("delivers events that share a timestamp exactly once each", async () => {
    // Every event emitted in one transaction gets the same occurred_at, because now() is
    // transaction start. A cursor comparing time alone would skip one of these or loop on
    // the other forever; the UUIDv7 event_id is the tiebreak (SUPABASE_ARCHITECTURE.md §12).
    const shared = "2026-06-15T12:00:00Z";
    const s = store([event(1, 0, shared), event(2, 0, shared), event(3, 0, shared)]);
    const seen = [];

    await drainPartition({ name: "projection", partitionIndex: 0, store: s, handle: (e) => seen.push(e.n), batchSize: 2 });

    expect(seen).toEqual([1, 2, 3]);
  });

  it("reports a partition as exhausted only when it is", async () => {
    const s = store([event(1), event(2), event(3)]);
    const full = await runConsumerBatch({ name: "projection", partitionIndex: 0, store: s, handle: () => {}, batchSize: 2 });
    expect(full.exhausted).toBe(false);

    const rest = await runConsumerBatch({ name: "projection", partitionIndex: 0, store: s, handle: () => {}, batchSize: 2 });
    expect(rest.exhausted).toBe(true);
  });

  it("refuses to run without a handler", async () => {
    await expect(
      runConsumerBatch({ name: "projection", partitionIndex: 0, store: store([]) })
    ).rejects.toThrow(/handle\(event\) function/);
  });
});

describe("drainPartition", () => {
  it("stops at maxBatches rather than looping over a stream still being written", async () => {
    const events = Array.from({ length: 10 }, (_, i) => event(i + 1));
    const s = store(events);

    const result = await drainPartition({
      name: "projection", partitionIndex: 0, store: s, handle: () => {}, batchSize: 1, maxBatches: 3,
    });

    expect(result.processed).toBe(3);
    expect(result.drained, "an unbounded drain would never return on a live stream").toBe(false);
  });
});
