// Tests for UUIDv7 generation.
//
// The shape assertions are the cheap half. The half worth having is ordering, because the
// only reason SUPABASE_ARCHITECTURE.md §3 chose v7 over v4 is index locality — inserts
// staying at the right-hand edge of the B-tree instead of scattering across every page —
// and that benefit is entirely forfeited if the values reorder. A v7 that reorders within
// a millisecond is a v4 with extra steps for any burst of writes, and bursts are exactly
// when it matters.
//
// So four of these are about the awkward cases: a burst inside one millisecond, a burst
// large enough to exhaust the counter, a clock that has gone backwards, and interleaved
// async callers.
//
// Each test re-imports the module. The generator holds the last timestamp it issued, so a
// test pinning an earlier millisecond than its predecessor would otherwise be exercising
// the clock-went-backwards path by accident rather than on purpose.
import { describe, it, expect, beforeEach, vi } from "vitest";

const CANONICAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The leading 48 bits, which are the Unix millisecond the identifier was issued for.
function timestampOf(id: string): number {
  return parseInt(id.replace(/-/g, "").slice(0, 12), 16);
}

async function loadGenerator() {
  vi.resetModules();
  const { uuidv7 } = await import("../ids.js");
  return uuidv7;
}

beforeEach(() => {
  vi.resetModules();
});

describe("uuidv7", () => {
  it("produces a canonically formatted UUID", async () => {
    const uuidv7 = await loadGenerator();
    expect(uuidv7()).toMatch(CANONICAL);
  });

  it("sets the version and variant RFC 9562 requires", async () => {
    // Version 7 in the 13th hex digit, variant 10xx in the 17th. A value that is merely
    // time-ordered but claims to be v4 would be read as random by anything that inspects
    // it — including PostgreSQL tooling and the diagnostics in supabase/diagnostics.
    const uuidv7 = await loadGenerator();
    for (let i = 0; i < 100; i += 1) {
      const id = uuidv7().replace(/-/g, "");
      expect(id[12]).toBe("7");
      expect(["8", "9", "a", "b"]).toContain(id[16]);
    }
  });

  it("encodes the millisecond it was given", async () => {
    // The property ADR-0022 relies on when it mints backfilled identifiers from a row's
    // own creation time: the timestamp in the identifier is a fact, not decoration.
    const uuidv7 = await loadGenerator();
    const at = Date.UTC(2026, 7, 13, 12, 0, 0);
    expect(timestampOf(uuidv7(at))).toBe(at);
  });

  it("is strictly increasing within a single millisecond", async () => {
    // The guarantee that makes v7 worth choosing. Every identifier here shares a
    // timestamp, so ordering comes entirely from the counter in rand_a.
    const uuidv7 = await loadGenerator();
    const at = Date.UTC(2026, 7, 13, 12, 0, 0);
    const ids = Array.from({ length: 1000 }, () => uuidv7(at));

    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("borrows a millisecond rather than wrapping when the counter is exhausted", async () => {
    // The counter is 12 bits and is seeded in its lower half, so ~4096 identifiers inside
    // one millisecond guarantee at least one exhaustion. Wrapping would emit a value below
    // its predecessor — the one outcome the ordering guarantee cannot survive.
    const uuidv7 = await loadGenerator();
    const at = Date.UTC(2026, 7, 13, 12, 0, 0);
    const ids = Array.from({ length: 4096 }, () => uuidv7(at));

    expect(ids, "the counter wrapped and the sequence went backwards").toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);

    // Borrowed milliseconds are a rounding error, not a drift: 4096 identifiers cannot
    // push the timestamp more than a handful of milliseconds past where it started.
    const drift = timestampOf(ids[ids.length - 1]) - at;
    expect(drift).toBeGreaterThan(0);
    expect(drift).toBeLessThan(10);
  });

  it("never issues a value below one it has already issued when the clock goes backwards", async () => {
    // NTP corrections and suspended virtual machines both move a clock backwards. Trusting
    // it in that moment would issue an identifier below one already written to a table
    // whose whole design assumes they only ever climb.
    const uuidv7 = await loadGenerator();
    const at = Date.UTC(2026, 7, 13, 12, 0, 0);

    const before = uuidv7(at);
    const afterJumpBack = uuidv7(at - 60_000);

    expect(afterJumpBack > before, "an identifier went backwards with the clock").toBe(true);
    expect(timestampOf(afterJumpBack)).toBe(at);
  });

  it("keeps climbing across milliseconds", async () => {
    const uuidv7 = await loadGenerator();
    const start = Date.UTC(2026, 7, 13, 12, 0, 0);
    const ids = Array.from({ length: 50 }, (_, i) => uuidv7(start + i));

    expect(ids).toEqual([...ids].sort());
  });

  it("is unique under interleaved async callers", async () => {
    // JavaScript is single-threaded, so "concurrency" here is interleaving rather than
    // parallelism — which is precisely the shape of an engine handling many requests, and
    // the case where a generator holding state between calls could hand out a duplicate.
    const uuidv7 = await loadGenerator();
    const ids = await Promise.all(
      Array.from({ length: 5000 }, async () => {
        await Promise.resolve();
        return uuidv7();
      })
    );

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is unique across a large unpinned run", async () => {
    const uuidv7 = await loadGenerator();
    const ids = Array.from({ length: 20_000 }, () => uuidv7());

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
  });

  it("does not reveal how many identifiers a millisecond produced", async () => {
    // The counter is seeded randomly rather than from zero. Seeding at zero would be
    // simpler and would let anyone holding two identifiers from the same millisecond read
    // off how many were issued between them.
    const first = await loadGenerator();
    const secondModule = await loadGenerator();
    const at = Date.UTC(2026, 7, 13, 12, 0, 0);

    const a = first(at).replace(/-/g, "").slice(13, 16);
    const b = secondModule(at).replace(/-/g, "").slice(13, 16);

    // Two independently seeded generators agreeing on the first counter value would mean
    // the seed is constant. A single collision is possible by chance; this asserts the
    // seed is not fixed at zero, which is the failure that matters.
    expect(a === "000" && b === "000").toBe(false);
  });
});
