// A professional's work, split by where it stands: quotes sent and waiting, jobs booked,
// jobs done. Completed jobs show the customer's review, or say plainly that none arrived —
// silence is information too.
import { useState } from "react";
import { useLang } from "../lib/lang";
import { Badge, Rating, JobCard } from "../design-system";

const SEGMENTS = ["sent", "booked", "completed"];

// Badge tone per segment, and the locale key naming it.
const SEGMENT_BADGE = {
  sent: { tone: "amber", labelKey: "badgeWaiting" },
  booked: { tone: "forest", labelKey: "badgeBooked" },
  completed: { tone: "sage", labelKey: "badgeDone" },
};

export function ProJobs({ sent, booked, completed, proId, onOpenJob }) {
  const { t, fmt, serviceInfo } = useLang();
  const [seg, setSeg] = useState("sent");
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
            onClick={seg !== "sent" && onOpenJob ? () => onOpenJob(r) : undefined}
            title={serviceInfo(r.serviceId).name}
            badge={<Badge tone={badge.tone}>{t[badge.labelKey]}</Badge>}
            subtitle={`${t.yourQuoteLabel} €${fmt(myQuote?.price ?? 0)}`}
          >
            {seg === "completed" && r.review && (<><div className="ticket-divider" /><Rating value={r.review.stars} size={12} /><p className="quote-msg">"{r.review.text}"</p></>)}
            {seg === "completed" && !r.review && <div className="ticket-sub" style={{ marginTop: 6 }}>{t.noReviewYet}</div>}
          </JobCard>
        );
      })}
    </div>
  );
}
