import { Check, RotateCcw, Pencil, Repeat2, Plus, ListChecks, CalendarDays } from 'lucide-react';
import { dateKey, eventsOn, todayTasks } from '../lib/familyModel.js';
export function Empty({ children }) { return <p className="family-empty">{children}</p>; }
export function AddButton({ children, onClick }) { return <button type="button" className="btn-secondary family-add" onClick={onClick}><Plus size={16} aria-hidden="true" />{children}</button>; }
export function TaskRows({ tasks, people, f, fmtDate, busy, onComplete, onEdit }) {
  return <ul className="family-task-list">{tasks.map((task) => <li key={task.id} className={task.completed_at ? 'family-task is-done' : 'family-task'}>
    <button type="button" className="family-check" disabled={busy} onClick={() => onComplete(task)} aria-label={`${task.completed_at ? f.reopen : f.done}: ${task.title}`}>
      {task.completed_at ? <RotateCcw size={18} /> : <Check size={18} />}
    </button>
    <div className="family-task-body"><strong>{task.title}</strong><div className="family-meta">
      {task.assignee_id && <span>{people.find((p) => p.id === task.assignee_id)?.name || f.anyone}</span>}
      {task.due_on && <span className={!task.completed_at && task.due_on < dateKey() ? 'family-overdue' : ''}>{!task.completed_at && task.due_on < dateKey() && `${f.overdue} · `}{fmtDate(task.due_on)}</span>}
      {task.repeat_days>0 && <span><Repeat2 size={12} aria-hidden="true" /> {f[{1:'daily',7:'weekly',14:'fortnightly',30:'monthly'}[task.repeat_days]]}</span>}
    </div></div>
    <button type="button" className="family-icon-button" onClick={() => onEdit({ type:'task', record:task })} aria-label={`${f.edit}: ${task.title}`}><Pencil size={16} /></button>
  </li>)}</ul>;
}
export function EventRows({ events, f, fmtDate, onEdit }) {
  return <ul className="family-event-list">{events.map((event) => <li key={event.id}><button type="button" className={`family-event ${event.kind}`} onClick={() => onEdit({ type:'event', record:event })}>
    <span className="family-event-symbol"><CalendarDays size={20} /></span><span><strong>{event.title}</strong><span className="family-meta">{fmtDate(event.starts_on)}{event.ends_on !== event.starts_on && ` — ${fmtDate(event.ends_on)}`} · {event.kind === 'holiday' ? f.holiday : f.event}</span>{event.notes && <span className="family-event-notes">{event.notes}</span>}</span>
  </button></li>)}</ul>;
}
export function Today({ data, f, fmtDate, onEdit, busy, onComplete, onTab }) {
  const today = dateKey(); const tasks = todayTasks(data.tasks,today);
  const events = eventsOn(data.events,today);
  const upcoming = data.events.filter((event) => event.starts_on>today).slice(0,3);
  return <>
    <section className="family-day-banner"><div><span className="family-eyebrow">{fmtDate(today)}</span><h2>{f.today}</h2><p>{f.todayHint}</p></div><ListChecks size={44} aria-hidden="true" /></section>
    <div className="family-columns"><section className="family-card"><div className="family-section-heading"><h2>{f.chores}</h2><AddButton onClick={() => onEdit({type:'task'})}>{f.addChore}</AddButton></div>
      {tasks.length ? <TaskRows tasks={tasks} people={data.people} f={f} fmtDate={fmtDate} busy={busy} onComplete={onComplete} onEdit={onEdit} /> : <Empty>{f.todayEmpty}</Empty>}
    </section><section className="family-card"><div className="family-section-heading"><h2>{f.calendar}</h2><AddButton onClick={() => onEdit({type:'event'})}>{f.addEvent}</AddButton></div>
      {[...events,...upcoming].length ? <EventRows events={[...events,...upcoming]} f={f} fmtDate={fmtDate} onEdit={onEdit} /> : <Empty>{f.emptyEvents}</Empty>}
    </section></div>
    <section className="family-card"><div className="family-section-heading"><h2>{f.lists}</h2><button type="button" className="family-text-button" onClick={() => onTab('lists')}>{f.all}</button></div>
      <div className="family-list-previews">{data.lists.map((list) => <button type="button" key={list.id} onClick={() => onTab('lists',list.id)}><ListChecks size={18} aria-hidden="true" /><strong>{list.name}</strong><span>{data.tasks.filter((task) => task.list_id===list.id && !task.completed_at).length}</span></button>)}</div>
      {!data.lists.length && <Empty>{f.emptyLists}</Empty>}
    </section>
  </>;
}
