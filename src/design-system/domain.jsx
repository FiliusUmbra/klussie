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

// Bars driven by a real 0..1 mic level. The per-bar multipliers give the row a
// waveform shape instead of one uniform pulse, but every bar's height comes from the
// same measured input — nothing here animates on its own (EXPERIENCE_VISION.md §7).
const WAVEFORM_BAR_SCALE = [0.45, 0.75, 1, 0.8, 0.55, 0.85, 1, 0.7, 0.5];

// Voice capture, presentational only: the caller owns the recognizer and the meter and
// passes their current output down (see the design-system convention at the top of
// this file). Implements the sequence in EXPERIENCE_VISION.md §6, Fig. 4 — listening,
// transcript building as it's spoken, then a gentle confirmation. There is deliberately
// no separate "review your transcript" step.
export function VoiceCapture({ state, level = 0, transcript, meterAvailable = true, listeningLabel, doneLabel, stopLabel, onStop }) {
  const listening = state === "listening";
  return (
    <div className="voice-capture">
      <div className="voice-status">
        <span className={"voice-dot" + (listening ? " voice-dot-live" : "")} />
        {listening ? listeningLabel : doneLabel}
      </div>

      {listening && (
        <div className="voice-wave" aria-hidden="true">
          {WAVEFORM_BAR_SCALE.map((scale, i) => (
            <span
              key={i}
              className="voice-bar"
              // A still row when metering is unavailable — an honest "no signal" rather
              // than a decorative animation pretending to hear something.
              style={{ transform: `scaleY(${meterAvailable ? 0.15 + level * scale * 0.85 : 0.15})` }}
            />
          ))}
        </div>
      )}

      <p className="voice-transcript" aria-live="polite">{transcript}</p>

      {listening && (
        <button type="button" className="voice-stop" onClick={onStop}>{stopLabel}</button>
      )}
    </div>
  );
}

// Photo capture, presentational only. EXPERIENCE_VISION.md §6, Fig. 5: the photo shows
// full width and unhidden, and the confidence tag sits *on the photo itself* rather
// than in a separate results panel — the proof and the evidence stay in one place.
export function PhotoCapture({ previewUrl, analyzing, tag, alt, analyzingLabel, confirmLabel, retakeLabel, onConfirm, onRetake }) {
  return (
    <div className="photo-capture">
      <div className="photo-capture-frame">
        {previewUrl && <img src={previewUrl} alt={alt} className="photo-capture-img" />}
        {analyzing && <span className="photo-capture-tag photo-capture-tag-pending">{analyzingLabel}</span>}
        {!analyzing && tag && <span className="photo-capture-tag">{tag}</span>}
      </div>
      <div className="photo-capture-actions">
        <button type="button" className="photo-capture-retake" onClick={onRetake}>{retakeLabel}</button>
        <button type="button" className="photo-capture-confirm" onClick={onConfirm} disabled={analyzing}>{confirmLabel}</button>
      </div>
    </div>
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
