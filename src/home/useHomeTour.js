// When the first-login tour opens, and what happens when it closes.
//
// Kept out of the component so "eligible" is one testable expression rather than a
// chain of conditions inside JSX, and so CustomerApp gains four lines instead of
// twenty (src/App.jsx is already the file MASTER_CONTEXT.md §12 wants smaller, not
// bigger).
//
// Deliberately effect-free: openness is derived from the profile rather than pushed
// into state when the profile arrives. An effect here would fire a second render on
// every sign-in for a value that is a pure function of data React already has.
import { useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { isEligibleForFirstLoginTour, markHomeTourCompleted } from "../lib/onboardingPrefs.js";

export function useHomeTour() {
  const { user, profile, updateProfile } = useAuth();
  // `closed` covers the gap between the customer dismissing the tour and the profile
  // write coming back — without it the tour would reappear for one render.
  const [closed, setClosed] = useState(false);
  const [replaying, setReplaying] = useState(false);

  const eligible = !!profile && isEligibleForFirstLoginTour({
    profile,
    userId: user?.id,
    roleSelected: !!profile.onboarding_role_selected,
  });

  const open = replaying || (eligible && !closed);

  // Finishing and skipping are the same commitment: the customer has decided they've
  // seen enough. Showing it again after a skip would be the product overruling that.
  const finish = async ({ destination }) => {
    setClosed(true);
    setReplaying(false);
    await markHomeTourCompleted({ userId: user?.id, updateProfile });
    return destination;
  };

  return { open, finish, replay: () => setReplaying(true) };
}
