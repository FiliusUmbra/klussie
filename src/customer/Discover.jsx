// Retained intentionally, not dead code: EXPERIENCE_VISION.md §10 retires the category
// grid as the *entry point* but keeps the matching logic beneath it, and where this
// browse UI lives afterward is still an open question in the Epic 03 plan. Deleting it
// before that's answered would throw away work with no agreed replacement home.
//
// Nothing renders it today — CustomerApp's Discover tab is the conversation home. It
// keeps its own file so that stays visible: an unused screen inside a 3,000-line App.jsx
// is invisible debt, an unused screen in its own file is a decision anyone can find.
import { useState } from "react";
import { Search, MapPin, ChevronRight, Sparkles } from "lucide-react";
import { useLang } from "../lib/lang";
import { ServiceCard } from "../design-system";

export function Discover({ onOpenService, onOpenAiIntake }) {
  const { t, fmt, catName, serviceInfo, CATS, BASE_SERVICES } = useLang();
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const list = BASE_SERVICES.filter((s) => (cat === "all" || s.cat === cat) && serviceInfo(s.id).name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="pad">
      <div className="hello">
        <div><div className="eyebrow">{t.greeting}</div><div className="h1">{t.heroTitle}</div></div>
        <div className="pin"><MapPin size={13} /> {t.location}</div>
      </div>

      <button type="button" className="ai-intake-cta" onClick={onOpenAiIntake}>
        <Sparkles size={17} />
        <span>{t.aiIntakeCta}</span>
        <ChevronRight size={16} />
      </button>

      <div className="search"><Search size={16} color="var(--ink-soft)" /><input placeholder={t.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} /></div>

      <div className="chiprow">
        <button className={"chip" + (cat === "all" ? " chip-on" : "")} onClick={() => setCat("all")}>{t.catAll}</button>
        {CATS.map((c) => (
          <button key={c.id} className={"chip" + (cat === c.id ? " chip-on" : "")} onClick={() => setCat(c.id)}><c.icon size={13} /> {catName(c.id)}</button>
        ))}
      </div>

      <div className="section-title">{t.trendingTitle}</div>
      <div className="grid2">
        {list.map((s) => {
          const info = serviceInfo(s.id);
          return (
            <ServiceCard
              key={s.id}
              icon={CATS.find((c) => c.id === s.cat).icon}
              name={info.name}
              certifiedOnly={s.certifiedOnly}
              certifiedLabel={t.certifiedOnlyBadge}
              proCountLabel={`${fmt(s.pros)} ${t.prosSuffix}`}
              rating={s.rating}
              ctaVariant={s.mode === "book" ? "book" : "quote"}
              ctaLabel={s.mode === "book" ? t.serviceBookNow : t.serviceGetQuotes}
              onClick={() => onOpenService(s)}
            />
          );
        })}
        {list.length === 0 && <div className="empty">{t.noServicesFound}</div>}
      </div>
    </div>
  );
}
