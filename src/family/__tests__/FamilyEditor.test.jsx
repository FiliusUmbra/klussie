import { describe,it,expect,vi } from 'vitest';
import { render,screen,fireEvent,waitFor } from '@testing-library/react';
import { FamilyEditor } from '../FamilyEditor.jsx';
import { FamilyCalendar, FamilyPeople } from '../FamilyPanels.jsx';
import { familyStrings } from '../../lib/familyStrings.js';
const f=familyStrings('en');
const data={events:[],people:[],tasks:[],lists:[],invitations:[],canManage:false};
describe('Family forms',() => {
 it('retains a failed draft and shows a safe error',async () => {
  const onSave=vi.fn().mockRejectedValue(new Error('raw database error'));const onClose=vi.fn();
  render(<FamilyEditor editor={{type:'task'}} f={f} people={[]} onSave={onSave} onClose={onClose} />);
  fireEvent.change(screen.getByLabelText(f.taskTitle),{target:{value:'Water the plants'}});
  fireEvent.change(screen.getByLabelText(f.repeat),{target:{value:'7'}});
  expect(screen.getByLabelText(f.due).required).toBe(true);
  fireEvent.change(screen.getByLabelText(f.due),{target:{value:'2026-10-01'}});
  fireEvent.submit(screen.getByText(f.save).closest('form'));
  expect((await screen.findByRole('alert')).textContent).toBe(f.saveFailed);
  expect(screen.getByLabelText(f.taskTitle).value).toBe('Water the plants');
  expect(onClose).not.toHaveBeenCalled();
  expect(onSave).toHaveBeenCalledWith('task',expect.objectContaining({repeatDays:7,dueOn:'2026-10-01'}));
 });
 it('retains dates when editing a multi-day holiday and sends its version',async () => {
  const onSave=vi.fn().mockResolvedValue({}); const onClose=vi.fn();
  render(<FamilyEditor editor={{type:'event',record:{id:'event',title:'Winter break',starts_on:'2026-12-28',ends_on:'2027-01-04',kind:'holiday',version:3}}} f={f} people={[]} onSave={onSave} onClose={onClose} />);
  fireEvent.submit(screen.getByText(f.save).closest('form'));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(onSave).toHaveBeenCalledWith('event',expect.objectContaining({id:'event',startsOn:'2026-12-28',endsOn:'2027-01-04',version:3}));
 });
 it('does not show member-management actions to ordinary members',() => {
  render(<FamilyPeople data={data} f={f} fmtDate={(d) => d} onEdit={vi.fn()} onInvite={vi.fn()} />);
  expect(screen.queryByRole('button',{name:f.invite})).toBeNull();
  expect(screen.queryByRole('button',{name:f.addPerson})).toBeNull();
 });
 it('opens the selected calendar day as an all-day plan draft',() => {
  const onEdit=vi.fn();render(<FamilyCalendar data={data} f={f} fmtDate={(d) => d} locale="en-GB" onEdit={onEdit} />);
  const days=screen.getAllByRole('button',{name:/^\d{4}-\d{2}-\d{2}$/});
  const date=days[10].getAttribute('aria-label');fireEvent.click(days[10]);fireEvent.click(screen.getByRole('button',{name:f.addEvent}));
  expect(onEdit).toHaveBeenCalledWith({type:'event',record:{starts_on:date,ends_on:date}});
 });
});
