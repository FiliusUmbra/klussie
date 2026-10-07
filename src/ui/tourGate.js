// Lets one tour hold the others back. Live review 2026-10-04, item 11: a fresh account saw the
// first-login onboarding modal AND the page tour at the same moment, competing for attention.
// CustomerApp provides `{ blocked: true }` while its onboarding is open; usePageTour() reads it
// and simply waits, so the page tour opens afterwards instead of on top. The default (no
// provider) is "not blocked", so every existing caller and test behaves exactly as before.
import { createContext, useContext } from "react";

export const TourGateContext = createContext({ blocked: false });

export function useTourGate() {
  return useContext(TourGateContext);
}
