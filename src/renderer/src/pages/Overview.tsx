import { useMemo, useState } from 'react';
import {
  ArrowRight, CalendarDays, ChartLine, CircleCheck, ExternalLink, Flag, ListChecks, Pencil, Send, Users, type LucideIcon,
} from 'lucide-react';
import { METRIC_LABELS, METRIC_TYPES, label, type MetricType } from '@shared/schema';
import {
  addDays, bucketSeries, campaignProgress, diffDays, formatDate, metricSeries, metricValueLabel, nextActions,
  pendingApprovals, pipelineCounts, relativeDay, summarizeMetrics, todayISO,
} from '@shared/domain';
import { call, errorMessage } from '../lib/api';
import { useApp, useEntityList, type Page } from '../lib/store';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorNote, ProgressBar, STATUS_TONE, Select, Spinner, cx } from '../components/ui';
import { Cover, LineChart } from '../components/common';
import { BookModal } from './Books';

export function Overview() {
  const { activeBook, navigate, toast, settings } = useApp();
  const book = activeBook!;
  const filter = { bookId: book.id };
  const campaigns = useEntityList('campaigns', filter);
  const tasks = useEntityList('tasks', filter);
  const drafts = useEntityList('drafts', filter);
  const calendar = useEntityList('calendarItems', filter);
  const contacts = useEntityList('contacts', filter);
  const metrics = useEntityList('metrics', filter);
  const [editing, setEditing] = useState(false);
  const [metric, setMetric] = useState<MetricType | ''>('');
  const today = todayISO();
  const currency = settings?.currency ?? 'USD';

  const lists = [campaigns, tasks, drafts, calendar, contacts, metrics];
  const loading = lists.some((l) => l.loading);
  const error = lists.find((l) => l.error)?.error;

  const actions = useMemo(
    () => nextActions({ tasks: tasks.items, campaigns: campaigns.items, contacts: contacts.items, calendar: calendar.items, drafts: drafts.items }, today, 6),
    [tasks.items, campaigns.items, contacts.items, calendar.items, drafts.items, today],
  );
  const activeCampaigns = campaigns.items.filter((c) => c.status === 'active');
  const upcoming = calendar.items.filter((i) => i.status !== 'posted' && i.scheduledDate >= today && i.scheduledDate <= addDays(today, 14));
  const pipeline = pipelineCounts(contacts.items);
  const inProgress = pipeline.pitched + pipeline.follow_up + pipeline.responded;

  const from = addDays(today, -29);
  const totals = useMemo(() => summarizeMetrics(metrics.items, from, today), [metrics.items, from, today]);
  const available = METRIC_TYPES.filter((m) => metrics.items.some((x) => x.metric === m));
  const shownMetric: MetricType | null = metric && available.includes(metric) ? metric : (available[0] ?? null);
  const series = useMemo(
    () => (shownMetric ? bucketSeries(metricSeries(metrics.items, shownMetric, from, today)) : []),
    [metrics.items, shownMetric, from, today],
  );

  const openLink = async (url: string) => {
    try {
      await call('shell:openExternal', { url });
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const daysToPub = book.publicationDate ? diffDays(book.publicationDate, today) : null;
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  return (
    <>
      <div className="mb-7 flex items-end justify-between">
        <div>
          <p className="eyebrow mb-2">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className="font-serif text-[34px] font-medium leading-none tracking-tight text-ivory">
            {settings?.author.name ? `Welcome back, ${settings.author.name.split(' ')[0]}` : 'Overview'}
          </h1>
        </div>
      </div>

      {error && <div className="mb-5"><ErrorNote message={error} onRetry={() => lists.forEach((l) => void l.reload())} /></div>}

      <div className="grid grid-cols-12 gap-5">
        {/* Featured book */}
        <Card className="col-span-12 flex gap-7 p-7 xl:col-span-7">
          <Cover book={book} className="w-[150px] shrink-0 self-start" />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="eyebrow mb-2">Active book</p>
            <h2 className="font-serif text-[36px] font-medium leading-[1.05] tracking-tight text-ivory">{book.title}</h2>
            {book.subtitle && <p className="mt-1 font-serif text-[18px] italic text-ivory-dim">{book.subtitle}</p>}
            <p className="mt-3 text-[13px] text-ivory-dim">
              {book.authorName}
              {book.genre && <span className="text-ivory-mute"> · {book.genre}</span>}
            </p>
            {daysToPub !== null && (
              <p className="mt-1 text-[13px] text-ivory-mute">
                {daysToPub > 0 ? (
                  <>
                    Publishes in <span className="font-medium text-gold-pale">{daysToPub} {daysToPub === 1 ? 'day' : 'days'}</span>,{' '}
                  </>
                ) : daysToPub === 0 ? (
                  <span className="font-medium text-gold-pale">Publishes today, </span>
                ) : (
                  'Published '
                )}
                {formatDate(book.publicationDate, { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            )}
            {book.summary ? (
              <p className="mt-4 line-clamp-3 max-w-xl text-[13.5px] leading-6 text-ivory-dim">{book.summary}</p>
            ) : (
              <p className="mt-4 max-w-xl text-[13px] leading-6 text-ivory-mute">
                Add a summary, audience and voice so drafts and plans can be tailored to this book.
              </p>
            )}
            {book.channels.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Marketing channels">
                {book.channels.slice(0, 6).map((channel) => (
                  <Badge key={channel}>{channel}</Badge>
                ))}
              </div>
            )}
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
              <Button size="sm" icon={Pencil} onClick={() => setEditing(true)}>
                Edit details
              </Button>
              {book.purchaseLinks.filter((l) => l.url).slice(0, 3).map((l) => (
                <Button key={l.url} size="sm" variant="ghost" icon={ExternalLink} onClick={() => void openLink(l.url)}>
                  {l.label || 'Buy link'}
                </Button>
              ))}
            </div>
          </div>
        </Card>

        {/* Next actions */}
        <Card className="col-span-12 flex flex-col xl:col-span-5">
          <CardHeader title="Next actions" eyebrow="Up next" />
          {loading ? (
            <Spinner />
          ) : actions.length === 0 ? (
            <EmptyState compact icon={CircleCheck} title="Nothing waiting on you" body="Tasks, follow ups and approvals due in the next two weeks will appear here." />
          ) : (
            <ul className="flex-1 px-2 pb-2">
              {actions.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => navigate(a.page)}
                    className="group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-ink-800"
                  >
                    <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', a.overdue ? 'bg-danger' : 'bg-gold')} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ivory">{a.title}</span>
                      <span className="block truncate text-[12px] text-ivory-mute">{a.detail}</span>
                    </span>
                    {a.date && <span className={cx('shrink-0 text-[12px]', a.overdue ? 'text-danger' : 'text-ivory-mute')}>{relativeDay(a.date, today)}</span>}
                    <ArrowRight size={14} className="shrink-0 text-ivory-mute opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* KPI tiles: counts of real activity in the studio, never sales figures. */}
        <Kpi icon={Flag} label="Active campaigns" value={activeCampaigns.length} detail={`${campaigns.items.filter((c) => c.status === 'planning').length} in planning`} page="campaigns" />
        <Kpi icon={ListChecks} label="Pending approvals" value={pendingApprovals(drafts.items, calendar.items)} detail="Drafts and scheduled items" page="calendar" />
        <Kpi icon={CalendarDays} label="Scheduled, next 14 days" value={upcoming.length} detail={`${upcoming.filter((i) => i.status === 'approved').length} approved`} page="calendar" />
        <Kpi icon={Send} label="Outreach in progress" value={inProgress} detail={`${pipeline.booked} booked`} page="outreach" />

        {/* Campaign progress */}
        <Card className="col-span-12 lg:col-span-6">
          <CardHeader title="Campaign progress" action={<LinkButton onClick={() => navigate('campaigns')}>All campaigns</LinkButton>} />
          {loading ? (
            <Spinner />
          ) : campaigns.items.filter((c) => c.status !== 'completed').length === 0 ? (
            <EmptyState
              compact
              icon={Flag}
              title="No campaigns in motion"
              body="A campaign groups your goals, tasks and budget for one push."
              action={<Button size="sm" onClick={() => navigate('campaigns', 'new')}>Plan a campaign</Button>}
            />
          ) : (
            <ul className="space-y-5 px-5 pb-5 pt-1">
              {campaigns.items.filter((c) => c.status !== 'completed').slice(0, 4).map((c) => {
                const progress = campaignProgress(tasks.items.filter((t) => t.campaignId === c.id));
                return (
                  <li key={c.id}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <button type="button" onClick={() => navigate('campaigns', c.id)} className="min-w-0 truncate text-left text-[13.5px] font-medium text-ivory hover:text-gold-pale">
                        {c.name}
                      </button>
                      <div className="flex shrink-0 items-center gap-2.5">
                        <span className="text-[12px] text-ivory-mute">
                          {progress.total === 0 ? 'No tasks yet' : `${progress.done} of ${progress.total} tasks`}
                        </span>
                        <Badge tone={STATUS_TONE[c.status]}>{label(c.status)}</Badge>
                      </div>
                    </div>
                    <ProgressBar percent={progress.percent} label={`${c.name} progress`} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Content calendar: the week ahead */}
        <Card className="col-span-12 lg:col-span-6">
          <CardHeader title="Content calendar" eyebrow="Next 7 days" action={<LinkButton onClick={() => navigate('calendar')}>Open calendar</LinkButton>} />
          {loading ? (
            <Spinner />
          ) : (
            <div className="grid grid-cols-7 gap-1.5 px-5 pb-5 pt-1">
              {week.map((date) => {
                const items = calendar.items.filter((i) => i.scheduledDate === date);
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => navigate('calendar', date)}
                    aria-label={`${formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}, ${items.length} scheduled`}
                    className={cx(
                      'flex min-h-[112px] flex-col rounded-md border p-2 text-left transition-colors hover:border-line-strong',
                      date === today ? 'border-gold/40 bg-gold/[0.04]' : 'border-line bg-ink-900/60',
                    )}
                  >
                    <span className="text-2xs uppercase text-ivory-mute">{formatDate(date, { weekday: 'short' })}</span>
                    <span className={cx('font-serif text-[20px] leading-tight', date === today ? 'text-gold-pale' : 'text-ivory')}>{Number(date.slice(8))}</span>
                    <span className="mt-1.5 flex flex-col gap-1">
                      {items.slice(0, 2).map((i) => (
                        <span key={i.id} className="flex items-center gap-1.5 text-[11px] leading-4 text-ivory-dim">
                          <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', i.status === 'posted' ? 'bg-ok' : i.status === 'approved' ? 'bg-gold' : 'bg-ivory-mute')} aria-hidden />
                          <span className="truncate">{i.title}</span>
                        </span>
                      ))}
                      {items.length > 2 && <span className="text-[11px] text-ivory-mute">+{items.length - 2} more</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Outreach overview */}
        <Card className="col-span-12 lg:col-span-5">
          <CardHeader title="Outreach overview" action={<LinkButton onClick={() => navigate('outreach')}>All contacts</LinkButton>} />
          {loading ? (
            <Spinner />
          ) : contacts.items.length === 0 ? (
            <EmptyState
              compact
              icon={Users}
              title="No contacts yet"
              body="Track reviewers, podcasts and media you would like to reach."
              action={<Button size="sm" onClick={() => navigate('outreach', 'new')}>Add a contact</Button>}
            />
          ) : (
            <ul className="space-y-3 px-5 pb-5 pt-1">
              {(['prospect', 'ready', 'pitched', 'follow_up', 'responded', 'booked'] as const).map((status) => {
                const count = pipeline[status];
                const percent = Math.round((count / contacts.items.length) * 100);
                return (
                  <li key={status} className="grid grid-cols-[112px_1fr_28px] items-center gap-3 text-[12.5px]">
                    <span className="text-ivory-dim">{label(status)}</span>
                    <ProgressBar percent={percent} tone={status === 'booked' || status === 'responded' ? 'gold' : 'olive'} label={`${label(status)}: ${count}`} />
                    <span className="text-right font-medium text-ivory">{count}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Performance */}
        <Card className="col-span-12 lg:col-span-7">
          <CardHeader
            title="Performance"
            eyebrow="Last 30 days"
            action={
              shownMetric ? (
                <Select aria-label="Metric" value={shownMetric} onChange={(e) => setMetric(e.target.value as MetricType)} className="!h-8 w-44 text-[12.5px]">
                  {available.map((m) => (
                    <option key={m} value={m}>
                      {METRIC_LABELS[m]}
                    </option>
                  ))}
                </Select>
              ) : undefined
            }
          />
          {loading ? (
            <Spinner />
          ) : !shownMetric ? (
            <EmptyState
              compact
              icon={ChartLine}
              title="No numbers recorded"
              body="The studio does not track sales by itself. Enter or import your figures and they will be charted here."
              action={<Button size="sm" onClick={() => navigate('analytics', 'new')}>Add numbers</Button>}
            />
          ) : (
            <div className="px-5 pb-5">
              <div className="mb-2 flex items-baseline gap-3">
                <span className="font-serif text-[30px] leading-none text-ivory">{metricValueLabel(shownMetric, totals[shownMetric].total, currency)}</span>
                <SourceNote total={totals[shownMetric]} />
              </div>
              <LineChart points={series} height={190} label={`${METRIC_LABELS[shownMetric]}, last 30 days`} formatValue={(v) => metricValueLabel(shownMetric, v, currency)} />
            </div>
          )}
        </Card>
      </div>

      {editing && <BookModal book={book} onClose={() => setEditing(false)} />}
    </>
  );
}

export function SourceNote({ total }: { total: { total: number; verified: number; estimate: number } }) {
  if (total.total === 0) return <span className="text-[12px] text-ivory-mute">No entries in this period</span>;
  const text =
    total.verified === total.total
      ? 'All verified by you from platform reports'
      : total.estimate === total.total
        ? 'All estimates'
        : `${Math.round((total.verified / total.total) * 100)}% verified, the rest entered by hand or estimated`;
  return <span className="text-[12px] text-ivory-mute">{text}</span>;
}

function Kpi({ icon: Icon, label: text, value, detail, page }: { icon: LucideIcon; label: string; value: number; detail: string; page: Page }) {
  const { navigate } = useApp();
  return (
    <button
      type="button"
      onClick={() => navigate(page)}
      className="card col-span-6 flex flex-col p-5 text-left transition-colors hover:border-line-strong xl:col-span-3"
    >
      <span className="flex items-center justify-between">
        <span className="text-2xs uppercase text-ivory-mute">{text}</span>
        <Icon size={15} strokeWidth={1.5} className="text-gold-deep" aria-hidden />
      </span>
      <span className="mt-3 font-serif text-[40px] font-medium leading-none text-ivory">{value}</span>
      <span className="mt-2 text-[12px] text-ivory-mute">{detail}</span>
    </button>
  );
}

function LinkButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex shrink-0 items-center gap-1 text-[12.5px] text-gold hover:text-gold-pale">
      {children}
      <ArrowRight size={13} aria-hidden />
    </button>
  );
}
