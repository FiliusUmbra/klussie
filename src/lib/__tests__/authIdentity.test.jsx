// The client's half of the identity dual-write (Epic 02 WP04).
//
// The database half — that one signup produces exactly one identity, transactionally, and
// that a profile update cannot change the reference — is proven against the real trigger
// by supabase/diagnostics/VERIFY_IDENTITY_DUAL_WRITE.sql. It cannot be proven here: the
// profile is created by `on_auth_user_created` inside the auth transaction, and no test
// with a mocked Supabase client can exercise that.
//
// What *is* the client's responsibility, and is therefore what these tests hold:
//
//   · Every signup path carries a `person_ref`. A path that forgets one still gets an
//     identity — the trigger mints a fallback — but it gets one the application did not
//     generate, which quietly makes SUPABASE_ARCHITECTURE.md §3 untrue while every test
//     still passes. That is the failure worth catching here.
//   · The reference is a real UUIDv7, from src/lib/ids.ts, and from nowhere else.
//   · Signing in is not signing up, and must carry nothing.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const signUp = vi.fn();
const signInWithOtp = vi.fn();
const signInWithPassword = vi.fn();
const signInWithOAuth = vi.fn();

// Every table touched and every update payload, so a test can assert not just what was
// written but that nothing else was.
const writes = [];
const tablesTouched = [];

vi.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      signUp: (...args) => signUp(...args),
      signInWithOtp: (...args) => signInWithOtp(...args),
      signInWithPassword: (...args) => signInWithPassword(...args),
      signInWithOAuth: (...args) => signInWithOAuth(...args),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      // Inline rather than a shared const: vi.mock is hoisted above every top-level
      // binding in this file.
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: "01920000-0000-4000-8000-00000000f001" } } },
      }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: (table) => {
      tablesTouched.push(table);
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
        update: (fields) => {
          writes.push({ table, fields });
          return { eq: () => Promise.resolve({ error: null }) };
        },
        insert: (fields) => {
          writes.push({ table, fields });
          return Promise.resolve({ error: null });
        },
      };
    },
  },
}));

import { AuthProvider, useAuth } from "../auth.jsx";

const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Grabs the context out of a rendered provider, so each test drives the real functions
// rather than a reimplementation of them.
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
  writes.length = 0;
  tablesTouched.length = 0;
  signUp.mockResolvedValue({ data: { session: {} }, error: null });
  signInWithOtp.mockResolvedValue({ error: null });
  signInWithPassword.mockResolvedValue({ error: null });
  signInWithOAuth.mockResolvedValue({ error: null });
});

describe("signup carries an application-generated person reference", () => {
  it("password signup sends a person_ref in the signup metadata", async () => {
    const auth = renderAuth();
    await waitFor(() => expect(auth()).toBeTruthy());

    await auth().signUp("new@example.test", "hunter2", "New Person");

    const [options] = signUp.mock.calls[0];
    expect(options.options.data.person_ref).toMatch(V7);
    // The existing metadata is untouched — this package adds a field, it does not
    // reshape the call.
    expect(options.options.data.full_name).toBe("New Person");
    expect(options.email).toBe("new@example.test");
  });

  it("magic link sends one too, because a link to an unknown address creates a user", async () => {
    // The path most likely to be forgotten: it reads as sign-in and is the primary email
    // path per the Authentication UX Redesign, but for an address Supabase has never seen
    // it is a signup.
    const auth = renderAuth();
    await waitFor(() => expect(auth()).toBeTruthy());

    await auth().signInWithOtp("new@example.test");

    const [options] = signInWithOtp.mock.calls[0];
    expect(options.options.data.person_ref).toMatch(V7);
    // And the existing redirect still goes out, unchanged.
    expect(options.options.emailRedirectTo).toBeTruthy();
  });

  it("generates a different reference for every signup", async () => {
    // A constant would satisfy the shape assertions above and collide on the second real
    // signup, where the unique constraint on auth_user_id would not save it — two people
    // would be sharing a person reference.
    const auth = renderAuth();
    await waitFor(() => expect(auth()).toBeTruthy());

    await auth().signUp("a@example.test", "pw", "A");
    await auth().signUp("b@example.test", "pw", "B");
    await auth().signInWithOtp("c@example.test");

    const refs = [
      signUp.mock.calls[0][0].options.data.person_ref,
      signUp.mock.calls[1][0].options.data.person_ref,
      signInWithOtp.mock.calls[0][0].options.data.person_ref,
    ];
    expect(new Set(refs).size).toBe(3);
  });

  it("generates references that climb, as the identifier's whole purpose requires", async () => {
    // §3 chose v7 for index locality. Three references generated in order must sort in
    // that order, or the reason for the format is gone.
    const auth = renderAuth();
    await waitFor(() => expect(auth()).toBeTruthy());

    await auth().signUp("a@example.test", "pw", "A");
    await auth().signUp("b@example.test", "pw", "B");

    const first = signUp.mock.calls[0][0].options.data.person_ref;
    const second = signUp.mock.calls[1][0].options.data.person_ref;
    expect(second > first).toBe(true);
  });
});

describe("signing in is not signing up", () => {
  it("password sign-in sends no person_ref", async () => {
    // Sending one here would be harmless today and misleading forever: it would suggest
    // the reference is established at sign-in, which is where someone later looks for it.
    const auth = renderAuth();
    await waitFor(() => expect(auth()).toBeTruthy());

    await auth().signIn("existing@example.test", "hunter2");

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "existing@example.test",
      password: "hunter2",
    });
  });

  it("OAuth is unchanged, and is documented as carrying no reference", async () => {
    // Supabase gives no channel for signup metadata on an OAuth flow, so the trigger mints
    // for these — proven by check 2 of the diagnostic. No provider is configured today
    // (docs/operations/AUTH_PROVIDER_SETUP.md), so this asserts the call is untouched.
    const auth = renderAuth();
    await waitFor(() => expect(auth()).toBeTruthy());

    await auth().signInWithOAuth("google");

    const [options] = signInWithOAuth.mock.calls[0];
    expect(options.provider).toBe("google");
    expect(options.options.data).toBeUndefined();
  });
});

describe("profile changes write to the profile and nowhere else", () => {
  it("updateProfile issues exactly one write, and it is not to identity", async () => {
    // The identity is kept in step by a trigger on public.profiles (migration 0027), not
    // from here. A second write appearing in this function would be either
    // non-transactional with the first or aimed at a schema the client has no grants on —
    // both defects, and both look like progress while being written.
    const auth = renderAuth();
    await waitFor(() => expect(auth()?.session).toBeTruthy());

    await auth().updateProfile({ city: "Ghent" });

    expect(writes).toEqual([{ table: "profiles", fields: { city: "Ghent" } }]);
    expect(tablesTouched).not.toContain("identities");
  });

  it("markRoleSelected touches only the flag", async () => {
    // The update the trigger's WHEN clause deliberately ignores, because application state
    // about a session is not an attribute of a person.
    const auth = renderAuth();
    await waitFor(() => expect(auth()?.session).toBeTruthy());

    await auth().markRoleSelected();

    expect(writes).toEqual([{ table: "profiles", fields: { onboarding_role_selected: true } }]);
  });

  it("never sends a person_ref in a profile update", async () => {
    // §8: "Its identifier is permanent and never reused." The database makes this
    // structurally impossible — the mirror statement does not name the column — and this
    // asserts the client never tries.
    const auth = renderAuth();
    await waitFor(() => expect(auth()?.session).toBeTruthy());

    await auth().updateProfile({ full_name: "Renamed", city: "Ghent" });

    for (const write of writes) {
      expect(write.fields).not.toHaveProperty("person_ref");
    }
  });
});
