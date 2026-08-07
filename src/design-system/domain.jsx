// klussie design system — domain components. Composed from the primitives, carrying
// klussie-specific meaning (a job, a quote, a pro's trust signals) but no business
// logic and no data-fetching of their own — callers pass in already-resolved values
// (translated labels, formatted numbers), keeping these components pure presentation.
// See docs/engineering/ENGINEERING_STANDARDS.md, "no business logic in UI."
import { Sparkles, BadgeCheck } from "lucide-react";
import { Rating } from "./primitives.jsx";

export function TicketTear() {
  return <div className="tear" />;
}

// The persistent ambient trust bar on the conversation home — visible before the
// customer says anything and still there afterward, never changing position
// (docs/product/HOMEPAGE_DIRECTION.md: "trust isn't a stage in the flow here, it's
// the ground the whole flow stands on").
//
// Renders only the items it's handed. Deciding *which* signals qualify is a business
// rule — a signal with no real data behind it may never be shown (ADR-0011) — so that
// lives in src/lib/pros.js and its caller, not here. A real <ul> so screen readers
// announce it as the list of signals it is; separators are CSS, not text nodes.
export function TrustStrip({ items, label }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="trust-strip" aria-label={label}>
      {items.map((item) => (
        <li key={item} className="trust-strip-item">{item}</li>
      ))}
    </ul>
  );
}

// The service tile grid on the Discover screen.
export function ServiceCard({ icon: Icon, name, certifiedOnly, certifiedLabel, proCountLabel, rating, ctaLabel, ctaVariant = "quote", onClick }) {
  return (
    <button type="button" className="svc-card" onClick={onClick}>
      <div className="svc-icon"><Icon size={18} color="var(--forest)" /></div>
      <div className="svc-name">{name}</div>
      {certifiedOnly && <div className="svc-certified"><BadgeCheck size={11} /> {certifiedLabel}</div>}
      <div className="svc-meta">{proCountLabel}</div>
      <div className="svc-rating"><Rating value={rating} size={11} /> <span>{rating}</span></div>
      <div className={"svc-cta " + (ctaVariant === "book" ? "cta-book" : "cta-quote")}>{ctaLabel}</div>
    </button>
  );
}

// The torn-ticket card used for a customer's request or a pro's lead/job — slot-based
// (title/subtitle/badge/children/footer) rather than one prop per possible field,
// since the three real usages (customer requests, pro leads, pro jobs) each show
// meaningfully different body content.
export function JobCard({ onClick, badge, title, subtitle, children, footer }) {
  const inner = (
    <>
      <TicketTear />
      <div className="ticket-body">
        <div className="ticket-row">
          <div className="ticket-title">{title}</div>
          {badge}
        </div>
        {subtitle && <div className="ticket-sub">{subtitle}</div>}
        {children}
        {footer && (
          <>
            <div className="ticket-divider" />
            <div className="ticket-foot">{footer}</div>
          </>
        )}
      </div>
    </>
  );
  if (onClick) {
    return (
      <button type="button" className="ticket" onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className="ticket">{inner}</div>;
}

// The rounded card used for quotes, reviews, and testimonials — again slot-based:
// these three contexts show different content but share the same container chrome.
export function QuoteCard({ children, booked = false, className = "" }) {
  return <div className={`quote-card ${booked ? "quote-card-booked" : ""} ${className}`.trim()}>{children}</div>;
}

// Star rating, optionally with review count and/or computed trust score — the line
// repeated across quote cards, pro dashboards, and public pro profiles. `score` is
// optional: some contexts (e.g. ProProfile's own header) show only rating + review
// count, without the trust score.
export function TrustBadge({ rating, reviewCount, score, scoreLabel, fmt }) {
  return (
    <div className="quote-rating">
      <Rating value={rating} size={11} /> {rating}
      {reviewCount != null ? ` (${fmt ? fmt(reviewCount) : reviewCount})` : ""}
      {score != null ? ` · ${score} ${scoreLabel}` : ""}
    </div>
  );
}

// Distinct visual treatment for AI-sourced content, so it's never confused with
// something a human (customer or pro) wrote. `confidence` is optional (0-100).
export function AIMessage({ label, confidence, children }) {
  return (
    <div className="ai-analysis-summary">
      <div className="ai-analysis-header">
        <Sparkles size={12} /> {label}
        {typeof confidence === "number" && ` · ${confidence}%`}
      </div>
      {children}
    </div>
  );
}

// A compact horizontal status timeline. steps: [{ key, label, done, active }].
export function Timeline({ steps }) {
  return (
    <div className="timeline">
      {steps.map((s) => (
        <div key={s.key} className={"timeline-step" + (s.done ? " timeline-done" : "") + (s.active ? " timeline-active" : "")}>
          <div className="timeline-dot" />
          <div className="timeline-label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
