// When the first-login pro tour opens, and what happens when it closes.
//
// The direct equivalent of src/home/useHomeTour.js — same reasoning throughout,
// including the deliberately effect-free eligibility derivation (GUIDANCE_SYSTEM.md
// §17.2.1's own "no separate tour" gap, now closed).
import { useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { updateProProfile as writeProProfile } from "../lib/pros.js";
import { isEligibleForFirstLoginProTour, markProTourCompleted } from "../lib/onboardingPrefs.js";

export function useProTour() {
  const { user, proProfile, refreshProfile } = useAuth();
  const [closed, setClosed] = useState(false);
  const [replaying, setReplaying] = useState(false);

  const eligible = !!proProfile && isEligibleForFirstLoginProTour({ proProfile, userId: user?.id });

  const open = replaying || (eligible && !closed);

  // Finishing and skipping are the same commitment, matching useHomeTour.js's own
  // reasoning: a pro who dismisses the tour has decided they've seen enough.
  //
  // updateProProfile here is src/lib/pros.js's own existing write (already used by
  // src/profile/Profile.jsx's own setProType()/togglePaused()/boost(), pro variant) —
  // not a new function; the
  // (fields) => ... shape onboardingPrefs.js's own markProTourCompleted() expects is
  // just that same write, closed over the caller's own id, matching updateProfile()'s
  // identical shape in auth.jsx for the customer tour.
  const finish = async () => {
    setClosed(true);
    setReplaying(false);
    await markProTourCompleted({ userId: user?.id, updateProProfile: (fields) => writeProProfile(user.id, fields) });
    // Found by code audit: refreshProfile() (auth.jsx) throws on a real Postgres/network
    // failure, and this call had no catch of its own. finish is wired directly as
    // ProOnboarding.jsx's onClick handler (Done, Skip, and the Modal's own overlay-click/
    // Escape close) -- never awaited or caught there -- so a real failure here was a
    // genuine unhandled promise rejection on every tour dismissal that hit one. The tour
    // still closes regardless (setClosed(true) above already flips `open` false
    // synchronously, before this ever runs); this only stops the rejection from escaping
    // unhandled. proProfile simply keeps its pre-refresh value until the next successful
    // read -- the same "continues signed in without it" shape auth.jsx's own two call
    // sites use for this identical failure (see that file's own header).
    try {
      await refreshProfile();
    } catch (err) {
      console.warn("pro tour: profile refresh after finishing failed, continuing:", err.message);
    }
  };

  return { open, finish, replay: () => setReplaying(true) };
}
