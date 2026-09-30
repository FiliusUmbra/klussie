import { CalendarDays, ChevronRight, HandHelping, Heart, House } from 'lucide-react';
import { useLang } from '../lib/lang';
import { useFamily } from '../family/useFamily.js';
import { familyStrings } from '../lib/familyStrings.js';
import { dateKey, todayTasks, eventsOn } from '../lib/familyModel.js';
import { statusPresentation } from '../lib/requestStatus.js';
import { unreadTotal } from '../lib/conversationSelectors.js';

import { TODAY_LABELS, DAILY_CLEAR } from '../lib/dailyStrings.js';

// A read-only daily summary. Editing stays in each feature's existing flow.
export function DailyHome({ requests, conversations, onHelp, onHome, onFamily, onRequest, onMessages, onRequests }) {
  const { t, langCode, fmtDate, serviceInfo } = useLang();
  const f = familyStrings(langCode);
  const family = useFamily();
  const today = dateKey();
  const tasks = todayTasks(family.data?.tasks || [], today).sort((a,b) => a.due_on.localeCompare(b.due_on));
  const events = eventsOn(family.data?.events || [], today);
  const attention = requests.filter((r) => ['quotes_ready','accepted_pending_location_approval','completed'].includes(r.status));
  const unread = unreadTotal(conversations);
  return <main className="daily-home">
    <header className="daily-heading"><div><p>{fmtDate(today)}</p><h1>{TODAY_LABELS[langCode] || TODAY_LABELS.en}</h1></div><button type="button" className="btn-secondary" onClick={onHelp}><HandHelping size={18} aria-hidden="true" />{t.navDiscover}</button></header>
    <div className="daily-shortcuts">
      <button type="button" onClick={onHome}><House size={18} aria-hidden="true" />{t.navMyHome}<ChevronRight size={16} aria-hidden="true" /></button>
      <button type="button" onClick={() => onFamily(family.selected)}><Heart size={18} aria-hidden="true" />{f.title}<ChevronRight size={16} aria-hidden="true" /></button>
    </div>
    <section className="daily-section"><div className="daily-section-title"><h2>{t.homeForYouTitle}</h2><button type="button" onClick={onRequests}>{t.navRequests}</button></div>
      {!attention.length && !unread && <p className="daily-empty">{DAILY_CLEAR[langCode] || DAILY_CLEAR.en}</p>}
      {attention.slice(0,3).map((request) => <button className="daily-row" type="button" key={request.id} onClick={() => onRequest(request.id)}><span><strong>{serviceInfo(request.serviceId).name}</strong><small>{t[statusPresentation(request.status).labelKey]}</small></span><ChevronRight size={18} aria-hidden="true" /></button>)}
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
