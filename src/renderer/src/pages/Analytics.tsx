import { useEffect, useMemo, useState } from 'react';
import { ChartLine, Download, FileText, Info, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { METRIC_LABELS, METRIC_SOURCES, METRIC_TYPES, label, type Metric, type MetricType } from '@shared/schema';
import type { ImportSummary } from '@shared/api';
import { addDays, bucketSeries, formatDate, inRange, metricSeries, metricValueLabel, summarizeMetrics, todayISO } from '@shared/domain';
import { call, errorMessage } from '../lib/api';
import { useApp, useEntityList } from '../lib/store';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorNote, Field, IconButton, Input, Modal, Notice, PageHeader,
  STATUS_TONE, Segmented, Select, Spinner, cx,
} from '../components/ui';
import { LineChart } from '../components/common';
import { SourceNote } from './Overview';
import { ImportSummaryModal } from './Outreach';

type Range = '30' | '90' | '365' | 'all';
const SOURCE_HELP: Record<(typeof METRIC_SOURCES)[number], string> = {
  verified: 'Copied exactly from a retailer, platform or email service report.',
  user_entered: 'A number you noted yourself and have not checked against a report.',
  estimate: 'A rough figure or projection.',
};

export function Analytics() {
  const { activeBook, pageParam, toast, settings } = useApp();
  const book = activeBook!;
  const metrics = useEntityList('metrics', { bookId: book.id });
  const [range, setRange] = useState<Range>('30');
  const [selected, setSelected] = useState<MetricType>('units_sold');
  const [editing, setEditing] = useState<Metric | 'new' | null>(pageParam === 'new' ? 'new' : null);
  const [deleting, setDeleting] = useState<Metric | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const currency = settings?.currency ?? 'USD';
  const today = todayISO();

  useEffect(() => {
    if (pageParam === 'new') setEditing('new');
  }, [pageParam]);

  const earliest = metrics.items.reduce((min, m) => (m.date < min ? m.date : min), today);
  const from = range === 'all' ? earliest : addDays(today, -(Number(range) - 1));
  const to = metrics.items.reduce((max, m) => (m.date > max ? m.date : max), today);
  const totals = useMemo(() => summarizeMetrics(metrics.items, from, to), [metrics.items, from, to]);
  const inView = useMemo(() => metrics.items.filter((m) => inRange(m.date, from, to)), [metrics.items, from, to]);
  const series = useMemo(() => bucketSeries(metricSeries(metrics.items, selected, from, to)), [metrics.items, selected, from, to]);

  // Default to the first metric that has data.
  useEffect(() => {
    if (metrics.items.length > 0 && !metrics.items.some((m) => m.metric === selected)) {
      const first = METRIC_TYPES.find((t) => metrics.items.some((m) => m.metric === t));
      if (first) setSelected(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics.items.length]);

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  const importCsv = () =>
    run(async () => {
      const result = await call<ImportSummary>('import:csv', { dataset: 'metrics', bookId: book.id });
      if (result.canceled) return;
      await metrics.reload();
      setSummary(result);
    });
  const template = () =>
    run(async () => {
      const path = await call<string | null>('import:template', { dataset: 'metrics' });
      if (path) toast(`Template saved to ${path}`);
    });
  const exportCsv = () =>
    run(async () => {
      const path = await call<string | null>('export:csv', { dataset: 'metrics', bookId: book.id });
      if (path) toast(`Saved to ${path}`);
    });

  const header = (
    <PageHeader
      eyebrow="Measure"
      title="Analytics"
      description="Record sales, traffic and engagement from your retailer and platform reports, and see how your marketing is performing over time."
      actions={
        <>
          <Button icon={Upload} onClick={importCsv}>
            Import CSV
          </Button>
          <Button icon={Download} onClick={exportCsv} disabled={metrics.items.length === 0}>
            Export
          </Button>
          <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
            Add numbers
          </Button>
        </>
      }
    />
  );

  if (metrics.loading) return <>{header}<Card><Spinner /></Card></>;

  return (
    <>
      {header}
      {metrics.error && <div className="mb-5"><ErrorNote message={metrics.error} onRetry={() => void metrics.reload()} /></div>}
      <div className="mb-5">
        <Notice icon={Info} tone="olive">
          The studio is not connected to any store or platform, so it never shows live sales. Every figure here was entered or imported
          by you, and each one is labeled as verified, entered by you, or an estimate.
        </Notice>
      </div>

      {metrics.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ChartLine}
            title="No numbers yet"
            body="Add figures from your sales dashboard, newsletter service or social accounts. A few entries a week is enough to see the trend."
            action={
              <>
                <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
                  Add numbers
                </Button>
                <Button icon={FileText} onClick={template}>
                  Get CSV template
                </Button>
              </>
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <Segmented
              label="Date range"
              value={range}
              onChange={setRange}
              options={[
                { value: '30', label: '30 days' },
                { value: '90', label: '90 days' },
                { value: '365', label: '12 months' },
                { value: 'all', label: 'All time' },
              ]}
            />
            <button type="button" onClick={template} className="text-[12.5px] text-gold hover:text-gold-pale">
              Get CSV template
            </button>
          </div>

          <div role="radiogroup" aria-label="Metric" className="mb-5 grid grid-cols-4 gap-3 2xl:grid-cols-7">
            {METRIC_TYPES.map((m) => {
              const t = totals[m];
              const active = selected === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelected(m)}
                  className={cx('card p-4 text-left transition-colors', active ? 'border-gold/50' : 'hover:border-line-strong')}
                >
                  <span className="block text-2xs uppercase text-ivory-mute">{METRIC_LABELS[m]}</span>
                  <span className={cx('mt-2 block font-serif text-[28px] leading-none', t.entries === 0 ? 'text-ivory-mute' : 'text-ivory')}>
                    {t.entries === 0 ? 'No data' : metricValueLabel(m, t.total, currency)}
                  </span>
                  <span className="mt-1.5 block text-[11.5px] text-ivory-mute">
                    {t.entries === 0 ? 'Nothing recorded' : `${t.entries} ${t.entries === 1 ? 'entry' : 'entries'}`}
                  </span>
                </button>
              );
            })}
          </div>

          <Card className="mb-5">
            <CardHeader title={METRIC_LABELS[selected]} eyebrow={`${formatDate(from, { month: 'short', day: 'numeric', year: 'numeric' })} to ${formatDate(to, { month: 'short', day: 'numeric', year: 'numeric' })}`} />
            <div className="px-5 pb-5">
              {totals[selected].entries === 0 ? (
                <p className="py-12 text-center text-[13px] text-ivory-mute">No {METRIC_LABELS[selected].toLowerCase()} recorded in this period.</p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="font-serif text-[34px] leading-none text-ivory">{metricValueLabel(selected, totals[selected].total, currency)}</span>
                    <SourceNote total={totals[selected]} />
                  </div>
                  <LineChart points={series} height={240} label={METRIC_LABELS[selected]} formatValue={(v) => metricValueLabel(selected, v, currency)} />
                  <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-[12.5px]">
                    {(
                      [
                        ['verified', totals[selected].verified],
                        ['user_entered', totals[selected].userEntered],
                        ['estimate', totals[selected].estimate],
                      ] as const
                    ).map(([source, value]) => (
                      <div key={source}>
                        <dt className="flex items-center gap-2 text-ivory-mute">
                          <Badge tone={STATUS_TONE[source]}>{label(source)}</Badge>
                        </dt>
                        <dd className="mt-1.5 text-[15px] font-medium text-ivory">{metricValueLabel(selected, value, currency)}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Entries in this period" action={<span className="text-[12px] text-ivory-mute">{inView.length} shown</span>} />
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[760px] text-left text-[13px]">
                <thead className="sticky top-0 bg-ink-850">
                  <tr className="whitespace-nowrap border-b border-line text-2xs uppercase text-ivory-mute">
                    <th scope="col" className="px-5 py-2.5 font-medium">Date</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Metric</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Value</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Channel</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Source</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Note</th>
                    <th scope="col" className="px-5 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {inView.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-10 text-center text-ivory-mute">
                        No entries in this period. Try a longer date range.
                      </td>
                    </tr>
                  )}
                  {inView.slice(0, 300).map((m) => (
                    <tr key={m.id} className="border-b border-line/70 last:border-0 hover:bg-ink-800/50">
                      <td className="whitespace-nowrap px-5 py-2.5 text-ivory-dim">{formatDate(m.date, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                      <td className="px-3 py-2.5 text-ivory">{METRIC_LABELS[m.metric]}</td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums text-ivory">{metricValueLabel(m.metric, m.value, currency)}</td>
                      <td className="px-3 py-2.5 text-ivory-dim">{m.channel || <span className="text-ivory-mute">None</span>}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={STATUS_TONE[m.source]}>{label(m.source)}</Badge>
                        {m.origin === 'csv' && <span className="ml-2 text-[11.5px] text-ivory-mute">CSV</span>}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2.5 text-ivory-mute" title={m.note}>{m.note}</td>
                      <td className="px-5 py-2.5">
                        <div className="flex justify-end gap-0.5">
                          <IconButton icon={Pencil} label="Edit entry" onClick={() => setEditing(m)} />
                          <IconButton icon={Trash2} label="Delete entry" onClick={() => setDeleting(m)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {inView.length > 300 && <p className="border-t border-line px-5 py-2.5 text-[12px] text-ivory-mute">Showing the latest 300 entries. Export to CSV to see them all.</p>}
          </Card>
        </>
      )}

      {editing && (
        <MetricModal
          metric={editing === 'new' ? null : editing}
          defaultMetric={selected}
          currency={currency}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            const saved = editing === 'new' ? await metrics.create({ ...data, bookId: book.id }) : await metrics.update(editing.id, data);
            if (saved) {
              setSelected(saved.metric);
              setEditing(null);
            }
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this entry?"
          body={<>{METRIC_LABELS[deleting.metric]} of {metricValueLabel(deleting.metric, deleting.value, currency)} on {formatDate(deleting.date)} will be removed.</>}
          confirmLabel="Delete entry"
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            if (await metrics.remove(deleting.id)) setDeleting(null);
          }}
        />
      )}
      {summary && <ImportSummaryModal summary={summary} noun="entries" onClose={() => setSummary(null)} />}
    </>
  );
}

type MetricData = Pick<Metric, 'date' | 'metric' | 'value' | 'channel' | 'source' | 'note'>;

function MetricModal({
  metric,
  defaultMetric,
  currency,
  onClose,
  onSave,
}: {
  metric: Metric | null;
  defaultMetric: MetricType;
  currency: string;
  onClose: () => void;
  onSave: (data: MetricData) => Promise<void>;
}) {
  const [form, setForm] = useState({
    date: metric?.date ?? todayISO(),
    metric: metric?.metric ?? defaultMetric,
    value: metric ? String(metric.value) : '',
    channel: metric?.channel ?? '',
    source: metric?.source ?? ('user_entered' as Metric['source']),
    note: metric?.note ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    const e: Record<string, string> = {};
    const value = Number(form.value.replace(/[$£€,\s]/g, ''));
    if (form.value.trim() === '' || !Number.isFinite(value) || value < 0) e.value = 'Enter a number of zero or more';
    if (!form.date) e.date = 'Choose a date';
    else if (form.date > addDays(todayISO(), 1) && form.source === 'verified') e.source = 'A future figure cannot be verified. Mark it as an estimate.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    await onSave({ date: form.date, metric: form.metric, value, channel: form.channel, source: form.source, note: form.note });
    setSaving(false);
  };

  return (
    <Modal
      title={metric ? 'Edit entry' : 'Add numbers'}
      description="Record one figure for one day. For totals over a longer period, use the last day of the period."
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {metric ? 'Save changes' : 'Add entry'}
          </Button>
        </>
      }
    >
      <form
        className="grid grid-cols-2 gap-x-4 gap-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="What are you recording?">
          {(p) => (
            <Select {...p} value={form.metric} onChange={(e) => set('metric', e.target.value as MetricType)}>
              {METRIC_TYPES.map((m) => (
                <option key={m} value={m}>
                  {METRIC_LABELS[m]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={form.metric === 'revenue' ? `Amount (${currency})` : 'Value'} error={errors.value}>
          {(p) => <Input {...p} inputMode="decimal" value={form.value} onChange={(e) => set('value', e.target.value)} data-autofocus />}
        </Field>
        <Field label="Date" error={errors.date}>
          {(p) => <Input {...p} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />}
        </Field>
        <Field label="Channel or store" optional>
          {(p) => <Input {...p} value={form.channel} maxLength={60} onChange={(e) => set('channel', e.target.value)} placeholder="For example, Amazon" />}
        </Field>
        <Field label="How reliable is this number?" hint={SOURCE_HELP[form.source]} error={errors.source} className="col-span-2">
          {(p) => (
            <Select {...p} value={form.source} onChange={(e) => set('source', e.target.value as Metric['source'])}>
              {METRIC_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Note" optional className="col-span-2">
          {(p) => <Input {...p} value={form.note} maxLength={500} onChange={(e) => set('note', e.target.value)} placeholder="Where the figure came from" />}
        </Field>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
