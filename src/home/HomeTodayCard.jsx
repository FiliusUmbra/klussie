// "Vandaag voor jouw woning" — one card, one genuinely useful thing.
//
// Which thing is decided by src/lib/homeToday.js from real service_requests rows;
// this component only turns that descriptor into words. Nothing here invents urgency,
// and the honest onboarding state is what shows when the account really has nothing
// pending — an empty card that says "you have nothing" would be true and useless,
// while a fabricated reminder would be useful-looking and false.
import { ChevronRight, CalendarCheck, FileText, Clock, Star, Sparkles } from "lucide-react";
import { interpolate } from "../lib/homeStrings.js";

// One entry per kind returned by pickTodayItem. Icons are Lucide only
// (MASTER_CONTEXT.md §17: never mix icon families).
const KIND_COPY = {
  quotes_ready: { titleKey: "todayQuotesTitle", bodyKey: "todayQuotesBody", icon: FileText, tone: "amber" },
  booked: { titleKey: "todayBookedTitle", bodyKey: "todayBookedBody", icon: CalendarCheck, tone: "forest" },
  awaiting_pro: { titleKey: "todayAwaitingTitle", bodyKey: "todayAwaitingBody", icon: Clock, tone: "forest" },
  collecting: { titleKey: "todayCollectingTitle", bodyKey: "todayCollectingBody", icon: Clock, tone: "forest" },
  needs_review: { titleKey: "todayReviewTitle", bodyKey: "todayReviewBody", icon: Star, tone: "forest" },
};

export function HomeTodayCard({ t, item, serviceName, onOpenRequest, onSetUpHome }) {
  const copy = item ? KIND_COPY[item.kind] : null;

  return (
    <section className="today" aria-labelledby="home-today-heading">
      <h2 className="home-section-title" id="home-today-heading">{t.todayHeading}</h2>

      {copy ? (
        <button type="button" className={`today-card today-card-${copy.tone}`} onClick={() => onOpenRequest(item.request.id)}>
          <span className="today-card-glyph" aria-hidden="true"><copy.icon size={16} /></span>
          <span className="today-card-text">
            <span className="today-card-title">{t[copy.titleKey]}</span>
            <span className="today-card-body">{interpolate(t[copy.bodyKey], { service: serviceName })}</span>
            <span className="today-card-cta">{t.todayOpenCta}</span>
          </span>
          <span className="today-card-chev" aria-hidden="true"><ChevronRight size={16} /></span>
        </button>
      ) : (
        // The onboarding state, not a placeholder: it offers a specific first step
        // rather than describing an absence.
        <div className="today-card today-card-empty">
          <span className="today-card-glyph" aria-hidden="true"><Sparkles size={16} /></span>
          <div className="today-card-text">
            <span className="today-card-title">{t.todayEmptyTitle}</span>
            <span className="today-card-body">{t.todayEmptyBody}</span>
          </div>
          <button type="button" className="btn-secondary today-empty-cta" onClick={onSetUpHome}>
            {t.todayEmptyCta}
          </button>
        </div>
      )}
    </section>
  );
}
