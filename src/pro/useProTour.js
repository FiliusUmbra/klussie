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
  // ProProfile.jsx's setProType()/togglePaused()/boost()) — not a new function; the
  // (fields) => ... shape onboardingPrefs.js's own markProTourCompleted() expects is
  // just that same write, closed over the caller's own id, matching updateProfile()'s
  // identical shape in auth.jsx for the customer tour.
  const finish = async () => {
    setClosed(true);
    setReplaying(false);
    await markProTourCompleted({ userId: user?.id, updateProProfile: (fields) => writeProProfile(user.id, fields) });
    await refreshProfile();
  };

  return { open, finish, replay: () => setReplaying(true) };
}
