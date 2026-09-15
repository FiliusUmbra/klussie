// Presentation for each kind homeToday.js's classify() can return: which title/body
// keys into `t`, which Lucide icon, and which tone badge.
//
// Split out of HomeTodayCard.jsx (Homepage redesign, 2026-09-15): that file also
// exports the HomeTodayCard component, and react-refresh/only-export-components
// requires a .jsx file to export components only. HomeTodayCard.jsx and
// KlussiePanel.jsx's own ActiveRequests both import KIND_COPY from here, so a
// running request reads the same icon+tone language on both surfaces.
//
// homeToday.js stays pure data (no copy, no JSX) on purpose -- see its own header --
// so this is a separate file, not an addition there.
//
// Found by code audit: accepted_pending_location_approval had no entry here -- a
// request genuinely stalled on the customer's own next tap (RequestDetailSheet.jsx's
// own disclosure-approval card) rendered nothing on this card at all. amber, not
// forest, matching quotes_ready's own tone: both are "your move" states
// (requestStatus.js's awaitingDecisionCount() already groups them), unlike booked/
// awaiting_pro/collecting, which are all waiting on someone else. MapPin matches the
// disclosure card's own icon (RequestDetailSheet.jsx).
import { CalendarCheck, FileText, Clock, Star, MapPin } from "lucide-react";

export const KIND_COPY = {
  quotes_ready: { titleKey: "todayQuotesTitle", bodyKey: "todayQuotesBody", icon: FileText, tone: "amber" },
  accepted_pending_location_approval: { titleKey: "todayLocationApprovalTitle", bodyKey: "todayLocationApprovalBody", icon: MapPin, tone: "amber" },
  booked: { titleKey: "todayBookedTitle", bodyKey: "todayBookedBody", icon: CalendarCheck, tone: "forest" },
  awaiting_pro: { titleKey: "todayAwaitingTitle", bodyKey: "todayAwaitingBody", icon: Clock, tone: "forest" },
  collecting: { titleKey: "todayCollectingTitle", bodyKey: "todayCollectingBody", icon: Clock, tone: "forest" },
  needs_review: { titleKey: "todayReviewTitle", bodyKey: "todayReviewBody", icon: Star, tone: "forest" },
};
