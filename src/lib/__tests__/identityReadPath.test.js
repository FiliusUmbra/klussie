// The read switch (Epic 02 WP06), from the client's side.
//
// Step 5 is the only step in the migration pattern that can regress, and the standard it
// is held to is not "the data is right" — it is that **a user cannot tell anything
// changed**. So these tests are written against the shape and values consumers actually
// receive, not against the queries that produced them.
//
// Two things are load-bearing and neither is obvious from reading the diff:
//
//   · `loadProfile` must still return `onboarding_role_selected` and
//     `home_tour_completed_at`. They are not on the identity row — WP 02.01 excluded them
//     deliberately — and a merge that dropped them would silently break the role-selection
//     screen and the first-login tour, which are exactly the surfaces nobody opens twice.
//   · `fetchPublicProInfo` must fall back to the embedded profile when the resolver is
//     unavailable. Code reading the identity engine against a database without Epic 02's
//     migrations is production today, and the alternative to falling back is rendering
//     every professional as the literal string "Pro".
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const proProfileRows = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: {
    rpc: (...args) => rpc(...args),
    from: (table) => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        in: () => proProfileRows(table),
      }),
    }),
  },
}));

import { fetchPublicProInfo } from "../pros";

const PRO_ID = "11111111-1111-4111-8111-000000000002";

const proProfileRow = {
  profile_id: PRO_ID,
  pro_type: "flexi",
  bio: "Painting and small repairs.",
  // Still selected, and used only when the resolver cannot answer.
  profiles: { full_name: "Pierre Pro", avatar_url: "https://example/p.png" },
  pro_stats: { rating_avg: "4.5", rating_count: 12, badge_tier: "gold", is_certified: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  proProfileRows.mockResolvedValue({ data: [proProfileRow], error: null });
});

describe("fetchPublicProInfo resolves display information", () => {
  it("takes the name and avatar from the identity resolver", async () => {
    rpc.mockResolvedValue({
      data: [{ auth_user_id: PRO_ID, full_name: "Pierre Pro", avatar_url: "https://example/p.png" }],
      error: null,
    });

    const info = await fetchPublicProInfo([PRO_ID]);

    expect(rpc).toHaveBeenCalledWith("resolve_identity_display", { p_auth_user_ids: [PRO_ID] });
    expect(info[PRO_ID].name).toBe("Pierre Pro");
    expect(info[PRO_ID].avatarUrl).toBe("https://example/p.png");
  });

  it("returns exactly the shape it returned before the switch", async () => {
    // The whole contract. Two components consume this object and neither was touched by
    // WP 02.06; a key renamed or dropped here is a blank space on a quote card.
    rpc.mockResolvedValue({
      data: [{ auth_user_id: PRO_ID, full_name: "Pierre Pro", avatar_url: "https://example/p.png" }],
      error: null,
    });

    const info = await fetchPublicProInfo([PRO_ID]);

    expect(info[PRO_ID]).toEqual({
      id: PRO_ID,
      name: "Pierre Pro",
      initials: "PP",
      avatarUrl: "https://example/p.png",
      proType: "flexi",
      bio: "Painting and small repairs.",
      rating: 4.5,
      reviews: 12,
      badgeTier: "gold",
      isCertified: true,
    });
  });

  it("prefers identity when the two sources disagree", async () => {
    // Proves the read actually moved. If the profile row were still authoritative this
    // would return the old name and every other test here would still pass.
    rpc.mockResolvedValue({
      data: [{ auth_user_id: PRO_ID, full_name: "Renamed In Identity", avatar_url: null }],
      error: null,
    });

    const info = await fetchPublicProInfo([PRO_ID]);

    expect(info[PRO_ID].name).toBe("Renamed In Identity");
    expect(info[PRO_ID].avatarUrl).toBeNull();
  });

  it("falls back to the profile when the resolver is unavailable", async () => {
    // A database without Epic 02's migrations — production, today. The RPC does not exist,
    // supabase-js returns an error, and the professional keeps their name.
    rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const info = await fetchPublicProInfo([PRO_ID]);

    expect(info[PRO_ID].name).toBe("Pierre Pro");
    expect(info[PRO_ID].avatarUrl).toBe("https://example/p.png");
    // Invisible to the user, and not to an engineer looking at the console.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("renders an erased person the way a nameless one already rendered", async () => {
    // An erased identity resolves to nothing (§11.4). The resolver answered, so there is
    // no fallback — and "Pro" is exactly what a professional with no name has always
    // shown, so nothing about the surface changes.
    rpc.mockResolvedValue({ data: [], error: null });

    const info = await fetchPublicProInfo([PRO_ID]);

    expect(info[PRO_ID].name).toBe("Pro");
    expect(info[PRO_ID].avatarUrl).toBeNull();
  });

  it("never asks for a contact channel", async () => {
    // The resolver's return type has no column for one, so this cannot leak — but the
    // request is worth pinning too, because a future widening would start here.
    rpc.mockResolvedValue({ data: [], error: null });

    await fetchPublicProInfo([PRO_ID]);

    const [, args] = rpc.mock.calls[0];
    expect(JSON.stringify(args)).not.toMatch(/email|phone/i);
  });

  it("makes no call at all for an empty list", async () => {
    const info = await fetchPublicProInfo([]);
    expect(info).toEqual({});
    expect(rpc).not.toHaveBeenCalled();
  });
});
