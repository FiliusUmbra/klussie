// The first-login tour: four steps, dismissible at every one of them.
//
// UX_PATTERNS.md records that this product deliberately had no onboarding walkthrough —
// "AI before forms" meant the first real interaction was the intake itself. That
// argument still holds for the *conversation*, and this tour does not stand in front
// of it: it explains what the homepage now also holds (a home, a set of items) that a
// customer would otherwise have no reason to look for. It is skippable from step one,
// never shown twice, and never blocks a customer who just wants to report a leak.
//
// Built on the design system's Modal, which gained a real focus trap for this
// (src/design-system/overlays.jsx) — a four-step dialog a keyboard user can Tab out of
// is worse than no dialog.
import { useState } from "react";
import { Modal } from "../design-system";
import { interpolate } from "../lib/homeStrings.js";

// Configuration, not markup: adding or reordering a step is an edit here.
const STEPS = [
  { id: "describe", titleKey: "tourStep1Title", bodyKey: "tourStep1Body" },
  { id: "questions", titleKey: "tourStep2Title", bodyKey: "tourStep2Body" },
  { id: "home", titleKey: "tourStep3Title", bodyKey: "tourStep3Body" },
  { id: "items", titleKey: "tourStep4Title", bodyKey: "tourStep4Body" },
];

export function CustomerOnboarding({ t, onFinish }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  return (
    <Modal
      onClose={() => onFinish({ destination: "klussie" })}
      closeLabel={t.tourSkip}
      labelledBy="home-tour-title"
      describedBy="home-tour-body"
    >
      <div className="tour">
        <p className="tour-progress">{interpolate(t.tourProgress, { n: index + 1, total: STEPS.length })}</p>
        {/* One live region for the whole dialog: stepping forward changes the text in
            place rather than opening a new dialog, so without this a screen-reader
            user hears nothing after pressing Next. */}
        <div aria-live="polite">
          <h2 className="tour-title" id="home-tour-title">{t[step.titleKey]}</h2>
          <p className="tour-body" id="home-tour-body">{t[step.bodyKey]}</p>
        </div>

        {/* Dots carry position visually; the sentence above carries it for everyone
            else, so these stay decorative rather than duplicating it. */}
        <ol className="tour-dots" aria-hidden="true">
          {STEPS.map((s, i) => (
            <li key={s.id} className={"tour-dot" + (i === index ? " tour-dot-on" : "")} />
          ))}
        </ol>

        <div className="tour-actions">
          {last ? (
            <>
              <button type="button" className="btn-primary" onClick={() => onFinish({ destination: "klussie" })}>
                {t.tourStartCta}
              </button>
              <button type="button" className="btn-secondary" onClick={() => onFinish({ destination: "myHome" })}>
                {t.tourSetupHomeCta}
              </button>
            </>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setIndex(index + 1)}>
              {t.tourNext}
            </button>
          )}

          <div className="tour-nav">
            {index > 0 && (
              <button type="button" className="tour-link" onClick={() => setIndex(index - 1)}>{t.tourBack}</button>
            )}
            {/* Always visible, including on the last step — "a clearly visible skip
                option" means at every step, not only at the start. */}
            <button type="button" className="tour-link tour-skip" onClick={() => onFinish({ destination: "klussie" })}>
              {t.tourSkip}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
