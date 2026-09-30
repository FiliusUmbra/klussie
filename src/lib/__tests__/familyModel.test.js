import { describe, it, expect } from 'vitest';
import { dateKey, monthDays, shiftMonth, eventsOn, todayTasks, familyErrorKey } from '../familyModel.js';
import { FAMILY_STRINGS, familyStrings } from '../familyStrings.js';
describe('Family calendar rules', () => {
  it('keeps local dates and supports leap days and year boundaries', () => {
    expect(dateKey(new Date(2028,1,29,23,59))).toBe('2028-02-29');
    expect(shiftMonth('2026-12',1)).toBe('2027-01');
    expect(shiftMonth('2027-01',-1)).toBe('2026-12');
    const days=monthDays('2028-02');
    expect(days).toHaveLength(42);
    expect(days.filter((d) => d.current)).toHaveLength(29);
    expect(new Date(`${days[0].date}T12:00:00`).getDay()).toBe(1);
  });
  it('includes every holiday day across month/year boundaries', () => {
    const holiday={starts_on:'2026-12-28',ends_on:'2027-01-04'};
    expect(eventsOn([holiday],'2027-01-01')).toEqual([holiday]);
    expect(eventsOn([holiday],'2027-01-04')).toEqual([holiday]);
    expect(eventsOn([holiday],'2027-01-05')).toEqual([]);
  });
  it('shows overdue and due tasks without claiming undated tasks are due', () => {
    const tasks=[{id:1,due_on:'2026-09-28'},{id:2,due_on:'2026-09-29'},{id:3,due_on:null},{id:4,due_on:'2026-09-30'},{id:5,due_on:'2026-09-28',completed_at:'done'}];
    expect(todayTasks(tasks,'2026-09-29').map((t) => t.id)).toEqual([1,2]);
  });
  it('maps conflicts and invalid invitations without exposing raw errors', () => {
    expect(familyErrorKey(new Error('family_conflict'))).toBe('conflict');
    expect(familyErrorKey(new Error('family_invalid_invite'))).toBe('invalidInvite');
    expect(familyErrorKey(new Error('sensitive database detail'))).toBe('saveFailed');
  });
  it('keeps Dutch and English copy complete with an explicit fallback', () => {
    expect(Object.keys(FAMILY_STRINGS.nl).sort()).toEqual(Object.keys(FAMILY_STRINGS.en).sort());
    expect(familyStrings('unknown')).toBe(FAMILY_STRINGS.en);
  });
});
