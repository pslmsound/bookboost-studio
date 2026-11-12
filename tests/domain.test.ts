import { describe, expect, it } from 'vitest';
import {
  addDays, bucketSeries, budgetStatus, campaignProgress, canPitch, diffDays, metricSeries, monthGrid, nextActions,
  parseMoneyToCents, pendingApprovals, pipelineCounts, relativeDay, safeFileName, summarizeMetrics, wordCount,
} from '../src/shared/domain';
import type { CalendarItem, Campaign, Contact, Draft, Metric, Task } from '../src/shared/schema';

const stamp = { createdAt: '', updatedAt: '' };
const task = (o: Partial<Task>): Task => ({ id: 't', bookId: 'b', campaignId: 'c1', title: 'Task', dueDate: '', done: false, isMilestone: false, sortOrder: 0, ...stamp, ...o });
const campaign = (o: Partial<Campaign>): Campaign => ({ id: 'c1', bookId: 'b', name: 'Launch', objective: '', audience: '', channels: [], startDate: '', endDate: '', budgetCents: 0, spentCents: 0, status: 'active', notes: '', ...stamp, ...o });
const contact = (o: Partial<Contact>): Contact => ({ id: 'k', bookId: 'b', name: 'Ana', outlet: '', type: 'reviewer', email: '', url: '', status: 'pitched', consent: 'opted_in', lastContacted: '', nextFollowUp: '', notes: '', ...stamp, ...o });
const item = (o: Partial<CalendarItem>): CalendarItem => ({ id: 'i', bookId: 'b', campaignId: '', draftId: '', title: 'Post', channel: '', scheduledDate: '2026-03-10', scheduledTime: '', status: 'draft', notes: '', ...stamp, ...o });
const draft = (o: Partial<Draft>): Draft => ({ id: 'd', bookId: 'b', kind: 'social_caption', title: 'Caption', subject: '', preheader: '', body: '', status: 'draft', source: 'manual', aiProvider: '', aiModel: '', campaignId: '', contactId: '', ...stamp, ...o });
const metric = (o: Partial<Metric>): Metric => ({ id: 'm', bookId: 'b', date: '2026-03-01', metric: 'units_sold', value: 1, channel: '', source: 'user_entered', origin: 'manual', note: '', ...stamp, ...o });

describe('dates', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });
  it('measures whole day differences', () => {
    expect(diffDays('2026-03-10', '2026-03-01')).toBe(9);
    expect(diffDays('2026-03-01', '2026-03-10')).toBe(-9);
  });
  it('describes days relative to today', () => {
    expect(relativeDay('2026-03-10', '2026-03-10')).toBe('Today');
    expect(relativeDay('2026-03-11', '2026-03-10')).toBe('Tomorrow');
    expect(relativeDay('2026-03-07', '2026-03-10')).toBe('3 days overdue');
    expect(relativeDay('2026-03-14', '2026-03-10')).toBe('In 4 days');
  });
  it('builds a six week grid that starts on Sunday and contains the whole month', () => {
    const grid = monthGrid(2026, 1); // February 2026 starts on a Sunday
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({ date: '2026-02-01', inMonth: true });
    expect(grid.filter((c) => c.inMonth)).toHaveLength(28);
    const march = monthGrid(2026, 2);
    expect(march.filter((c) => c.inMonth)).toHaveLength(31);
    expect(march[0].date <= '2026-03-01').toBe(true);
  });
});

describe('money', () => {
  it('parses typed amounts to cents', () => {
    expect(parseMoneyToCents('250')).toBe(25000);
    expect(parseMoneyToCents('$1,250.50')).toBe(125050);
    expect(parseMoneyToCents('19.99')).toBe(1999);
  });
  it('rejects values that are not amounts', () => {
    expect(parseMoneyToCents('')).toBeNull();
    expect(parseMoneyToCents('abc')).toBeNull();
    expect(parseMoneyToCents('1.2.3')).toBeNull();
  });
});

describe('campaigns', () => {
  it('calculates progress, including the empty case', () => {
    expect(campaignProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
    expect(campaignProgress([{ done: true }, { done: false }, { done: true }])).toEqual({ done: 2, total: 3, percent: 67 });
  });
  it('reports budget status', () => {
    expect(budgetStatus({ budgetCents: 10000, spentCents: 2500 })).toEqual({ remaining: 7500, percent: 25, over: false });
    expect(budgetStatus({ budgetCents: 10000, spentCents: 12000 })).toMatchObject({ remaining: -2000, percent: 100, over: true });
    expect(budgetStatus({ budgetCents: 0, spentCents: 500 })).toMatchObject({ percent: 0, over: false });
  });
});

describe('next actions', () => {
  const today = '2026-03-10';
  it('puts overdue items first, then orders by date', () => {
    const actions = nextActions(
      {
        campaigns: [campaign({})],
        tasks: [task({ id: 'a', title: 'Later', dueDate: '2026-03-15' }), task({ id: 'b', title: 'Overdue', dueDate: '2026-03-05' }), task({ id: 'c', title: 'Done', dueDate: '2026-03-01', done: true })],
        contacts: [contact({ nextFollowUp: '2026-03-12' })],
        calendar: [item({ id: 'x', scheduledDate: '2026-03-11' })],
        drafts: [draft({ status: 'in_review' })],
      },
      today,
    );
    expect(actions.map((a) => a.title)).toEqual(['Overdue', 'Approve: Post', 'Follow up with Ana', 'Later', 'Review: Caption']);
    expect(actions[0].overdue).toBe(true);
  });
  it('never suggests following up with a do not contact record', () => {
    const actions = nextActions({ campaigns: [], tasks: [], calendar: [], drafts: [], contacts: [contact({ nextFollowUp: '2026-03-11', consent: 'do_not_contact' })] }, today);
    expect(actions).toHaveLength(0);
  });
  it('ignores tasks in completed campaigns and items beyond two weeks', () => {
    const actions = nextActions(
      { campaigns: [campaign({ status: 'completed' })], tasks: [task({ dueDate: '2026-03-11' })], contacts: [], drafts: [], calendar: [item({ scheduledDate: '2026-05-01' })] },
      today,
    );
    expect(actions).toHaveLength(0);
  });
  it('asks to post approved items and counts pending approvals', () => {
    const actions = nextActions({ campaigns: [], tasks: [], contacts: [], drafts: [], calendar: [item({ status: 'approved', scheduledDate: '2026-03-10' })] }, today);
    expect(actions[0].title).toBe('Post: Post');
    expect(pendingApprovals([draft({ status: 'in_review' }), draft({})], [item({}), item({ status: 'posted' })])).toBe(2);
  });
});

describe('outreach', () => {
  it('counts contacts per stage', () => {
    const counts = pipelineCounts([{ status: 'pitched' }, { status: 'pitched' }, { status: 'booked' }]);
    expect(counts.pitched).toBe(2);
    expect(counts.booked).toBe(1);
    expect(counts.prospect).toBe(0);
  });
  it('allows pitching only with recorded consent', () => {
    expect(canPitch({ consent: 'opted_in' })).toBe(true);
    expect(canPitch({ consent: 'public_contact' })).toBe(true);
    expect(canPitch({ consent: 'unknown' })).toBe(false);
    expect(canPitch({ consent: 'do_not_contact' })).toBe(false);
  });
});

describe('analytics', () => {
  const data = [
    metric({ date: '2026-03-01', value: 5, source: 'verified' }),
    metric({ date: '2026-03-03', value: 3, source: 'estimate' }),
    metric({ date: '2026-03-03', value: 2 }),
    metric({ date: '2026-02-01', value: 100 }),
    metric({ date: '2026-03-02', metric: 'revenue', value: 49.5, source: 'verified' }),
  ];
  it('totals by metric within a range and keeps sources separate', () => {
    const totals = summarizeMetrics(data, '2026-03-01', '2026-03-31');
    expect(totals.units_sold).toMatchObject({ total: 10, verified: 5, estimate: 3, userEntered: 2, entries: 3 });
    expect(totals.revenue.total).toBe(49.5);
    expect(totals.reviews.entries).toBe(0);
  });
  it('builds a zero filled daily series', () => {
    expect(metricSeries(data, 'units_sold', '2026-03-01', '2026-03-04')).toEqual([
      { date: '2026-03-01', value: 5 },
      { date: '2026-03-02', value: 0 },
      { date: '2026-03-03', value: 5 },
      { date: '2026-03-04', value: 0 },
    ]);
  });
  it('buckets long series without losing the total', () => {
    const long = Array.from({ length: 200 }, (_, i) => ({ date: addDays('2026-01-01', i), value: 1 }));
    const bucketed = bucketSeries(long, 45);
    expect(bucketed.length).toBeLessThanOrEqual(45);
    expect(bucketed.reduce((s, p) => s + p.value, 0)).toBe(200);
  });
});

describe('misc', () => {
  it('counts words', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('  one two\nthree ')).toBe(3);
  });
  it('makes file names safe for Windows', () => {
    expect(safeFileName('Launch: "Day One" / Plan?')).toBe('Launch Day One Plan');
    expect(safeFileName('...')).toBe('export');
    expect(safeFileName('name.')).toBe('name');
  });
});
