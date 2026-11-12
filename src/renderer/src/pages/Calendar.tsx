import { useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Copy, Download, Info, Plus, Trash2 } from 'lucide-react';
import { CALENDAR_STATUS, CHANNEL_OPTIONS, label, type CalendarItem } from '@shared/schema';
import { formatDate, monthGrid, parseISO, relativeDay, todayISO } from '@shared/domain';
import { call, errorMessage } from '../lib/api';
import { useApp, useEntityList, type EntityList } from '../lib/store';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorNote, Field, IconButton, Input, Modal, Notice, PageHeader,
  STATUS_TONE, Segmented, Select, Spinner, Textarea, cx,
} from '../components/ui';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOT = { draft: 'bg-ivory-mute', approved: 'bg-gold', posted: 'bg-ok' } as const;

export function CalendarPage() {
  const { activeBook, pageParam, toast } = useApp();
  const book = activeBook!;
  const items = useEntityList('calendarItems', { bookId: book.id });
  const drafts = useEntityList('drafts', { bookId: book.id });
  const campaigns = useEntityList('campaigns', { bookId: book.id });
  const today = todayISO();
  const start = /^\d{4}-\d{2}-\d{2}$/.test(pageParam) ? parseISO(pageParam) : new Date();
  const [cursor, setCursor] = useState({ year: start.getFullYear(), month: start.getMonth() });
  const [editing, setEditing] = useState<CalendarItem | { date: string } | null>(null);

  const cells = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items.items) map.set(item.scheduledDate, [...(map.get(item.scheduledDate) ?? []), item]);
    return map;
  }, [items.items]);
  const awaiting = items.items.filter((i) => i.status === 'draft' && i.scheduledDate >= today).slice(0, 6);
  const toPost = items.items.filter((i) => i.status === 'approved' && i.scheduledDate <= today).slice(0, 6);

  const shift = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const exportCsv = async () => {
    try {
      const path = await call<string | null>('export:csv', { dataset: 'calendar', bookId: book.id });
      if (path) toast(`Saved to ${path}`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Schedule"
        title="Calendar"
        description="Plan what goes out and when. Approve each item before its date, then mark it posted once you have published it."
        actions={
          <>
            <Button icon={Download} onClick={exportCsv} disabled={items.items.length === 0}>
              Export CSV
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setEditing({ date: today })}>
              Schedule item
            </Button>
          </>
        }
      />
      <div className="mb-5">
        <Notice icon={Info} tone="olive">
          This is a planning calendar. The studio does not post to any platform for you, so nothing goes out until you publish it yourself.
        </Notice>
      </div>
      {items.error && <div className="mb-5"><ErrorNote message={items.error} onRetry={() => void items.reload()} /></div>}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-serif text-[24px] text-ivory" aria-live="polite">
            {new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </h2>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setCursor({ year: new Date().getFullYear(), month: new Date().getMonth() })}>
              Today
            </Button>
            <IconButton icon={ChevronLeft} label="Previous month" onClick={() => shift(-1)} />
            <IconButton icon={ChevronRight} label="Next month" onClick={() => shift(1)} />
          </div>
        </div>
        {items.loading ? (
          <Spinner />
        ) : (
          <div role="grid" aria-label="Month calendar">
            <div role="row" className="grid grid-cols-7 border-b border-line">
              {WEEKDAYS.map((d) => (
                <div key={d} role="columnheader" className="px-3 py-2 text-2xs uppercase text-ivory-mute">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((cell, index) => {
                const list = byDate.get(cell.date) ?? [];
                const isToday = cell.date === today;
                return (
                  <div
                    key={cell.date}
                    role="gridcell"
                    className={cx(
                      'group relative min-h-[112px] border-b border-r border-line p-1.5',
                      index % 7 === 6 && 'border-r-0',
                      index >= 35 && 'border-b-0',
                      !cell.inMonth && 'bg-ink-900/60',
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between px-1">
                      <span
                        className={cx(
                          'flex h-6 min-w-6 items-center justify-center rounded-full text-[12px]',
                          isToday ? 'bg-gold px-1.5 font-semibold text-ink-950' : cell.inMonth ? 'text-ivory-dim' : 'text-ivory-mute/60',
                        )}
                      >
                        {Number(cell.date.slice(8))}
                      </span>
                      <button
                        type="button"
                        aria-label={`Schedule an item on ${formatDate(cell.date, { month: 'long', day: 'numeric' })}`}
                        onClick={() => setEditing({ date: cell.date })}
                        className="flex h-5 w-5 items-center justify-center rounded text-ivory-mute opacity-0 hover:bg-ink-700 hover:text-ivory focus:opacity-100 group-hover:opacity-100"
                      >
                        <Plus size={13} aria-hidden />
                      </button>
                    </div>
                    <div className="space-y-1">
                      {list.slice(0, 3).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setEditing(item)}
                          title={`${item.title} (${label(item.status)})`}
                          className="flex w-full items-center gap-1.5 rounded border border-line bg-ink-800 px-1.5 py-1 text-left text-[11.5px] leading-4 text-ivory-dim transition-colors hover:border-line-strong hover:text-ivory"
                        >
                          <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', DOT[item.status])} aria-hidden />
                          <span className="truncate">{item.title}</span>
                          <span className="sr-only">, {label(item.status)}</span>
                        </button>
                      ))}
                      {list.length > 3 && (
                        <button type="button" onClick={() => setEditing(list[3])} className="px-1.5 text-[11px] text-ivory-mute hover:text-ivory">
                          +{list.length - 3} more
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex items-center gap-5 border-t border-line px-5 py-2.5 text-[12px] text-ivory-mute">
          {CALENDAR_STATUS.map((s) => (
            <span key={s} className="flex items-center gap-2">
              <span className={cx('h-1.5 w-1.5 rounded-full', DOT[s])} aria-hidden />
              {label(s)}
            </span>
          ))}
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Waiting for your approval" />
          {awaiting.length === 0 ? (
            <EmptyState compact icon={Check} title="All caught up" body="Upcoming items that still need your approval will be listed here." />
          ) : (
            <ul className="px-2 pb-2">
              {awaiting.map((item) => (
                <QueueRow key={item.id} item={item} today={today} onOpen={() => setEditing(item)} action="Approve" onAction={() => void items.update(item.id, { status: 'approved' })} />
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Approved and due to post" />
          {toPost.length === 0 ? (
            <EmptyState compact icon={CalendarDays} title="Nothing due" body="Approved items appear here on the day they are scheduled." />
          ) : (
            <ul className="px-2 pb-2">
              {toPost.map((item) => (
                <QueueRow key={item.id} item={item} today={today} onOpen={() => setEditing(item)} action="Mark posted" onAction={() => void items.update(item.id, { status: 'posted' })} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {editing && (
        <ItemModal
          item={'id' in editing ? editing : null}
          date={'id' in editing ? editing.scheduledDate : editing.date}
          bookId={book.id}
          channels={Array.from(new Set([...book.channels, ...CHANNEL_OPTIONS]))}
          drafts={drafts.items.filter((d) => d.status !== 'archived')}
          campaigns={campaigns.items}
          api={items}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function QueueRow({ item, today, onOpen, action, onAction }: { item: CalendarItem; today: string; onOpen: () => void; action: string; onAction: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-ink-800">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13px] text-ivory">{item.title}</span>
        <span className="block text-[12px] text-ivory-mute">
          {relativeDay(item.scheduledDate, today)}
          {item.channel && ` · ${item.channel}`}
        </span>
      </button>
      <Button size="sm" onClick={onAction}>
        {action}
      </Button>
    </li>
  );
}

function ItemModal({
  item,
  date,
  bookId,
  channels,
  drafts,
  campaigns,
  api,
  onClose,
}: {
  item: CalendarItem | null;
  date: string;
  bookId: string;
  channels: string[];
  drafts: { id: string; title: string; body: string; status: string }[];
  campaigns: { id: string; name: string }[];
  api: EntityList<'calendarItems'>;
  onClose: () => void;
}) {
  const { toast } = useApp();
  const [form, setForm] = useState({
    title: item?.title ?? '',
    channel: item?.channel ?? '',
    scheduledDate: item?.scheduledDate ?? date,
    scheduledTime: item?.scheduledTime ?? '',
    status: item?.status ?? ('draft' as CalendarItem['status']),
    draftId: item?.draftId ?? '',
    campaignId: item?.campaignId ?? '',
    notes: item?.notes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const linked = drafts.find((d) => d.id === form.draftId);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (form.title.trim() === '') e.title = 'Add a title';
    if (!form.scheduledDate) e.scheduledDate = 'Choose a date';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const saved = item ? await api.update(item.id, form) : await api.create({ ...form, bookId });
    setSaving(false);
    if (saved) onClose();
  };

  const copyLinked = async () => {
    if (!linked) return;
    try {
      await navigator.clipboard.writeText(linked.body);
      toast('Draft text copied to the clipboard.');
    } catch {
      toast('Copying was blocked. Open the draft and copy it from there.', 'error');
    }
  };

  if (confirming && item) {
    return (
      <ConfirmDialog
        title="Remove from calendar?"
        body={<>"{item.title}" will be removed from the calendar. Any linked draft is kept.</>}
        confirmLabel="Remove"
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          if (await api.remove(item.id)) onClose();
        }}
      />
    );
  }

  return (
    <Modal
      title={item ? 'Scheduled item' : 'Schedule an item'}
      size="md"
      onClose={onClose}
      footer={
        <>
          {item && (
            <Button variant="danger" icon={Trash2} onClick={() => setConfirming(true)}>
              Remove
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {item ? 'Save' : 'Schedule'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Field label="Title" error={errors.title} className="col-span-2">
          {(p) => <Input {...p} value={form.title} maxLength={240} onChange={(e) => set('title', e.target.value)} placeholder="For example, Cover reveal post" data-autofocus />}
        </Field>
        <Field label="Date" error={errors.scheduledDate}>
          {(p) => <Input {...p} type="date" value={form.scheduledDate} onChange={(e) => set('scheduledDate', e.target.value)} />}
        </Field>
        <Field label="Time" optional>
          {(p) => <Input {...p} type="time" value={form.scheduledTime} onChange={(e) => set('scheduledTime', e.target.value)} />}
        </Field>
        <Field label="Channel" optional>
          {(p) => (
            <Select {...p} value={form.channel} onChange={(e) => set('channel', e.target.value)}>
              <option value="">Not set</option>
              {channels.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Campaign" optional>
          {(p) => (
            <Select {...p} value={form.campaignId} onChange={(e) => set('campaignId', e.target.value)}>
              <option value="">None</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="col-span-2">
          <p className="mb-1.5 text-[12.5px] font-medium text-ivory-dim">Status</p>
          <div className="flex items-center gap-3">
            <Segmented label="Status" value={form.status} onChange={(v) => set('status', v)} options={CALENDAR_STATUS.map((s) => ({ value: s, label: label(s) }))} />
            <span className="text-[12px] text-ivory-mute">
              {form.status === 'draft' ? 'Not yet approved to go out.' : form.status === 'approved' ? 'Approved by you. Ready to publish.' : 'You have published this.'}
            </span>
          </div>
        </div>
        <Field label="Linked draft" optional hint="Attach the copy you plan to post." className="col-span-2">
          {(p) => (
            <Select {...p} value={form.draftId} onChange={(e) => set('draftId', e.target.value)}>
              <option value="">None</option>
              {drafts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {linked && (
          <div className="col-span-2 rounded-md border border-line bg-ink-900 p-3">
            <div className="mb-2 flex items-center justify-between">
              <Badge tone={STATUS_TONE[linked.status]}>Draft: {label(linked.status)}</Badge>
              <Button size="sm" variant="ghost" icon={Copy} onClick={copyLinked} disabled={linked.body.trim() === ''}>
                Copy text
              </Button>
            </div>
            <p className="line-clamp-4 whitespace-pre-line text-[12.5px] leading-5 text-ivory-dim">{linked.body || 'This draft is empty.'}</p>
          </div>
        )}
        <Field label="Notes" optional className="col-span-2">
          {(p) => <Textarea {...p} rows={2} value={form.notes} maxLength={4000} onChange={(e) => set('notes', e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}
