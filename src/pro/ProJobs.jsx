// A professional's work, split by where it stands: jobs booked (Upcoming, the default —
// UX redesign, 2026-09-28), quotes sent and waiting (Quotes), jobs done (History).
// Completed jobs show the customer's review, or say plainly that none arrived — silence
// is information too.
//
// UX_TAB_SCOPE.md P2 — "Quotes must open for inspection even when not accepted." Sent
// quotes used to be the one segment with no detail handler at all; that's fixed here by
// dropping the seg-based gate entirely. Nothing about ProJobDetailSheet.jsx itself is
// segment-specific — it already renders whatever job/quote state it's given.
import { useState } from "react";
import { useLang } from "../lib/lang";
import { Badge, Rating, JobCard } from "../design-system";
import { interpolate } from "../lib/homeStrings.js";

const SEGMENTS = ["booked", "sent", "completed"];

// Badge tone per segment, and the locale key naming it.
const SEGMENT_BADGE = {
  sent: { tone: "amber", labelKey: "badgeWaiting" },
  booked: { tone: "forest", labelKey: "badgeBooked" },
  completed: { tone: "sage", labelKey: "badgeDone" },
};

export function ProJobs({ sent, booked, completed, proId, onOpenJob }) {
  const { t, fmt, serviceInfo } = useLang();
  const [seg, setSeg] = useState("booked");
  const lists = { sent, booked, completed };
  const list = lists[seg];
  const segmentLabels = { sent: t.segSent, booked: t.segBooked, completed: t.segDone };
  return (
    <div className="pad">
      <div className="h1" style={{ marginBottom: 14 }}>{t.myJobsTitle}</div>
      <div className="segmented" style={{ marginBottom: 16 }}>
        {SEGMENTS.map((s) => (
          <button key={s} className={seg === s ? "seg-on" : ""} onClick={() => setSeg(s)}>{segmentLabels[s]} ({lists[s].length})</button>
        ))}
      </div>

      {list.length === 0 && <div className="empty-block"><p>{t.nothingHereYet}</p></div>}

      {list.map((r) => {
        const myQuote = r.quotes.find((q) => q.proId === proId);
        const badge = SEGMENT_BADGE[seg];
        return (
          <JobCard
            key={r.id}
            onClick={onOpenJob ? () => onOpenJob(r) : undefined}
            title={serviceInfo(r.serviceId).name}
            badge={<Badge tone={badge.tone}>{t[badge.labelKey]}</Badge>}
            subtitle={`${t.yourQuoteLabel} €${fmt(myQuote?.price ?? 0)}`}
          >
            {seg === "completed" && r.review && (<><div className="ticket-divider" /><Rating value={r.review.stars} size={12} label={interpolate(t.ratingLabel, { value: r.review.stars })} /><p className="quote-msg">"{r.review.text}"</p></>)}
            {seg === "completed" && !r.review && <div className="ticket-sub" style={{ marginTop: 6 }}>{t.noReviewYet}</div>}
          </JobCard>
        );
      })}
    </div>
  );
}
