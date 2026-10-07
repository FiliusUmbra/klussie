// Rating a finished job. NO star is preselected and Send stays disabled until one is chosen
// (live review 2026-10-04, item 17 — a default five meant a customer could publish a glowing
// review without ever deciding on it). The text stays optional. The stars are one single-value
// control (a radio group), so a screen reader announces "3 of 5", not five independent toggles.
import { useState } from "react";
import { Star } from "lucide-react";
import { useLang } from "../lib/lang";
import { Drawer } from "../design-system";
import { interpolate } from "../lib/homeStrings.js";

export function ReviewSheet({ onClose, onSubmit }) {
  const { t } = useLang();
  const [stars, setStars] = useState(0);
  const [text, setText] = useState("");
  return (
    <Drawer onClose={onClose} closeLabel={t.closeBtn} variant="page">
      <div className="sheet-title">{t.reviewTitle}</div>
      <div className="star-picker" role="radiogroup" aria-label={t.reviewTitle}>
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
          <button key={i} onClick={() => setStars(i)} aria-label={i === 1 ? t.reviewStarLabelOne : interpolate(t.reviewStarLabel, { n: i })} role="radio" aria-checked={i === stars}><Star size={30} fill={i <= stars ? "var(--amber-dark)" : "none"} color={i <= stars ? "var(--amber-dark)" : "var(--line-strong)"} strokeWidth={1.5} /></button>
        ))}
      </div>
      <textarea className="textarea" rows={3} placeholder={t.howDidItGo} value={text} onChange={(e) => setText(e.target.value)} />
      {stars === 0 && <p className="fineprint" style={{ justifyContent: "flex-start" }}>{t.reviewChooseRating}</p>}
      <button className="btn-primary" disabled={stars === 0} onClick={() => onSubmit({ stars, text: text || t.defaultReviewText })}>{t.submitReviewBtn}</button>
    </Drawer>
  );
}
