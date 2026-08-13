// What `loadProfile` hands to the rest of the application after the read switch.
//
// This file exists because a probe found nothing testing it. Removing `...profile` from
// the merge — so the object carries only the four identity attributes — broke no test,
// while silently dropping `id`, `onboarding_role_selected` and `home_tour_completed_at`
// from every consumer of `useAuth().profile`.
//
// The consequences of that would not have surfaced in a test run. They would have surfaced
// as the role-selection screen reappearing for every existing user on every load, and the
// first-login tour doing the same — the two surfaces whose entire job is to appear exactly
// once. WP 02.01 deliberately gave the identity row no column for either, because they are
// state about a session rather than attributes of a person.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const rpc = vi.fn();
const profileRow = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: "11111111-1111-4111-8111-000000000001" } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    rpc: (...args) => rpc(...args),
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            table === "profiles"
              ? profileRow()
              : Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

import { AuthProvider, useAuth } from "../auth.jsx";

// The row `public.profiles` still returns — it is still read, and still written.
const PROFILE = {
  id: "11111111-1111-4111-8111-000000000001",
  full_name: "Stale Name From Profiles",
  avatar_url: "https://example/stale.png",
  city: "Stale City",
  locale: "de",
  onboarding_role_selected: true,
  home_tour_completed_at: "2026-02-01T10:00:00Z",
  created_at: "2025-03-04T09:12:00Z",
};

const IDENTITY = {
  full_name: "Cathy Customer",
  avatar_url: "https://example/current.png",
  city: "Brussels",
  locale: "nl",
};

function renderAuth() {
  let auth;
  function Probe() {
    auth = useAuth();
    return null;
  }
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  return () => auth;
}

beforeEach(() => {
  vi.clearAllMocks();
  profileRow.mockResolvedValue({ data: PROFILE, error: null });
  rpc.mockResolvedValue({ data: [IDENTITY], error: null });
});

describe("the profile handed to consumers after the read switch", () => {
  it("takes the person's attributes from identity", async () => {
    // Deliberately different values on the two sides. If the profile row were still
    // authoritative this test would read "Stale Name From Profiles" — which is the check
    // that the read actually moved rather than merely gaining a second query.
    const auth = renderAuth();
    await waitFor(() => expect(auth()?.profile).toBeTruthy());

    expect(auth().profile.full_name).toBe("Cathy Customer");
    expect(auth().profile.avatar_url).toBe("https://example/current.png");
    expect(auth().profile.city).toBe("Brussels");
    expect(auth().profile.locale).toBe("nl");
  });

  it("keeps the application state that identity has no column for", async () => {
    // The gap a probe found. Dropping these does not fail a build, does not fail a test,
    // and makes the onboarding screen reappear for everyone who has already dismissed it.
    const auth = renderAuth();
    await waitFor(() => expect(auth()?.profile).toBeTruthy());

    expect(auth().profile.onboarding_role_selected).toBe(true);
    expect(auth().profile.home_tour_completed_at).toBe("2026-02-01T10:00:00Z");
    expect(auth().profile.id).toBe("11111111-1111-4111-8111-000000000001");
    expect(auth().profile.created_at).toBe("2025-03-04T09:12:00Z");
  });

  it("returns the same set of keys it returned before the switch", async () => {
    // The shape is the contract. A key gained is a consumer reading something new; a key
    // lost is a consumer reading undefined, which renders as an empty space rather than an
    // error.
    const auth = renderAuth();
    await waitFor(() => expect(auth()?.profile).toBeTruthy());

    expect(Object.keys(auth().profile).sort()).toEqual(Object.keys(PROFILE).sort());
  });

  it("falls back to the profile row when the identity read is unavailable", async () => {
    // Production, today: Epic 02's migrations are not applied there, so the RPC does not
    // exist. The user keeps their name instead of losing it.
    rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const auth = renderAuth();
    await waitFor(() => expect(auth()?.profile).toBeTruthy());

    expect(auth().profile.full_name).toBe("Stale Name From Profiles");
    expect(auth().profile.onboarding_role_selected).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("falls back when the signed-in person has no identity row", async () => {
    // The reconciliation exists to make this impossible, so reaching it means something is
    // wrong — which is why it warns rather than passing silently.
    rpc.mockResolvedValue({ data: [], error: null });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const auth = renderAuth();
    await waitFor(() => expect(auth()?.profile).toBeTruthy());

    expect(auth().profile.full_name).toBe("Stale Name From Profiles");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("leaves a signed-out session with no profile, as before", async () => {
    profileRow.mockResolvedValue({ data: null, error: null });

    const auth = renderAuth();
    await waitFor(() => expect(auth()?.loading).toBe(false));

    expect(auth().profile).toBeNull();
  });
});
