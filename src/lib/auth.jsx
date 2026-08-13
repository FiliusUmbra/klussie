/* eslint-disable react-refresh/only-export-components -- context file intentionally exports the provider plus its hook */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { uuidv7 } from "./ids.js";

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

async function loadProfile(userId) {
  const [{ data: profile, error: profileErr }, { data: proProfile, error: proErr }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("pro_profiles").select("*").eq("profile_id", userId).maybeSingle(),
  ]);
  if (profileErr) throw profileErr;
  if (proErr) throw proErr;
  return { profile, proProfile };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [proProfile, setProProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      setProProfile(null);
      return;
    }
    const { profile, proProfile } = await loadProfile(userId);
    setProfile(profile);
    setProProfile(proProfile);
  }, []);

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
      options: { data: { full_name: fullName || null, person_ref: uuidv7() } },
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
      options: { emailRedirectTo: window.location.origin, data: { person_ref: uuidv7() } },
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

  const becomePro = async ({ proType, businessName, vatNumber, bio }) => {
    if (!session?.user) throw new Error("Not signed in.");
    const { error } = await supabase.from("pro_profiles").insert({
      profile_id: session.user.id,
      pro_type: proType,
      business_name: businessName || null,
      vat_number: vatNumber || null,
      bio: bio || null,
    });
    if (error) throw error;
    await refreshProfile(session.user.id);
  };

  const updateProfile = async (fields) => {
    if (!session?.user) throw new Error("Not signed in.");
    const { error } = await supabase.from("profiles").update(fields).eq("id", session.user.id);
    if (error) throw error;
    await refreshProfile(session.user.id);
  };

  // Marks the post-auth "how will you use Klussie" question as answered,
  // whichever branch the user picked — see RoleSelectionScreen in App.jsx.
  const markRoleSelected = async () => {
    if (!session?.user) throw new Error("Not signed in.");
    const { error } = await supabase.from("profiles").update({ onboarding_role_selected: true }).eq("id", session.user.id);
    if (error) throw error;
    await refreshProfile(session.user.id);
  };

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    proProfile,
    loading,
    signUp,
    signIn,
    signInWithOtp,
    signInWithOAuth,
    signOut,
    becomePro,
    updateProfile,
    markRoleSelected,
    refreshProfile: () => refreshProfile(session?.user?.id ?? null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
