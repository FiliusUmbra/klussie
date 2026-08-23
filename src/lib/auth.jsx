/* eslint-disable react-refresh/only-export-components -- context file intentionally exports the provider plus its hook */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { uuidv7 } from "./ids.js";
import { loadWorkspaceMemberships, resolveActiveWorkspace } from "./workspaceContext.js";
import { getPreferredWorkspaceId, setPreferredWorkspaceId } from "./workspacePreference.js";

const AuthContext = createContext(null);

// Platform Activation Slice 1, WP 1.0 — every id `handle_new_user()` needs to create a
// Personal Workspace, its founding membership, and a property for a brand-new signup, all
// inside the same auth transaction. Extends the exact discipline `person_ref` already
// established (SUPABASE_ARCHITECTURE.md §3: "an engine must know an aggregate's identity
// before it writes, so it can emit an event referencing it in the same transaction") to
// the three further aggregates and the three events the new signup path creates —
// `0135_personal_workspace_provisioning.sql`'s own header explains why the trigger's
// `platform.uuid_v7_at(now())` fallback (the same one `person_ref` already has) is a
// defensive backstop for a malformed client, never the primary path this function exists
// to be.
//
// FOUND WHILE SCOPING SLICE 1, NOT A KNOWN GAP BEFORE THIS
//
// No account created after Epic 03's own workspace backfill migration ran has ever
// received a workspace at all — `handle_new_user()` only ever created a profile and an
// identity. Every workspace-scoped engine built since (capabilities, properties, assets,
// marketplace, everything) has been unreachable for any post-backfill signup, silently,
// because AppShell.jsx's own fallback to the pre-Epic-03 `role` toggle for a
// zero-membership person is graceful by design and never surfaced the gap as a bug.
function newAccountProvisioningIds() {
  return {
    person_ref: uuidv7(),
    workspace_id: uuidv7(),
    membership_id: uuidv7(),
    property_id: uuidv7(),
    workspace_event_id: uuidv7(),
    membership_event_id: uuidv7(),
    property_event_id: uuidv7(),
  };
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

// The person's own attributes now come from the identity engine (Epic 02 WP06, step 5 of
// the migration pattern). `public.profiles` is still read, and still written, for the
// thing that is not an attribute of a person: `home_tour_completed_at` is state about a
// session, and WP 02.01 deliberately gave the identity row no column for it.
// (`onboarding_role_selected` is the same kind of session state, but nothing writes it
// any more — the pre-launch audit's §2.5 finding (PLATFORM_DOMAIN_MODEL.md §27: "never
// asks a person to classify themselves") removed the classification gate that used to
// set it; see AppShell.jsx. The column itself is left alone, unread and permanently
// false on new signups, rather than dropped by a migration only this removal motivated.)
//
// The merged object is the shape every consumer already receives. Nothing downstream
// changes, which is the point: ADR-0023's success condition is that a user cannot tell.
//
// `current_identity()` is an RPC rather than a table read because `identity` is not on
// PostgREST's exposed schemas and must not be — see migration 0028. It returns the
// caller's own row and nobody else's.
async function loadProfile(userId) {
  const [
    { data: profile, error: profileErr },
    { data: identityRows, error: identityErr },
    { data: proProfile, error: proErr },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.rpc("current_identity"),
    supabase.from("pro_profiles").select("*").eq("profile_id", userId).maybeSingle(),
  ]);
  if (profileErr) throw profileErr;
  if (proErr) throw proErr;

  return { profile: mergeIdentityIntoProfile(profile, identityRows, identityErr), proProfile };
}

// Identity is authoritative for the four attributes it owns; the profile row supplies the
// rest of the shape.
//
// The fallback is deliberate and is not a hedge against drift. It covers one specific
// case: code running against a database where Epic 02's migrations have not been applied,
// where the RPC does not exist and every profile read would otherwise return a person with
// no name. Production is exactly that database today. Drift between the two sources is a
// different problem, and the one RECONCILE_IDENTITY.sql exists to make impossible — so
// when this path is taken it says so rather than quietly papering over it.
function mergeIdentityIntoProfile(profile, identityRows, identityErr) {
  if (!profile) return profile;

  const identity = Array.isArray(identityRows) ? identityRows[0] : identityRows;
  if (identityErr || !identity) {
    console.warn(
      "identity read unavailable, falling back to profiles:",
      identityErr?.message ?? "no identity row for the signed-in user"
    );
    return profile;
  }

  return {
    ...profile,
    full_name: identity.full_name,
    avatar_url: identity.avatar_url,
    city: identity.city,
    locale: identity.locale,
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [proProfile, setProProfile] = useState(null);
  const [workspaceMemberships, setWorkspaceMemberships] = useState([]);
  // Epic 03 WP12 — the switcher's own choice, loaded per-person from localStorage
  // (workspacePreference.js) once their id is known, so a returning visitor lands back
  // where they left off (PLATFORM_DOMAIN_MODEL.md §27: "switching ... preserves place").
  const [preferredWorkspaceId, setPreferredWorkspaceIdState] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      setProProfile(null);
      setWorkspaceMemberships([]);
      setPreferredWorkspaceIdState(null);
      return;
    }
    const { profile, proProfile } = await loadProfile(userId);
    setProfile(profile);
    setProProfile(proProfile);
    // Epic 03 WP09 — resolved alongside the profile, not gating it: a person with no
    // workspace yet (or an environment where the resolver isn't reachable) still signs in
    // and sees their profile exactly as before.
    setWorkspaceMemberships(await loadWorkspaceMemberships());
    setPreferredWorkspaceIdState(getPreferredWorkspaceId(userId));
  }, []);

  // Epic 03 WP12 — the switcher calls this. Persists past this session (localStorage) and
  // updates immediately (React state), matching §27's "switching is cheap": no round trip
  // to the database is needed to change which workspace is active, only to act within it.
  const setActiveWorkspaceId = useCallback((workspaceId) => {
    setPreferredWorkspaceIdState(workspaceId);
    if (session?.user?.id) setPreferredWorkspaceId(session.user.id, workspaceId);
  }, [session]);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) await refreshProfile(data.session.user.id);
      if (active) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      await refreshProfile(nextSession?.user?.id ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [refreshProfile]);

  // `person_ref` is the platform's permanent reference for this person
  // (SUPABASE_ARCHITECTURE.md §11.4), generated here because §3 puts identifier generation
  // in the application. It travels in the signup metadata and is read by
  // `public.handle_new_user()`, which writes the identity row in the same transaction as
  // the auth user and the profile — the only placement where a failure cannot leave the
  // three disagreeing. See migration 0027.
  //
  // Metadata is the only channel available: the client has no write access to the
  // `identity` schema and must not have any.
  const signUp = async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName || null, ...newAccountProvisioningIds() } },
    });
    if (error) throw error;
    return { needsEmailConfirmation: !data.session };
  };

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  // Magic link — the primary email path per the Authentication UX Redesign
  // (minimize password usage). Password sign-in above stays available as a
  // fallback, both for users who prefer it and for the existing
  // password-only test accounts.
  //
  // Carries a `person_ref` for the same reason as signUp: a magic link to an unknown
  // address creates the user, so this is a signup path too. Supabase applies `data` only
  // when it creates a user, so an existing user signing in is unaffected — their identity
  // already exists and keeps the reference it was given.
  const signInWithOtp = async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, data: newAccountProvisioningIds() },
    });
    if (error) throw error;
  };

  // provider: 'google' | 'apple' | 'azure' (Microsoft's Supabase provider
  // id) | 'facebook'. Requires that provider to be configured in the
  // Supabase dashboard — see docs/design/UX_PATTERNS.md's Authentication
  // section and the Authentication UX Redesign plan for the real, external
  // per-provider setup this depends on.
  const signInWithOAuth = async (provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  // 0168_professional_workspace_provisioning.sql — a real, atomic write, not the raw
  // pro_profiles insert this used to be. Found while fixing "become a pro"
  // discoverability (UNIFIED_PRODUCT_IA_REVIEW.md §5): that raw insert never created a
  // Professional Workspace at all, so a new pro landed on ProApp with no real
  // performing_workspace_id to act through. Same identifier discipline
  // newAccountProvisioningIds() already established for signup itself — the client
  // mints every id this transaction needs (ADR-0022), api.become_pro() does the rest
  // atomically. refreshProfile() below already reloads workspaceMemberships (see its
  // own body).
  //
  // RETURNS workspaceId — A REAL, ONE-TURN CONSEQUENCE OF FIXING THE DATA BUG ITSELF
  //
  // Once a real second membership exists, deriveEffectiveRole() (workspaceContext.js)
  // stops consulting the `role` toggle at all and switches to reading activeWorkspace
  // directly — and resolveActiveWorkspace() defaults a fresh multi-workspace person to
  // their PERSONAL workspace (§27's own "becomes a pro without losing their customer
  // view" design). Without this, AppShell's own `setRole("pro")` after BecomeProSheet
  // closes would silently stop doing anything the instant this fix takes effect, and a
  // person who just became a pro would land back on their customer view instead of
  // ProApp. The caller uses this id to set the switcher's own preference explicitly
  // (setActiveWorkspaceId) — the same mechanism the switcher itself already uses,
  // applied once, automatically, at the one moment it would otherwise go stale.
  const becomePro = async ({ proType, businessName, vatNumber, bio }) => {
    if (!session?.user) throw new Error("Not signed in.");
    const workspaceId = uuidv7();
    const { error } = await supabase.schema("api").rpc("become_pro", {
      p_workspace_id: workspaceId,
      p_membership_id: uuidv7(),
      p_pro_type: proType,
      p_business_name: businessName || null,
      p_vat_number: vatNumber || null,
      p_bio: bio || null,
      p_workspace_event_id: uuidv7(),
      p_membership_event_id: uuidv7(),
      p_correlation_id: uuidv7(),
      p_actor_type: "person",
      p_actor_ref: session.user.id,
    });
    if (error) throw error;
    await refreshProfile(session.user.id);
    return { workspaceId };
  };

  const updateProfile = async (fields) => {
    if (!session?.user) throw new Error("Not signed in.");
    const { error } = await supabase.from("profiles").update(fields).eq("id", session.user.id);
    if (error) throw error;
    await refreshProfile(session.user.id);
  };

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    proProfile,
    // Epic 03 — workspaceMemberships (WP 03.09) feeds the read switch (WP 03.11) and the
    // switcher (WP 03.12); activeWorkspace resolves to the switcher's own choice when one
    // exists and is still live, the personal workspace otherwise (see
    // resolveActiveWorkspace's own comment for why that default, not null).
    workspaceMemberships,
    activeWorkspace: resolveActiveWorkspace(workspaceMemberships, preferredWorkspaceId),
    setActiveWorkspaceId,
    loading,
    signUp,
    signIn,
    signInWithOtp,
    signInWithOAuth,
    signOut,
    becomePro,
    updateProfile,
    refreshProfile: () => refreshProfile(session?.user?.id ?? null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
