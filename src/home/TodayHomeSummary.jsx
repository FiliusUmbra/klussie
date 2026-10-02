// Today's property card and "upcoming" list (visual-refresh direction, 2026-10-02 — the
// drafted Today screen). Resolves its own twin (usePropertyTwin.js, the same read
// MyHomeScreen.jsx uses) rather than asking DailyHome's caller to thread it through, so
// DailyHome's existing props and every existing caller stay exactly as they were.
//
// REAL DATA OR NOTHING (ADR-0011): each stat renders only once its own source has
// resolved (null means "still loading", [] means a real zero), and the list shows only
// open maintenance that actually exists. Nothing here is a placeholder number.
//
// The gradient header is a deliberate stand-in for the property photo: the Street View
// hero is deferred (it needs a server-side API key), and the card must not look broken
// without one.
import { House, ChevronRight, Clock } from 'lucide-react';
import { useLang } from '../lib/lang';
import { usePropertyTwin } from './usePropertyTwin.js';
import { homeStats } from './homeStats.js';
import { TODAY_CARD } from '../lib/dailyStrings.js';

const UPCOMING_LIMIT = 2;

export function TodayHomeSummary({ requests, onOpenHome }) {
  const { langCode, fmtDate } = useLang();
  const c = TODAY_CARD[langCode] || TODAY_CARD.en;
  const twin = usePropertyTwin();
  const s = homeStats({ ...twin, requests });
  const property = twin.properties?.find((p) => p.id === twin.activePropertyId) || twin.properties?.[0];
  const name = property?.name || twin.homeProfile?.property?.name;
  const city = twin.homeProfile?.property?.municipality;
  const stats = [
    { key: 'items', value: s.items, label: c.items },
    { key: 'docs', value: s.docs, label: c.docs },
    { key: 'upcoming', value: s.upcoming, label: c.upcoming },
    { key: 'pros', value: s.pros, label: c.pros },
  ];
  const soon = (s.open || []).filter((m) => m.dueOn).slice(0, UPCOMING_LIMIT);

  return <>
    <button type="button" className="today-card" data-tour="today-myhome" onClick={onOpenHome}>
      <span className="today-card-cover" aria-hidden="true"><House size={44} strokeWidth={1.4} /></span>
      <span className="today-card-body">
        <span className="today-card-head">
          <strong>{name || ''}</strong>
          {city && <small>{city}</small>}
        </span>
        <span className="today-card-stats">
          {stats.map((st) => <span key={st.key}><b>{st.value ?? '–'}</b><small>{st.label}</small></span>)}
        </span>
      </span>
    </button>
    {soon.length > 0 && <section className="today-soon" aria-label={c.upcoming}>
      <div className="today-soon-head"><h2>{c.upcoming}</h2><button type="button" onClick={onOpenHome}>{c.seeAll}</button></div>
      {soon.map((m) => <button type="button" key={m.id || m.title + m.dueOn} className="today-soon-row" onClick={onOpenHome}>
        <span className="today-soon-icon" aria-hidden="true"><Clock size={17} /></span>
        <span className="today-soon-text"><strong>{m.title}</strong><small>{fmtDate(m.dueOn)}</small></span>
        <span className={'today-soon-pill' + (m.isOverdue ? ' today-soon-pill-overdue' : '')}>{m.isOverdue ? '!' : c.scheduled}</span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>)}
    </section>}
  </>;
}
