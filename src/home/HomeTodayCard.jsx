// The customer's own highlighted "one genuinely useful thing" card.
//
// Which thing is decided by src/lib/homeToday.js from real service_requests rows;
// this component only turns that descriptor into words. Nothing here invents urgency,
// and the honest onboarding state is what shows when the account really has nothing
// pending — an empty card that says "you have nothing" would be true and useless,
// while a fabricated reminder would be useful-looking and false.
//
// Homepage redesign, 2026-09-15 — no longer its own headed <section>: this and
// ActiveRequests (KlussiePanel.jsx) now sit under one shared "Voor jou" heading, so
// the page reads as one list of things worth knowing rather than two separately-
// labeled sections that happen to look similar. Both import KIND_COPY from
// ../lib/homeTodayCopy.js so ActiveRequests's own rows carry the identical icon+tone
// per status, instead of the plain text-only row they used to be.
import { ChevronRight, Sparkles } from "lucide-react";
import { interpolate } from "../lib/homeStrings.js";
import { KIND_COPY } from "../lib/homeTodayCopy.js";

export function HomeTodayCard({ t, item, serviceName, onOpenRequest, onSetUpHome }) {
  const copy = item ? KIND_COPY[item.kind] : null;

  return copy ? (
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
    // The onboarding state, not a placeholder: it offers a specific first step rather
    // than describing an absence.
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
  );
}
