import { CalendarDays, ChevronRight, Heart, HelpCircle, Search } from 'lucide-react';
import { useLang } from '../lib/lang';
import { useAuth } from '../lib/auth.jsx';
import { useFamily } from '../family/useFamily.js';
import { familyStrings } from '../lib/familyStrings.js';
import { dateKey, todayTasks, eventsOn } from '../lib/familyModel.js';
import { statusPresentation } from '../lib/requestStatus.js';
import { unreadTotal } from '../lib/conversationSelectors.js';
import { PageTour } from '../ui/PageTour.jsx';
import { usePageTour } from '../ui/usePageTour.js';
import { HomeCategoryTiles } from './HomeCategoryTiles.jsx';
import { TodayHomeSummary } from './TodayHomeSummary.jsx';
import { greetingLine } from './useHomeContext.js';

import { DAILY_CLEAR } from '../lib/dailyStrings.js';
import { requestTitle } from '../lib/requestTitle.js';

// Today's own PageTour.jsx steps — the three real shortcuts this screen is built
// around (Help, My Home, Family), each anchored to its own data-tour attribute below.
const TODAY_TOUR_STEPS = [
  { id: 'today-help', titleKey: 'pageTourTodayStep1Title', bodyKey: 'pageTourTodayStep1Body' },
  { id: 'today-myhome', titleKey: 'pageTourTodayStep2Title', bodyKey: 'pageTourTodayStep2Body' },
  { id: 'today-family', titleKey: 'pageTourTodayStep3Title', bodyKey: 'pageTourTodayStep3Body' },
];

// A read-only daily summary. Editing stays in each feature's existing flow.
export function DailyHome({ requests, conversations, onHelp, onHome, onFamily, onRequest, onMessages, onRequests, onSelectCategory }) {
  const { t, langCode, fmtDate, serviceInfo, CATS, catName } = useLang();
  const f = familyStrings(langCode);
  const { profile } = useAuth();
  const family = useFamily();
  const tour = usePageTour('today');
  const today = dateKey();
  const tasks = todayTasks(family.data?.tasks || [], today).sort((a,b) => a.due_on.localeCompare(b.due_on));
  const events = eventsOn(family.data?.events || [], today);
  const attention = requests.filter((r) => ['quotes_ready','accepted_pending_location_approval','completed'].includes(r.status));
  const unread = unreadTotal(conversations);
  return <main className="daily-home">
    <header className="daily-heading">
      <div><h1>{greetingLine(t, profile?.full_name)}</h1><p>{fmtDate(today)}</p></div>
      <button type="button" className="icon-btn" aria-label={t.helpReplayTour} onClick={tour.replay}><HelpCircle size={18} aria-hidden="true" /></button>
    </header>
    <button type="button" className="daily-search" data-tour="today-help" onClick={onHelp}><Search size={18} aria-hidden="true" /><span>{t.homeQuestion}</span></button>
    {tour.open && <PageTour steps={TODAY_TOUR_STEPS} onFinish={tour.finish} />}
    {onSelectCategory && <HomeCategoryTiles t={t} CATS={CATS} catName={catName} onSelectCategory={onSelectCategory} />}
    <TodayHomeSummary requests={requests} onOpenHome={onHome} />
    <div className="daily-shortcuts">
      <button type="button" data-tour="today-family" onClick={() => onFamily(family.selected)}><Heart size={18} aria-hidden="true" />{f.title}<ChevronRight size={16} aria-hidden="true" /></button>
    </div>
    <section className="daily-section"><div className="daily-section-title"><h2>{t.homeForYouTitle}</h2><button type="button" onClick={onRequests}>{t.navRequests}</button></div>
      {!attention.length && !unread && <p className="daily-empty">{DAILY_CLEAR[langCode] || DAILY_CLEAR.en}</p>}
      {attention.slice(0,3).map((request) => <button className="daily-row" type="button" key={request.id} onClick={() => onRequest(request.id)}><span><strong>{requestTitle(request, serviceInfo, t.navRequests)}</strong><small>{t[statusPresentation(request.status).labelKey]}</small></span><ChevronRight size={18} aria-hidden="true" /></button>)}
      {unread>0 && <button type="button" className="daily-row" onClick={onMessages}><span>{t.navMessages}</span><span className="daily-count">{unread}</span><ChevronRight size={18} aria-hidden="true" /></button>}
    </section>
    <section className="daily-section"><div className="daily-section-title"><h2>{f.title}</h2>{family.groups.length>1 && <select aria-label={f.familyName} value={family.selected || ''} onChange={(e) => family.setSelected(e.target.value)}>{family.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>}{family.groups.length===1 && <span>{family.groups[0].name}</span>}</div>
      {family.error && <p role="alert">{f.loadFailed} <button type="button" onClick={family.refresh}>{f.retry}</button></p>}
      {(!family.ready || (family.selected && !family.data)) && !family.error && <p role="status">{f.loading}</p>}
      {family.ready && !family.groups.length && !family.error && <button className="daily-row" type="button" onClick={() => onFamily(family.selected)}><span>{f.welcome}</span><ChevronRight size={18} aria-hidden="true" /></button>}
      {family.data && <>
        {!family.error && !tasks.length && !events.length && <p className="daily-empty">{f.todayEmpty}</p>}
        {events.slice(0,3).map((event) => <button className="daily-row" type="button" key={event.id} onClick={() => onFamily(family.selected)}><CalendarDays size={18} aria-hidden="true" /><span><strong>{event.title}</strong><small>{fmtDate(event.starts_on)} — {fmtDate(event.ends_on)}</small></span><ChevronRight size={18} aria-hidden="true" /></button>)}
        {tasks.slice(0,4).map((task) => <button className="daily-row" type="button" key={task.id} onClick={() => onFamily(family.selected)}><span><strong>{task.title}</strong><small>{task.due_on<today?`${f.overdue} · `:''}{fmtDate(task.due_on)}{task.assignee_id && ` · ${family.data.people.find((p) => p.id===task.assignee_id)?.name || f.anyone}`}</small></span><ChevronRight size={18} aria-hidden="true" /></button>)}
        <button className="daily-more" type="button" onClick={() => onFamily(family.selected)}>{f.all} · {f.title}<ChevronRight size={16} aria-hidden="true" /></button>
      </>}
    </section>
  </main>;
}
