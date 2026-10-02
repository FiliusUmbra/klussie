// The four-number strip (items / documents / upcoming maintenance / trusted pros) shared
// by Today's property card and My Home's hero (visual-refresh direction, 2026-10-02).
// One component so the two screens can never disagree about what a number means.
// A dash — never a zero — while a source is still loading (ADR-0011).
import { useLang } from '../lib/lang';
import { TODAY_CARD } from '../lib/dailyStrings.js';
import { homeStats } from './homeStats.js';

export function HomeStatRow({ items, homeProfile, maintenance, requests }) {
  const { langCode } = useLang();
  const c = TODAY_CARD[langCode] || TODAY_CARD.en;
  const s = homeStats({ items, homeProfile, maintenance, requests });
  const stats = [
    { key: 'items', value: s.items, label: c.items },
    { key: 'docs', value: s.docs, label: c.docs },
    { key: 'upcoming', value: s.upcoming, label: c.upcoming },
    { key: 'pros', value: s.pros, label: c.pros },
  ];
  return <span className="home-stat-row">
    {stats.map((st) => <span key={st.key}><b>{st.value ?? '–'}</b><small>{st.label}</small></span>)}
  </span>;
}
