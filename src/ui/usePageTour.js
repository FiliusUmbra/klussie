// When a page's own PageTour.jsx opens, and what happens when it closes — the per-page
// equivalent of src/home/useHomeTour.js, same shape on purpose (open/finish/replay) so
// a caller already familiar with the home tour needs nothing new to read this one.
import { useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { hasSeenPageTour, markPageTourSeen } from "../lib/pageTourPrefs.js";
import { useTourGate } from "./tourGate.js";

export function usePageTour(pageId) {
  const { user } = useAuth();
  const [closed, setClosed] = useState(false);
  const [replaying, setReplaying] = useState(false);

  const seen = hasSeenPageTour(user?.id, pageId);
  const { blocked } = useTourGate();
  // A tour that is already showing never gets pulled away; a not-yet-shown one waits its turn.
  const open = replaying || (!seen && !closed && !blocked);

  const finish = () => {
    setClosed(true);
    setReplaying(false);
    markPageTourSeen(user?.id, pageId);
  };

  return { open, finish, replay: () => setReplaying(true) };
}
