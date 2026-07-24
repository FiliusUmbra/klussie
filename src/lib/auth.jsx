/* eslint-disable react-refresh/only-export-components -- context file intentionally exports the provider plus its hook */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

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

  const signUp = async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName || null } },
    });
    if (error) throw error;
    return { needsEmailConfirmation: !data.session };
  };

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
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

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    proProfile,
    loading,
    signUp,
    signIn,
    signOut,
    becomePro,
    updateProfile,
    refreshProfile: () => refreshProfile(session?.user?.id ?? null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
