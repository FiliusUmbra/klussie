// Rating a finished job. Stars default to five and the text is optional — a customer who
// taps straight through leaves a genuine positive review rather than nothing, which is
// what most satisfied customers would otherwise do.
import { useState } from "react";
import { Star } from "lucide-react";
import { useLang } from "../lib/lang";
import { Drawer } from "../design-system";

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
          <button key={i} onClick={() => setStars(i)} aria-label={`Rate ${i} star${i > 1 ? "s" : ""}`} aria-pressed={i <= stars}><Star size={30} fill={i <= stars ? "var(--amber-dark)" : "none"} color={i <= stars ? "var(--amber-dark)" : "var(--line-strong)"} strokeWidth={1.5} /></button>
        ))}
      </div>
      <textarea className="textarea" rows={3} placeholder={t.howDidItGo} value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn-primary" onClick={() => onSubmit({ stars, text: text || t.defaultReviewText })}>{t.submitReviewBtn}</button>
    </Drawer>
  );
}
