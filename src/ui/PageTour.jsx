// A per-page, contextual tour: a ring around one real element on the current page at a
// time, with a small card pointing at it from above or below — never a darkened
// backdrop. Distinct from CustomerOnboarding.jsx's own first-login modal (four steps,
// no connection to any element on screen, shown once ever, a real Modal that blocks the
// page behind it) — this is "here's the button, here's what it does," re-runnable per
// page, and the rest of the page stays exactly as reachable as it already was. Founder
// decision, 2026-10-01: full focus stays on the real button, not on dimming everything
// else around it.
//
// Reuses CustomerOnboarding's own `.tour-progress`/`.tour-title`/`.tour-body`/
// `.tour-dots`/`.tour-actions`/`.tour-nav`/`.tour-link` classes for the card's internal
// content — identical visual language, no new CSS for any of it. Only the anchored
// positioning and the ring (`.page-tour-*`) are new.
import { useEffect, useLayoutEffect, useState } from "react";
import { useLang } from "../lib/lang";
import { interpolate } from "../lib/homeStrings.js";

const CARD_MARGIN = 12;
const CARD_MAX_WIDTH = 320;
const VIEWPORT_PADDING = 16;

// Where the card and its pointer arrow go, given the target's own rect — below the
// target when there's room, above it otherwise, horizontally centered on the target but
// clamped so it never runs off either edge of the viewport. Pure and viewport-only (no
// DOM reads of the card's own size: cards vary by copy length, and measuring a card
// that doesn't exist yet would mean rendering once off-screen first) — CARD_MAX_WIDTH is
// an upper bound, not the real rendered width, so the card's own CSS still needs
// max-width and the arrow math stays correct even when the real width is narrower.
function computeCardPosition(rect) {
  const width = Math.min(CARD_MAX_WIDTH, window.innerWidth - VIEWPORT_PADDING * 2);
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const below = spaceBelow >= 180 || spaceBelow >= spaceAbove;

  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(VIEWPORT_PADDING, Math.min(left, window.innerWidth - width - VIEWPORT_PADDING));

  const arrowLeft = Math.max(16, Math.min(rect.left + rect.width / 2 - left, width - 16));

  return below
    ? { placement: "below", top: rect.bottom + CARD_MARGIN, left, width, arrowLeft }
    : { placement: "above", bottom: window.innerHeight - rect.top + CARD_MARGIN, left, width, arrowLeft };
}

export function PageTour({ steps, onFinish }) {
  const { t } = useLang();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  useLayoutEffect(() => {
    const el = document.querySelector(`[data-tour="${step.id}"]`);
    // Optional chaining, not an assumed capability — jsdom (every test here) has no
    // real layout engine and doesn't implement it at all. A null target (the step's own
    // element isn't mounted) resolves update() to setRect(null) below, the same "don't
    // point at nothing" outcome a direct early return would give.
    el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    const update = () => setRect(el ? el.getBoundingClientRect() : null);
    update();
    if (!el) return undefined;
    // A scroll triggered by scrollIntoView above settles over a few frames, not
    // synchronously — one more measurement after layout has a chance to catch up, on
    // top of the scroll/resize listeners below for anything the viewer does themselves.
    const raf = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step.id]);

  // Escape mirrors CustomerOnboarding.jsx's own Modal — every overlay in this app closes
  // on it, and a tour a keyboard user can't otherwise dismiss would be worse than none.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onFinish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFinish]);

  // The target isn't mounted (a conditional section, a slow data fetch, a step
  // misconfigured for this page) — never point at nothing.
  if (!rect) return null;

  const pos = computeCardPosition(rect);

  return (
    <>
      <div
        className="page-tour-highlight"
        style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
      />
      <div
        className={"page-tour-card page-tour-card-" + pos.placement}
        style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}
        role="dialog"
        aria-labelledby="page-tour-title"
        aria-describedby="page-tour-body"
      >
        <span className="page-tour-arrow" style={{ left: pos.arrowLeft }} aria-hidden="true" />
        <p className="tour-progress">{interpolate(t.tourProgress, { n: index + 1, total: steps.length })}</p>
        {/* One live region, same reasoning as CustomerOnboarding.jsx's own: stepping
            changes text in place rather than opening a new dialog, so a screen-reader
            user needs to be told. */}
        <div aria-live="polite">
          <h2 className="tour-title" id="page-tour-title">{t[step.titleKey]}</h2>
          <p className="tour-body" id="page-tour-body">{t[step.bodyKey]}</p>
        </div>

        <ol className="tour-dots" aria-hidden="true">
          {steps.map((s, i) => (
            <li key={s.id} className={"tour-dot" + (i === index ? " tour-dot-on" : "")} />
          ))}
        </ol>

        <div className="tour-actions">
          {last ? (
            <button type="button" className="btn-primary" onClick={onFinish}>{t.pageTourDoneBtn}</button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setIndex(index + 1)}>{t.tourNext}</button>
          )}
          <div className="tour-nav">
            {index > 0 && (
              <button type="button" className="tour-link" onClick={() => setIndex(index - 1)}>{t.tourBack}</button>
            )}
            <button type="button" className="tour-link tour-skip" onClick={onFinish}>{t.tourSkip}</button>
          </div>
        </div>
      </div>
    </>
  );
}
