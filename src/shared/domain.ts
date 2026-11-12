// Pure domain logic. No Electron, no database, no DOM. Covered by unit tests.
import type { CalendarItem, Campaign, Contact, Draft, Metric, MetricType, Task } from './schema';
import { CONTACT_STATUS, METRIC_TYPES } from './schema';

// ---------- Dates ----------
const pad = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}
export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86_400_000);
}
export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  if (!iso) return '';
  return parseISO(iso).toLocaleDateString(undefined, opts);
}
export function relativeDay(iso: string, today = todayISO()): string {
  if (!iso) return '';
  const diff = diffDays(iso, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0) return `${Math.abs(diff)} days overdue`;
  if (diff < 7) return `In ${diff} days`;
  return formatDate(iso);
}

/** A 6 row month grid starting on Sunday. Each cell is an ISO date. */
export function monthGrid(year: number, monthIndex: number): { date: string; inMonth: boolean }[] {
  const first = new Date(year, monthIndex, 1);
  const start = new Date(year, monthIndex, 1 - first.getDay());
  const cells: { date: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ date: toISO(d), inMonth: d.getMonth() === monthIndex });
  }
  return cells;
}

// ---------- Money ----------
export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned.split('.').length > 2) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
export function formatNumber(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
}

// ---------- Campaigns ----------
export interface Progress {
  done: number;
  total: number;
  percent: number;
}
export function campaignProgress(tasks: Pick<Task, 'done'>[]): Progress {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export function budgetStatus(c: Pick<Campaign, 'budgetCents' | 'spentCents'>) {
  const remaining = c.budgetCents - c.spentCents;
  const percent = c.budgetCents === 0 ? 0 : Math.min(100, Math.round((c.spentCents / c.budgetCents) * 100));
  return { remaining, percent, over: c.budgetCents > 0 && c.spentCents > c.budgetCents };
}

// ---------- Next actions ----------
export interface NextAction {
  id: string;
  type: 'task' | 'follow_up' | 'approval' | 'post' | 'review';
  title: string;
  detail: string;
  date: string;
  overdue: boolean;
  page: 'campaigns' | 'outreach' | 'calendar' | 'content';
}

export function nextActions(
  input: {
    tasks: Task[];
    campaigns: Campaign[];
    contacts: Contact[];
    calendar: CalendarItem[];
    drafts: Draft[];
  },
  today = todayISO(),
  limit = 8,
): NextAction[] {
  const horizon = addDays(today, 14);
  const campaignName = new Map(input.campaigns.map((c) => [c.id, c.name]));
  const actions: NextAction[] = [];

  for (const t of input.tasks) {
    if (t.done) continue;
    const campaign = input.campaigns.find((c) => c.id === t.campaignId);
    if (campaign && campaign.status === 'completed') continue;
    if (t.dueDate && t.dueDate > horizon) continue;
    actions.push({
      id: `task-${t.id}`,
      type: 'task',
      title: t.title,
      detail: campaignName.get(t.campaignId) ?? 'Campaign task',
      date: t.dueDate,
      overdue: !!t.dueDate && t.dueDate < today,
      page: 'campaigns',
    });
  }
  for (const c of input.contacts) {
    if (!c.nextFollowUp || c.consent === 'do_not_contact') continue;
    if (c.status === 'declined' || c.status === 'booked') continue;
    if (c.nextFollowUp > horizon) continue;
    actions.push({
      id: `contact-${c.id}`,
      type: 'follow_up',
      title: `Follow up with ${c.name}`,
      detail: c.outlet || 'Outreach',
      date: c.nextFollowUp,
      overdue: c.nextFollowUp < today,
      page: 'outreach',
    });
  }
  for (const item of input.calendar) {
    if (item.status === 'posted' || item.scheduledDate > horizon) continue;
    if (item.status === 'draft') {
      actions.push({
        id: `cal-approve-${item.id}`,
        type: 'approval',
        title: `Approve: ${item.title}`,
        detail: item.channel || 'Scheduled content',
        date: item.scheduledDate,
        overdue: item.scheduledDate < today,
        page: 'calendar',
      });
    } else {
      actions.push({
        id: `cal-post-${item.id}`,
        type: 'post',
        title: `Post: ${item.title}`,
        detail: item.channel || 'Scheduled content',
        date: item.scheduledDate,
        overdue: item.scheduledDate < today,
        page: 'calendar',
      });
    }
  }
  for (const d of input.drafts) {
    if (d.status !== 'in_review') continue;
    actions.push({
      id: `draft-${d.id}`,
      type: 'review',
      title: `Review: ${d.title}`,
      detail: 'Waiting for your approval',
      date: '',
      overdue: false,
      page: 'content',
    });
  }

  // Overdue first, then dated items by date, then undated items.
  actions.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (!!a.date !== !!b.date) return a.date ? -1 : 1;
    return a.date.localeCompare(b.date) || a.title.localeCompare(b.title);
  });
  return actions.slice(0, limit);
}

export function pendingApprovals(drafts: Draft[], calendar: CalendarItem[]): number {
  return drafts.filter((d) => d.status === 'in_review').length + calendar.filter((c) => c.status === 'draft').length;
}

// ---------- Outreach ----------
export function pipelineCounts(contacts: Pick<Contact, 'status'>[]): Record<(typeof CONTACT_STATUS)[number], number> {
  const counts = Object.fromEntries(CONTACT_STATUS.map((s) => [s, 0])) as Record<(typeof CONTACT_STATUS)[number], number>;
  for (const c of contacts) counts[c.status] += 1;
  return counts;
}

/** A contact may be pitched only when consent allows it. */
export function canPitch(contact: Pick<Contact, 'consent'>): boolean {
  return contact.consent === 'opted_in' || contact.consent === 'public_contact';
}

// ---------- Analytics ----------
export interface MetricTotal {
  metric: MetricType;
  total: number;
  verified: number;
  userEntered: number;
  estimate: number;
  entries: number;
}

export function inRange(date: string, from: string, to: string): boolean {
  return (!from || date >= from) && (!to || date <= to);
}

export function summarizeMetrics(metrics: Metric[], from = '', to = ''): Record<MetricType, MetricTotal> {
  const out = Object.fromEntries(
    METRIC_TYPES.map((m) => [m, { metric: m, total: 0, verified: 0, userEntered: 0, estimate: 0, entries: 0 }]),
  ) as Record<MetricType, MetricTotal>;
  for (const m of metrics) {
    if (!inRange(m.date, from, to)) continue;
    const t = out[m.metric];
    t.total += m.value;
    t.entries += 1;
    if (m.source === 'verified') t.verified += m.value;
    else if (m.source === 'estimate') t.estimate += m.value;
    else t.userEntered += m.value;
  }
  return out;
}

export interface SeriesPoint {
  date: string;
  value: number;
}

/** Daily totals for one metric across a closed date range, with zero filled gaps. */
export function metricSeries(metrics: Metric[], metric: MetricType, from: string, to: string): SeriesPoint[] {
  const byDate = new Map<string, number>();
  for (const m of metrics) {
    if (m.metric !== metric || !inRange(m.date, from, to)) continue;
    byDate.set(m.date, (byDate.get(m.date) ?? 0) + m.value);
  }
  const points: SeriesPoint[] = [];
  const span = Math.min(Math.max(diffDays(to, from), 0), 730);
  for (let i = 0; i <= span; i++) {
    const date = addDays(from, i);
    points.push({ date, value: byDate.get(date) ?? 0 });
  }
  return points;
}

/** Groups daily points into weekly buckets when a range is long, so charts stay readable. */
export function bucketSeries(points: SeriesPoint[], maxPoints = 45): SeriesPoint[] {
  if (points.length <= maxPoints) return points;
  const size = Math.ceil(points.length / maxPoints);
  const out: SeriesPoint[] = [];
  for (let i = 0; i < points.length; i += size) {
    const chunk = points.slice(i, i + size);
    out.push({ date: chunk[0].date, value: chunk.reduce((sum, p) => sum + p.value, 0) });
  }
  return out;
}

export function metricValueLabel(metric: MetricType, value: number, currency = 'USD'): string {
  return metric === 'revenue' ? formatMoney(Math.round(value * 100), currency) : formatNumber(value);
}

// ---------- Misc ----------
export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

export function safeFileName(name: string, fallback = 'export'): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80);
  return cleaned === '' ? fallback : cleaned;
}
