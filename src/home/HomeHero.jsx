// The homepage hero: one warm image of a home, the customer's name, and the one
// question the whole page exists to ask.
//
// Presentation only — the greeting text and the customer's name are resolved by the
// caller (src/home/useHomeContext.js), so this component holds no clock, no profile
// lookup, and no locale logic.
import { useState } from "react";
import { selectHomeHero } from "./heroImage.js";

// The image is decorative: it carries mood, not information, and every fact on this
// surface is in the text over it. alt="" plus aria-hidden keeps a screen reader from
// announcing a wrapper that says nothing the heading doesn't already say. The
// fallback surface below is the same story with no <img> at all.
export function HomeHero({ greeting, question }) {
  const hero = selectHomeHero();
  const [failed, setFailed] = useState(false);

  return (
    <header className="home-hero">
      <div className={"home-hero-media" + (failed ? " home-hero-media-fallback" : "")} aria-hidden="true">
        {!failed && (
          <picture>
            {hero.sources.map((s) => (
              <source key={s.type} srcSet={s.srcSet} type={s.type} sizes={s.sizes} />
            ))}
            {/* eager + fetchPriority: this is the largest element above the fold, and
                lazy-loading it would trade a visible pop-in for nothing. */}
            <img
              className="home-hero-img"
              src={hero.src}
              alt=""
              loading="eager"
              fetchPriority="high"
              decoding="async"
              onError={() => setFailed(true)}
            />
          </picture>
        )}
        {/* The scrim is what makes white text over an arbitrary image legal rather
            than lucky — see the contrast note in the CSS. */}
        <div className="home-hero-scrim" />
      </div>

      <div className="home-hero-copy">
        <p className="home-hero-greeting">{greeting}</p>
        <h1 className="home-hero-question">{question}</h1>
      </div>
    </header>
  );
}
