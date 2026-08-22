// The first-login pro tour: six beats, dismissible at every one of them —
// GUIDANCE_SYSTEM.md §17.2.1, built to close the exact gap it names: a pro landing on
// the dashboard straight after BecomeProSheet with zero introduction.
//
// SIX BEATS, NOT FOUR — THE SPEC'S OWN SHAPE, NOT CustomerOnboarding.jsx's
//
// §17.2.1 writes a distinct opener and closer (no real control, pure narrative)
// bracketing four real-anchored steps (Dashboard, Mijn klussen, Messages, the pause
// toggle) — a shorter layer than the customer tour by design ("re-anchor trust in a
// new context, not rebuild it from nothing"), but structurally six screens, not four.
// Kept faithful to that shape rather than force-fit into the customer tour's four-step
// layout.
//
// Built on the same Modal (real focus trap) and the same interaction shape
// (CustomerOnboarding.jsx) — one voice, held across both tours, per §A.6's own
// "companion identity" requirement.
import { useState } from "react";
import { Modal } from "../design-system";
import { interpolate } from "../lib/homeStrings.js";

const STEPS = [
  { id: "opener", titleKey: "proTourStep0Title", bodyKey: "proTourStep0Body" },
  { id: "dashboard", titleKey: "proTourStep1Title", bodyKey: "proTourStep1Body" },
  { id: "jobs", titleKey: "proTourStep2Title", bodyKey: "proTourStep2Body" },
  { id: "messages", titleKey: "proTourStep3Title", bodyKey: "proTourStep3Body" },
  { id: "pause", titleKey: "proTourStep4Title", bodyKey: "proTourStep4Body" },
  { id: "closer", titleKey: "proTourStep5Title", bodyKey: "proTourStep5Body" },
];

export function ProOnboarding({ t, onFinish }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  return (
    <Modal onClose={onFinish} closeLabel={t.tourSkip} labelledBy="pro-tour-title" describedBy="pro-tour-body">
      <div className="tour">
        <p className="tour-progress">{interpolate(t.tourProgress, { n: index + 1, total: STEPS.length })}</p>
        <div aria-live="polite">
          <h2 className="tour-title" id="pro-tour-title">{t[step.titleKey]}</h2>
          <p className="tour-body" id="pro-tour-body">{t[step.bodyKey]}</p>
        </div>

        <ol className="tour-dots" aria-hidden="true">
          {STEPS.map((s, i) => (
            <li key={s.id} className={"tour-dot" + (i === index ? " tour-dot-on" : "")} />
          ))}
        </ol>

        <div className="tour-actions">
          {last ? (
            <button type="button" className="btn-primary" onClick={onFinish}>
              {t.proTourDoneCta}
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setIndex(index + 1)}>
              {t.tourNext}
            </button>
          )}

          <div className="tour-nav">
            {index > 0 && (
              <button type="button" className="tour-link" onClick={() => setIndex(index - 1)}>{t.tourBack}</button>
            )}
            <button type="button" className="tour-link tour-skip" onClick={onFinish}>
              {t.tourSkip}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
