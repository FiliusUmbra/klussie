import { describe, it, expect } from 'vitest';
import { customerPath, customerDestination } from '../customerNavigation.js';
describe('customer destinations', () => {
  it.each(['today','discover','myHome','requests','messages','profile'])('round trips %s through its address', (tab) => {
    expect(customerDestination(customerPath(tab)).tab).toBe(tab);
  });
  it('keeps Items selected after reloading its address', () => {
    expect(customerDestination(customerPath('myHome','myItems'))).toEqual({tab:'myHome',section:'myItems'});
  });
  it('falls back to Today for an unknown destination', () => {
    expect(customerDestination('/app/unknown').tab).toBe('today');
  });
});
