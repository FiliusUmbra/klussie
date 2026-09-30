import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AddButton, Empty, TaskRows, EventRows } from './FamilyParts.jsx';
import { dateKey, monthDays, shiftMonth, eventsOn } from '../lib/familyModel.js';
export function ListsAndChores({ mode, data, f, fmtDate, busy, onComplete, onEdit, selectedList, setSelectedList }) {
  const [filter,setFilter] = useState('all');
  const list = data.lists.find((l) => l.id===selectedList) || data.lists[0];
  const mine = data.people.find((p) => p.isMe)?.id;
  const tasks = data.tasks.filter((task) => (mode==='lists' ? task.list_id===list?.id : !task.list_id) && (filter!=='mine' || task.assignee_id===mine));
  const open = tasks.filter((task) => !task.completed_at); const done = tasks.filter((task) => task.completed_at);
  return <section className="family-card">
    <div className="family-section-heading"><h2>{mode==='lists' ? f.lists : f.chores}</h2><AddButton onClick={() => onEdit({type:mode==='lists' ? 'list' : 'task'})}>{mode==='lists' ? f.addList : f.addChore}</AddButton></div>
    {mode==='lists' && <div className="family-list-tabs">{data.lists.map((l) => <button type="button" key={l.id} aria-pressed={l.id===list?.id} onClick={() => setSelectedList(l.id)}>{l.name}</button>)}</div>}
    {(mode!=='lists' || list) && <>
      {mode==='lists' && <div className="family-section-heading"><h3>{list.name}</h3><div className="family-actions"><button type="button" className="family-text-button" onClick={() => onEdit({type:'list',record:list})}>{f.edit}</button><AddButton onClick={() => onEdit({type:'task',listId:list.id})}>{f.addItem}</AddButton></div></div>}
      <div className="family-filters">{['all','mine'].map((key) => <button type="button" key={key} aria-pressed={key===filter} onClick={() => setFilter(key)}>{f[key]}</button>)}</div>
      {open.length ? <TaskRows tasks={open} people={data.people} f={f} fmtDate={fmtDate} busy={busy} onComplete={onComplete} onEdit={onEdit} /> : <Empty>{filter==='mine' ? f.noMatches : mode==='lists' ? f.emptyTasks : f.emptyChores}</Empty>}
      {done.length>0 && <details className="family-completed"><summary>{f.completed} · {done.length}</summary><TaskRows tasks={done} people={data.people} f={f} fmtDate={fmtDate} busy={busy} onComplete={onComplete} onEdit={onEdit} /></details>}
    </>}
    {mode==='lists' && !list && <Empty>{f.emptyLists}</Empty>}
  </section>;
}
export function FamilyCalendar({ data, f, fmtDate, locale, onEdit }) {
  const [month,setMonth] = useState(dateKey().slice(0,7));
  const [day,setDay] = useState(null);
  const days = monthDays(month);
  const visible = day ? eventsOn(data.events,day) : data.events.filter((event) => event.starts_on<=`${month}-31` && event.ends_on>=`${month}-01`);
  const weekdays = Array.from({length:7},(_,i) => new Intl.DateTimeFormat(locale,{weekday:'short'}).format(new Date(2026,8,28+i)));
  return <section className="family-card">
    <div className="family-section-heading"><div><h2>{f.calendar}</h2><p className="family-meta">{f.allDay}</p></div><AddButton onClick={() => onEdit({type:'event',record: day ? { starts_on:day,ends_on:day } : {}})}>{f.addEvent}</AddButton></div>
    <div className="family-month-heading"><button type="button" className="family-icon-button" aria-label={f.previous} onClick={() => {setMonth(shiftMonth(month,-1));setDay(null);}}><ChevronLeft /></button><h3>{new Intl.DateTimeFormat(locale,{month:'long',year:'numeric',calendar:'gregory'}).format(new Date(`${month}-01T12:00:00`))}</h3><button type="button" className="family-icon-button" aria-label={f.next} onClick={() => {setMonth(shiftMonth(month,1));setDay(null);}}><ChevronRight /></button></div>
    <div className="family-calendar" role="group" aria-label={f.calendar}>
      {weekdays.map((label,i) => <span className="family-weekday" key={i}>{label}</span>)}
      {days.map((d) => {const count=eventsOn(data.events,d.date).length;return <button type="button" key={d.date} className={`${d.current?'':'outside-month'} ${d.date===dateKey()?'is-today':''}`} aria-pressed={day===d.date} aria-label={`${fmtDate(d.date)}${count ? ` · ${count} ${f.calendar}`:''}`} onClick={() => setDay(day===d.date ? null : d.date)}><span>{d.day}</span>{count>0 && <span className="family-calendar-dot" aria-hidden="true" />}</button>;})}
    </div>
    <div className="family-section-heading"><h3>{day ? fmtDate(day) : f.all}</h3>{day && <button type="button" className="family-text-button" onClick={() => setDay(null)}>{f.all}</button>}</div>
    {visible.length ? <EventRows events={visible} f={f} fmtDate={fmtDate} onEdit={onEdit} /> : <Empty>{f.emptyEvents}</Empty>}
  </section>;
}
export function FamilyPeople({ data, f, fmtDate, busy, onEdit, onInvite, inviteToken }) {
  return <section className="family-card"><div className="family-section-heading"><h2>{f.people}</h2>{data.canManage && <AddButton onClick={() => onEdit({type:'person'})}>{f.addPerson}</AddButton>}</div>
    <ul className="family-people">{data.people.map((person) => <li key={person.id}><span className="family-avatar" aria-hidden="true">{person.name.slice(0,1)}</span><div><strong>{person.name}</strong><div className="family-meta">{person.kind==='child' ? f.child : person.role==='owner' ? f.owner : f.adult}{!person.hasLogin && ` · ${f.noLogin}`}</div></div>{data.canManage && person.role!=='owner' && <button className="family-text-button" type="button" disabled={busy} onClick={() => onEdit({type:'remove_person',record:person})}>{f.remove}</button>}</li>)}</ul>
    {data.canManage && <div className="family-invite"><h3>{f.invite}</h3><p>{f.inviteHint}</p><button className="btn-secondary" type="button" disabled={busy} onClick={onInvite}>{f.invite}</button>
      {inviteToken && <label className="family-field"><span>{f.inviteCode}</span><textarea readOnly rows={3} value={inviteToken} onFocus={(e) => e.target.select()} /></label>}
      {data.invitations.length>0 && <><h3>{f.pendingInvites}</h3>{data.invitations.map((inv) => <div className="family-section-heading" key={inv.id}><span>{f.expires} {fmtDate(inv.expires_at)}</span><button type="button" className="family-text-button" disabled={busy} onClick={() => onEdit({type:'revoke_invite',record:inv})}>{f.revoke}</button></div>)}</>}
    </div>}
    <p className="family-privacy">{f.privacy}</p>
  </section>;
}
