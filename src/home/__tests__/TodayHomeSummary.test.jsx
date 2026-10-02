import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TodayHomeSummary } from '../TodayHomeSummary.jsx';
import { homeStats } from '../homeStats.js';

const twin = vi.hoisted(() => ({}));
vi.mock('../usePropertyTwin.js', () => ({ usePropertyTwin: () => twin }));
vi.mock('../../lib/lang', () => ({ useLang: () => ({ langCode: 'en', fmtDate: (d) => `on ${d}` }) }));

afterEach(cleanup);
beforeEach(() => {
  Object.keys(twin).forEach((k) => delete twin[k]);
  Object.assign(twin, {
    properties: [{ id: 'p1', name: 'My Home' }],
    activePropertyId: 'p1',
    homeProfile: { property: { id: 'p1', name: 'My Home', municipality: 'Reet' }, documents: [{ id: 'd1' }, { id: 'd2' }] },
    items: [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }],
    maintenance: [
      { id: 'm1', title: 'Boiler service', dueOn: '2026-09-12', status: 'open', isOverdue: false },
      { id: 'm2', title: 'Smoke alarms', dueOn: '2026-08-01', status: 'open', isOverdue: true },
      { id: 'm3', title: 'Old job', dueOn: '2026-01-01', status: 'completed', isOverdue: false },
    ],
  });
});

describe('homeStats', () => {
  it('counts real data and reports null for anything still loading', () => {
    expect(homeStats({ items: null, homeProfile: null, maintenance: null, requests: [] })).toMatchObject({ items: null, docs: null, upcoming: null, pros: 0 });
    expect(homeStats({ items: [{}], homeProfile: { documents: [{}, {}] }, maintenance: [{ status: 'open' }, { status: 'completed' }], requests: [] }))
      .toMatchObject({ items: 1, docs: 2, upcoming: 1 });
  });
});

describe('TodayHomeSummary', () => {
  it('shows the property name, city and real counts, and opens My Home on tap', () => {
    const onOpenHome = vi.fn();
    render(<TodayHomeSummary requests={[]} onOpenHome={onOpenHome} />);
    expect(screen.getByText('Reet')).toBeTruthy();
    const stat = (label) => screen.getAllByText(label).find((el) => el.tagName === 'SMALL').previousSibling.textContent;
    expect(stat('Items')).toBe('3');
    expect(stat('Docs')).toBe('2');
    expect(stat('Upcoming')).toBe('2');
    fireEvent.click(document.querySelector('[data-tour="today-myhome"]'));
    expect(onOpenHome).toHaveBeenCalled();
  });
  it('lists open maintenance only, flagging overdue, never completed work', () => {
    render(<TodayHomeSummary requests={[]} onOpenHome={vi.fn()} />);
    expect(screen.getByText('Boiler service')).toBeTruthy();
    expect(screen.getByText('Scheduled')).toBeTruthy();
    expect(screen.getByText('Smoke alarms')).toBeTruthy();
    expect(screen.queryByText('Old job')).toBeNull();
  });
  it('shows dashes, not zeros, while data is still loading, and no upcoming list', () => {
    twin.items = null; twin.homeProfile = null; twin.maintenance = null;
    render(<TodayHomeSummary requests={[]} onOpenHome={vi.fn()} />);
    expect(screen.getAllByText('–').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('Scheduled')).toBeNull();
  });
});
