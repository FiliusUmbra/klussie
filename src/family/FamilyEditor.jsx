import { useId, useState } from 'react';
import { Modal } from '../design-system';
import { familyErrorKey, dateKey } from '../lib/familyModel.js';

function Field({ label, children }) { return <label className="family-field"><span>{label}</span>{children}</label>; }
const input = (value, set, key) => ({ value: value[key] ?? '', onChange: (e) => set({ ...value, [key]: e.target.value }) });
export function FamilyEditor({ editor, f, people, busy, onSave, onClose, displayName }) {
  const { type, record = {}, listId } = editor;
  const [values, setValues] = useState({ name: record.name || '', displayName: displayName || '', token: '',
    title: record.title || '', assigneeId: record.assignee_id || '', dueOn: record.due_on || '', repeatDays: record.repeat_days || 0,
    startsOn: record.starts_on || dateKey(), endsOn: record.ends_on || dateKey(), kind: record.kind || (type === 'person' ? 'child' : 'event'), notes: record.notes || '' });
  const [error, setError] = useState('');
  const [archiving, setArchiving] = useState(false);
  const headingId = useId();
  const titles = { create: f.create, join: f.join, list: f.addList, task: listId ? f.addItem : f.addChore, event: f.addEvent, person: f.addPerson, remove_person: f.remove, revoke_invite: f.revoke };
  const confirmOnly = ['remove_person','revoke_invite'].includes(type);
  const submit = async (e) => {
    e.preventDefault(); setError('');
    try {
      const payload = { ...values, ...(record.id ? { id: record.id, version: record.version } : {}), listId: record.list_id || listId || null, repeatDays: Number(values.repeatDays) };
      await onSave(archiving ? 'archive' : type, archiving ? { id: record.id, kind: type, version: record.version } : payload);
      onClose();
    } catch (err) { setError(f[familyErrorKey(err)]); }
  };
  return <Modal labelledBy={headingId} onClose={busy ? () => {} : onClose} closeLabel={f.close}>
    <form className="family-editor" onSubmit={submit}>
      <h2 id={headingId}>{archiving ? f.archive : record.id && !confirmOnly ? f.edit : titles[type]}</h2>
      {archiving || confirmOnly ? <p>{type === 'remove_person' ? f.removeHint : record.name || record.title || f.revoke}</p> : <>
        {['create','join'].includes(type) && <><p>{type === 'create' ? f.createHint : f.joinHint}</p><Field label={f.yourName}><input required maxLength={80} autoComplete="given-name" {...input(values,setValues,'displayName')} /></Field></>}
        {['create','list','person'].includes(type) && <Field label={type === 'create' ? f.familyName : type === 'list' ? f.listName : f.personName}><input required maxLength={type === 'list' ? 120 : 80} {...input(values,setValues,'name')} /></Field>}
        {type === 'join' && <Field label={f.code}><input required pattern="[a-f0-9]{64}" maxLength={64} autoComplete="off" {...input(values,setValues,'token')} onChange={(e) => setValues({ ...values, token: e.target.value.trim().toLowerCase() })} /></Field>}
        {type === 'task' && <>
          <Field label={f.taskTitle}><input required maxLength={240} {...input(values,setValues,'title')} /></Field>
          <Field label={f.assignee}><select {...input(values,setValues,'assigneeId')}><option value="">{f.anyone}</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field>
          <Field label={f.due}><input type="date" required={Number(values.repeatDays)>0} {...input(values,setValues,'dueOn')} /></Field>
          {!listId && !record.list_id && <Field label={f.repeat}><select {...input(values,setValues,'repeatDays')}>{[[0,'once'],[1,'daily'],[7,'weekly'],[14,'fortnightly'],[30,'monthly']].map(([days,key]) => <option key={days} value={days}>{f[key]}</option>)}</select></Field>}
        </>}
        {type === 'event' && <>
          <Field label={f.eventTitle}><input required maxLength={240} {...input(values,setValues,'title')} /></Field>
          <Field label={f.eventKind}><select {...input(values,setValues,'kind')}><option value="event">{f.event}</option><option value="holiday">{f.holiday}</option></select></Field>
          <div className="family-fields-row"><Field label={f.start}><input required type="date" {...input(values,setValues,'startsOn')} /></Field><Field label={f.end}><input required type="date" min={values.startsOn} {...input(values,setValues,'endsOn')} /></Field></div>
          <Field label={f.notes}><textarea rows={3} maxLength={2000} {...input(values,setValues,'notes')} /></Field>
        </>}
        {type === 'person' && <><p>{f.personHint}</p><Field label={f.people}><select {...input(values,setValues,'kind')}><option value="child">{f.child}</option><option value="adult">{f.adult}</option></select></Field></>}
      </>}
      {error && <p className="family-error" role="alert">{error}</p>}
      <div className="family-actions">
        <button className="btn-primary" disabled={busy} type="submit">{archiving || confirmOnly ? f.confirm : f.save}</button>
        <button className="btn-secondary" disabled={busy} type="button" onClick={onClose}>{f.cancel}</button>
      </div>
      {record.id && !confirmOnly && !archiving && <button type="button" className="family-text-button" disabled={busy} onClick={() => setArchiving(true)}>{f.archive}</button>}
    </form>
  </Modal>;
}
