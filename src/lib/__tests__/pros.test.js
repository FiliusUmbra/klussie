// Epic 03 WP12. Covers the business logic this epic added to src/lib/pros.js: the
// professional the conversation canvas recommends (WP8) and the platform signals the
// trust strip is allowed to show (WP7 / ADR-0011). Both are rules rather than plumbing
// — which pro is *right*, and which number may be *claimed* — so they belong here and
// not in a component test, per "no business logic in UI."
//
// Follows Epic 01's precedent: src/lib/supabaseClient.js is mocked entirely, so these
// run with no network and no env vars.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabaseClient", () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from "../supabaseClient";
import {
  trustScore,
  findBestProForService,
  fetchPlatformTrustStats,
  fetchProServices,
  initialsFrom,
  MIN_REVIEWS_FOR_PLATFORM_RATING,
} from "../pros";

// Stands in for supabase-js's chainable, thenable builder, supporting the two chains
// pros.js actually uses: .select().eq() awaited, and .select() awaited directly.
function createQueryBuilder(result) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return builder;
}

// One row in the shape the real nested join returns, so the mapping in
// findBestProForService is exercised against the structure it actually receives.
function proServiceRow({
  id = "pro-1",
  fullName = "Peter Painter",
  city = "Brussels",
  paused = false,
  rating = 4,
  ratingCount = 10,
  badgeTier = null,
  isCertified = false,
  avatarUrl = null,
} = {}) {
  return {
    pro_id: id,
    pro_profiles: {
      profile_id: id,
      pro_type: "solo",
      paused,
      profiles: { full_name: fullName, avatar_url: avatarUrl, city },
      pro_stats: { rating_avg: rating, rating_count: ratingCount, badge_tier: badgeTier, is_certified: isCertified },
    },
  };
}

beforeEach(() => {
  vi.mocked(supabase.from).mockReset();
});

describe("trustScore", () => {
  it("weights rating, certification, and badge tier into a single 0-100 figure", () => {
    expect(trustScore({ rating: 4, isCertified: false, badgeTier: null })).toBe(80);
    expect(trustScore({ rating: 4, isCertified: true, badgeTier: null })).toBe(88);
    expect(trustScore({ rating: 4, isCertified: false, badgeTier: "top" })).toBe(86);
    expect(trustScore({ rating: 4, isCertified: false, badgeTier: "elite" })).toBe(92);
  });

  it("clamps to 100 rather than letting bonuses push a perfect rating past the scale", () => {
    // 5 * 20 already reaches 100; certification and an elite badge would make it 120.
    expect(trustScore({ rating: 5, isCertified: true, badgeTier: "elite" })).toBe(100);
  });

  it("treats an unrated pro as 0 rather than NaN", () => {
    expect(trustScore({})).toBe(0);
    expect(trustScore({ rating: 0, isCertified: false })).toBe(0);
  });

  it("ignores a badge tier it doesn't recognize instead of scoring it as a bonus", () => {
    expect(trustScore({ rating: 3, badgeTier: "platinum" })).toBe(60);
  });
});

describe("initialsFrom", () => {
  it("takes the first letter of at most the first two names", () => {
    expect(initialsFrom("Peter Painter")).toBe("PP");
    expect(initialsFrom("Anne Marie Van Damme")).toBe("AM");
    expect(initialsFrom("Cathy")).toBe("C");
  });

  it("falls back to a placeholder rather than throwing on a missing name", () => {
    expect(initialsFrom(null)).toBe("?");
    expect(initialsFrom("")).toBe("?");
  });
});

describe("findBestProForService", () => {
  it("returns the single highest-trust match, not a list to compare", async () => {
    supabase.from.mockReturnValue(
      createQueryBuilder({
        data: [
          proServiceRow({ id: "low", rating: 3 }),
          proServiceRow({ id: "high", rating: 5 }),
          proServiceRow({ id: "mid", rating: 4 }),
        ],
        error: null,
      })
    );

    const pro = await findBestProForService({ serviceId: "svc-1", city: "Brussels" });
    // EXPERIENCE_VISION.md §3: one professional, no comparing required.
    expect(pro).not.toBeNull();
    expect(Array.isArray(pro)).toBe(false);
    expect(pro.id).toBe("high");
  });

  it("ranks by trust score rather than by rating alone", async () => {
    supabase.from.mockReturnValue(
      createQueryBuilder({
        data: [
          // Higher raw rating, no other signals: 4.2 * 20 = 84.
          proServiceRow({ id: "unbadged", rating: 4.2 }),
          // Lower rating but certified and elite: 4 * 20 + 8 + 12 = 100.
          proServiceRow({ id: "certified-elite", rating: 4, isCertified: true, badgeTier: "elite" }),
        ],
        error: null,
      })
    );

    const pro = await findBestProForService({ serviceId: "svc-1", city: "Brussels" });
    expect(pro.id).toBe("certified-elite");
  });

  it("never recommends a paused professional", async () => {
    supabase.from.mockReturnValue(
      createQueryBuilder({
        data: [
          proServiceRow({ id: "paused-star", rating: 5, paused: true }),
          proServiceRow({ id: "available", rating: 3 }),
        ],
        error: null,
      })
    );

    // Pausing is how a pro says they aren't taking work; outranking on trust must not
    // override that.
    const pro = await findBestProForService({ serviceId: "svc-1", city: "Brussels" });
    expect(pro.id).toBe("available");
  });

  it("excludes uncertified pros when the service demands certification", async () => {
    supabase.from.mockReturnValue(
      createQueryBuilder({
        data: [
          proServiceRow({ id: "uncertified", rating: 5, isCertified: false }),
          proServiceRow({ id: "certified", rating: 2, isCertified: true }),
        ],
        error: null,
      })
    );

    const pro = await findBestProForService({ serviceId: "svc-1", city: "Brussels", certifiedOnly: true });
    expect(pro.id).toBe("certified");
  });

  it("returns null when certification rules every candidate out", async () => {
    supabase.from.mockReturnValue(
      createQueryBuilder({ data: [proServiceRow({ rating: 5, isCertified: false })], error: null })
    );

    // A real outcome — nobody qualified — not an error and not a downgraded match.
    await expect(findBestProForService({ serviceId: "svc-1", certifiedOnly: true })).resolves.toBeNull();
  });

  it("matches city case-insensitively and excludes other cities", async () => {
    supabase.from.mockReturnValue(
      createQueryBuilder({
        data: [
          proServiceRow({ id: "antwerp", rating: 5, city: "Antwerp" }),
          proServiceRow({ id: "brussels", rating: 3, city: "BRUSSELS" }),
        ],
        error: null,
      })
    );

    const pro = await findBestProForService({ serviceId: "svc-1", city: "brussels" });
    expect(pro.id).toBe("brussels");
  });

  it("keeps a pro whose city is unknown rather than excluding them on missing data", async () => {
    supabase.from.mockReturnValue(
      createQueryBuilder({ data: [proServiceRow({ id: "no-city", city: null })], error: null })
    );

    // An unset city is absent information, not a mismatch — excluding on it would hide
    // available pros for a reason the customer can't see.
    const pro = await findBestProForService({ serviceId: "svc-1", city: "Brussels" });
    expect(pro.id).toBe("no-city");
  });

  it("considers every city when the customer's own city is unknown", async () => {
    supabase.from.mockReturnValue(
      createQueryBuilder({
        data: [
          proServiceRow({ id: "antwerp", rating: 5, city: "Antwerp" }),
          proServiceRow({ id: "ghent", rating: 3, city: "Ghent" }),
        ],
        error: null,
      })
    );

    const pro = await findBestProForService({ serviceId: "svc-1", city: null });
    expect(pro.id).toBe("antwerp");
  });

  it("returns null when no pro offers the service at all", async () => {
    supabase.from.mockReturnValue(createQueryBuilder({ data: [], error: null }));
    await expect(findBestProForService({ serviceId: "svc-nobody" })).resolves.toBeNull();
  });

  it("shapes the row into the camelCase the card renders, with safe fallbacks", async () => {
    supabase.from.mockReturnValue(
      createQueryBuilder({
        data: [
          proServiceRow({
            id: "pro-9",
            fullName: "Peter Painter",
            rating: 4.5,
            ratingCount: 12,
            badgeTier: "top",
            isCertified: true,
            avatarUrl: "https://example.test/a.jpg",
          }),
        ],
        error: null,
      })
    );

    const pro = await findBestProForService({ serviceId: "svc-1" });
    expect(pro).toMatchObject({
      id: "pro-9",
      name: "Peter Painter",
      initials: "PP",
      avatarUrl: "https://example.test/a.jpg",
      city: "Brussels",
      rating: 4.5,
      reviews: 12,
      badgeTier: "top",
      isCertified: true,
      paused: false,
    });
  });

  it("names an unnamed pro rather than rendering a blank card", async () => {
    supabase.from.mockReturnValue(
      createQueryBuilder({ data: [proServiceRow({ fullName: null })], error: null })
    );

    const pro = await findBestProForService({ serviceId: "svc-1" });
    expect(pro.name).toBe("Pro");
    expect(pro.initials).toBe("?");
  });

  it("skips a pro_services row whose profile join came back empty", async () => {
    supabase.from.mockReturnValue(
      createQueryBuilder({
        data: [{ pro_id: "orphan", pro_profiles: null }, proServiceRow({ id: "real" })],
        error: null,
      })
    );

    // A dangling row must not become a card with no name, rating, or identity.
    const pro = await findBestProForService({ serviceId: "svc-1" });
    expect(pro.id).toBe("real");
  });

  it("throws on a query error instead of silently reporting no pro available", async () => {
    supabase.from.mockReturnValue(createQueryBuilder({ data: null, error: { message: "boom" } }));
    // The canvas treats null as "nobody offers this yet" — a failed query must not be
    // dressed up as that answer.
    await expect(findBestProForService({ serviceId: "svc-1" })).rejects.toMatchObject({ message: "boom" });
  });

  it("queries pro_services filtered by the requested service", async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    supabase.from.mockReturnValue(builder);

    await findBestProForService({ serviceId: "svc-42" });
    expect(supabase.from).toHaveBeenCalledWith("pro_services");
    expect(builder.eq).toHaveBeenCalledWith("service_id", "svc-42");
  });
});

// Epic 03 WP11 — the read switch. This is the pro's own dashboard list, never a read of
// someone else's — the reason it can switch cleanly where fetchPortfolioItems and
// fetchTestimonials (shared with public profile viewing) deliberately do not.
describe("fetchProServices", () => {
  it("filters by pro_id when no workspace has been resolved", async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    supabase.from.mockReturnValue(builder);

    await fetchProServices("pro-1");

    expect(supabase.from).toHaveBeenCalledWith("pro_services");
    expect(builder.eq).toHaveBeenCalledWith("pro_id", "pro-1");
    expect(builder.eq).not.toHaveBeenCalledWith("workspace_id", expect.anything());
  });

  it("filters by workspace_id once a workspace is resolved, not pro_id", async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    supabase.from.mockReturnValue(builder);

    await fetchProServices("pro-1", "ws-1");

    expect(builder.eq).toHaveBeenCalledWith("workspace_id", "ws-1");
    expect(builder.eq).not.toHaveBeenCalledWith("pro_id", expect.anything());
  });

  it("returns the same service ids identically whichever filter ran", async () => {
    supabase.from.mockReturnValue(createQueryBuilder({ data: [{ service_id: "svc-1" }, { service_id: "svc-2" }], error: null }));
    const withoutWorkspace = await fetchProServices("pro-1");

    supabase.from.mockReturnValue(createQueryBuilder({ data: [{ service_id: "svc-1" }, { service_id: "svc-2" }], error: null }));
    const withWorkspace = await fetchProServices("pro-1", "ws-1");

    expect(withoutWorkspace).toEqual(["svc-1", "svc-2"]);
    expect(withWorkspace).toEqual(withoutWorkspace);
  });

  it("throws the real Supabase error instead of swallowing it", async () => {
    supabase.from.mockReturnValue(createQueryBuilder({ data: null, error: { message: "denied" } }));
    await expect(fetchProServices("pro-1")).rejects.toMatchObject({ message: "denied" });
  });
});

describe("fetchPlatformTrustStats", () => {
  it("withholds the average rating below the minimum review count (ADR-0011)", async () => {
    supabase.from.mockReturnValue(
      createQueryBuilder({
        data: [{ rating_avg: 5, rating_count: 3, is_certified: true }],
        error: null,
      })
    );

    const stats = await fetchPlatformTrustStats();
    // A 5.0 from three reviews is true and still misleading. Null means the strip drops
    // the item entirely rather than showing a number it can't stand behind.
    expect(stats.ratingAvg).toBeNull();
    expect(stats.reviewCount).toBe(3);
    expect(stats.verifiedProCount).toBe(1);
  });

  it("publishes the average once the threshold is exactly met", async () => {
    supabase.from.mockReturnValue(
      createQueryBuilder({
        data: [{ rating_avg: 4.5, rating_count: MIN_REVIEWS_FOR_PLATFORM_RATING, is_certified: false }],
        error: null,
      })
    );

    const stats = await fetchPlatformTrustStats();
    expect(stats.ratingAvg).toBeCloseTo(4.5);
  });

  it("weights the average by review count rather than averaging the averages", async () => {
    supabase.from.mockReturnValue(
      createQueryBuilder({
        data: [
          { rating_avg: 5, rating_count: 30, is_certified: true },
          { rating_avg: 3, rating_count: 10, is_certified: true },
        ],
        error: null,
      })
    );

    const stats = await fetchPlatformTrustStats();
    // (5*30 + 3*10) / 40 = 4.5. A naive mean of the two averages would give 4.0 and
    // would let one pro with a single review move the platform-wide figure.
    expect(stats.ratingAvg).toBeCloseTo(4.5);
    expect(stats.reviewCount).toBe(40);
  });

  it("counts only certified pros as verified", async () => {
    supabase.from.mockReturnValue(
      createQueryBuilder({
        data: [
          { rating_avg: 4, rating_count: 10, is_certified: true },
          { rating_avg: 4, rating_count: 10, is_certified: false },
          { rating_avg: 4, rating_count: 10, is_certified: true },
        ],
        error: null,
      })
    );

    const stats = await fetchPlatformTrustStats();
    expect(stats.verifiedProCount).toBe(2);
  });

  it("returns zeroes and no rating on an empty platform instead of NaN", async () => {
    supabase.from.mockReturnValue(createQueryBuilder({ data: [], error: null }));

    const stats = await fetchPlatformTrustStats();
    // 0/0 would be NaN, which renders as "NaN★" — worse than showing nothing.
    expect(stats).toEqual({ verifiedProCount: 0, reviewCount: 0, ratingAvg: null });
  });

  it("tolerates a pro row with no reviews yet", async () => {
    supabase.from.mockReturnValue(
      createQueryBuilder({
        data: [
          { rating_avg: null, rating_count: null, is_certified: true },
          { rating_avg: 4, rating_count: 25, is_certified: false },
        ],
        error: null,
      })
    );

    const stats = await fetchPlatformTrustStats();
    expect(stats.reviewCount).toBe(25);
    expect(stats.ratingAvg).toBeCloseTo(4);
  });

  it("throws on a query error rather than reporting an empty platform", async () => {
    supabase.from.mockReturnValue(createQueryBuilder({ data: null, error: { message: "denied" } }));
    await expect(fetchPlatformTrustStats()).rejects.toMatchObject({ message: "denied" });
  });
});
