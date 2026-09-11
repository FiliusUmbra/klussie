// Rating a finished job. Stars default to five and the text is optional — a customer who
// taps straight through leaves a genuine positive review rather than nothing, which is
// what most satisfied customers would otherwise do.
import { useState } from "react";
import { Star } from "lucide-react";
import { useLang } from "../lib/lang";
import { Drawer } from "../design-system";
import { interpolate } from "../lib/homeStrings.js";

export function ReviewSheet({ onClose, onSubmit }) {
  const { t } = useLang();
  const [stars, setStars] = useState(5);
  const [text, setText] = useState("");
  return (
    <Drawer onClose={onClose} closeLabel={t.closeBtn}>
      <div className="sheet-title">{t.reviewTitle}</div>
      <div className="star-picker">
        {[1, 2, 3, 4, 5].map((i) => (
          // --amber-dark, not --amber: a filled star here is the entire meaning of the
          // rating, so it needs the 3:1 non-text floor against this sheet's white
          // background -- #E8A33D only reaches ~2.16:1. See ACCESSIBILITY.md.
          //
          // Found by code audit, 2026-09-11: the accessibility pass that gave these
          // buttons an aria-label at all (ACCESSIBILITY.md's own "Fixed in this pass"
          // table) left it as the literal English string built here -- never one of
          // this component's own t.* keys, in the only screen-reader label these five
          // buttons have ever carried, in every locale.
          <button key={i} onClick={() => setStars(i)} aria-label={i === 1 ? t.reviewStarLabelOne : interpolate(t.reviewStarLabel, { n: i })} aria-pressed={i <= stars}><Star size={30} fill={i <= stars ? "var(--amber-dark)" : "none"} color={i <= stars ? "var(--amber-dark)" : "var(--line-strong)"} strokeWidth={1.5} /></button>
        ))}
      </div>
      <textarea className="textarea" rows={3} placeholder={t.howDidItGo} value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn-primary" onClick={() => onSubmit({ stars, text: text || t.defaultReviewText })}>{t.submitReviewBtn}</button>
    </Drawer>
  );
}
