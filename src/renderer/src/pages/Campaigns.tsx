import { useEffect, useState } from 'react';
import { Flag, Milestone, Pencil, Plus, Trash2 } from 'lucide-react';
import { CAMPAIGN_STATUS, CHANNEL_OPTIONS, label, type Campaign, type Task } from '@shared/schema';
import { budgetStatus, campaignProgress, formatDate, formatMoney, parseMoneyToCents, relativeDay, todayISO } from '@shared/domain';
import { useApp, useEntityList, type EntityList } from '../lib/store';
import {
  Badge, Button, Card, Chips, ConfirmDialog, EmptyState, ErrorNote, Field, IconButton, Input, Modal, PageHeader, ProgressBar,
  STATUS_TONE, Select, Spinner, Textarea, cx,
} from '../components/ui';

export function Campaigns() {
  const { activeBook, pageParam, settings } = useApp();
  const book = activeBook!;
  const campaigns = useEntityList('campaigns', { bookId: book.id });
  const tasks = useEntityList('tasks', { bookId: book.id });
  const [selected, setSelected] = useState(pageParam !== 'new' ? pageParam : '');
  const [editing, setEditing] = useState<Campaign | 'new' | null>(pageParam === 'new' ? 'new' : null);
  const [deleting, setDeleting] = useState<Campaign | null>(null);
  const currency = settings?.currency ?? 'USD';

  useEffect(() => {
    if (pageParam === 'new') setEditing('new');
    else if (pageParam) setSelected(pageParam);
  }, [pageParam]);

  const active = campaigns.items.find((c) => c.id === selected) ?? campaigns.items[0] ?? null;

  const header = (
    <PageHeader
      eyebrow="Plan"
      title="Campaigns"
      description="Give each marketing push a goal, a timeline, a budget and a checklist, then track it to the finish."
      actions={
        <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
          New campaign
        </Button>
      }
    />
  );

  if (campaigns.loading || tasks.loading) return <>{header}<Card><Spinner /></Card></>;
  const error = campaigns.error || tasks.error;

  return (
    <>
      {header}
      {error && <div className="mb-5"><ErrorNote message={error} onRetry={() => { void campaigns.reload(); void tasks.reload(); }} /></div>}

      {campaigns.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Flag}
            title="Plan your first campaign"
            body="A launch, a preorder push, a podcast tour. Start with one goal and a handful of tasks."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
                New campaign
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-[320px_minmax(0,1fr)] items-start gap-5">
          <ul className="space-y-3" aria-label="Campaigns">
            {campaigns.items.map((c) => {
              const progress = campaignProgress(tasks.items.filter((t) => t.campaignId === c.id));
              const isActive = active?.id === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-current={isActive}
                    onClick={() => setSelected(c.id)}
                    className={cx('card w-full p-4 text-left transition-colors', isActive ? 'border-gold/45' : 'hover:border-line-strong')}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0 font-serif text-[19px] leading-tight text-ivory">{c.name}</span>
                      <Badge tone={STATUS_TONE[c.status]}>{label(c.status)}</Badge>
                    </span>
                    <span className="mt-1 block text-[12px] text-ivory-mute">
                      {c.startDate ? `${formatDate(c.startDate)}${c.endDate ? ` to ${formatDate(c.endDate)}` : ''}` : 'No dates set'}
                    </span>
                    <span className="mt-3 block">
                      <ProgressBar percent={progress.percent} label={`${c.name} progress`} />
                    </span>
                    <span className="mt-1.5 block text-[12px] text-ivory-mute">
                      {progress.total === 0 ? 'No tasks yet' : `${progress.done} of ${progress.total} tasks done`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {active && (
            <CampaignDetail
              key={active.id}
              campaign={active}
              tasks={tasks.items.filter((t) => t.campaignId === active.id)}
              currency={currency}
              onEdit={() => setEditing(active)}
              onDelete={() => setDeleting(active)}
              onStatus={(status) => void campaigns.update(active.id, { status })}
              taskApi={tasks}
            />
          )}
        </div>
      )}

      {editing && (
        <CampaignModal
          campaign={editing === 'new' ? null : editing}
          currency={currency}
          bookChannels={book.channels}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            const saved = editing === 'new' ? await campaigns.create({ ...data, bookId: book.id }) : await campaigns.update(editing.id, data);
            if (saved) {
              setSelected(saved.id);
              setEditing(null);
            }
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this campaign?"
          confirmLabel="Delete campaign"
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            if (await campaigns.remove(deleting.id)) {
              await tasks.reload();
              setDeleting(null);
              setSelected('');
            }
          }}
          body={
            <>
              "{deleting.name}" and its tasks will be permanently deleted. Drafts and calendar items linked to it are kept.
            </>
          }
        />
      )}
    </>
  );
}

function CampaignDetail({
  campaign: c,
  tasks,
  currency,
  onEdit,
  onDelete,
  onStatus,
  taskApi,
}: {
  campaign: Campaign;
  tasks: Task[];
  currency: string;
  onEdit: () => void;
  onDelete: () => void;
  onStatus: (status: Campaign['status']) => void;
  taskApi: EntityList<'tasks'>;
}) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [milestone, setMilestone] = useState(false);
  const [adding, setAdding] = useState(false);
  const progress = campaignProgress(tasks);
  const budget = budgetStatus(c);
  const today = todayISO();

  const addTask = async () => {
    if (title.trim() === '') return;
    setAdding(true);
    const created = await taskApi.create({
      bookId: c.bookId, campaignId: c.id, title, dueDate: due, isMilestone: milestone,
      sortOrder: tasks.reduce((max, t) => Math.max(max, t.sortOrder), 0) + 1,
    });
    setAdding(false);
    if (created) {
      setTitle('');
      setDue('');
      setMilestone(false);
    }
  };

  return (
    <Card as="article" className="animate-rise">
      <header className="flex items-start justify-between gap-4 border-b border-line p-6">
        <div className="min-w-0">
          <p className="eyebrow mb-1.5">Campaign</p>
          <h2 className="font-serif text-[30px] font-medium leading-tight text-ivory">{c.name}</h2>
          <p className="mt-1 text-[13px] text-ivory-mute">
            {c.startDate
              ? `${formatDate(c.startDate, { month: 'long', day: 'numeric', year: 'numeric' })}${c.endDate ? ` to ${formatDate(c.endDate, { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}`
              : 'No dates set'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Select aria-label="Campaign status" value={c.status} onChange={(e) => onStatus(e.target.value as Campaign['status'])} className="w-36">
            {CAMPAIGN_STATUS.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </Select>
          <IconButton icon={Pencil} label="Edit campaign" onClick={onEdit} />
          <IconButton icon={Trash2} label="Delete campaign" onClick={onDelete} />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-x-10 gap-y-6 border-b border-line p-6">
        <Detail title="Objective" value={c.objective} empty="No objective written yet." />
        <Detail title="Audience" value={c.audience} empty="No audience described yet." />
        <div>
          <h3 className="mb-2 text-2xs uppercase text-ivory-mute">Channels</h3>
          {c.channels.length === 0 ? (
            <p className="text-[13px] text-ivory-mute">None selected.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {c.channels.map((ch) => (
                <Badge key={ch}>{ch}</Badge>
              ))}
            </div>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-2xs uppercase text-ivory-mute">Budget</h3>
          {c.budgetCents === 0 && c.spentCents === 0 ? (
            <p className="text-[13px] text-ivory-mute">No budget set.</p>
          ) : (
            <>
              <p className="mb-2 text-[13px] text-ivory-dim">
                <span className="font-medium text-ivory">{formatMoney(c.spentCents, currency)}</span> spent
                {c.budgetCents > 0 && <> of {formatMoney(c.budgetCents, currency)}</>}
                {c.budgetCents > 0 && (
                  <span className={cx('ml-2', budget.over ? 'text-danger' : 'text-ivory-mute')}>
                    {budget.over ? `${formatMoney(-budget.remaining, currency)} over` : `${formatMoney(budget.remaining, currency)} left`}
                  </span>
                )}
              </p>
              {c.budgetCents > 0 && <ProgressBar percent={budget.percent} tone={budget.over ? 'danger' : 'olive'} label="Budget used" />}
            </>
          )}
        </div>
        {c.notes && <div className="col-span-2"><Detail title="Notes" value={c.notes} empty="" /></div>}
      </div>

      <section className="p-6" aria-label="Tasks and milestones">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13.5px] font-semibold tracking-wide text-ivory">Tasks and milestones</h3>
          <span className="text-[12px] text-ivory-mute">{progress.total === 0 ? 'Nothing added yet' : `${progress.percent}% complete`}</span>
        </div>
        {progress.total > 0 && <div className="mb-4"><ProgressBar percent={progress.percent} label="Campaign progress" /></div>}

        <ul className="mb-4">
          {tasks.map((t) => {
            const overdue = !t.done && !!t.dueDate && t.dueDate < today;
            return (
              <li key={t.id} className="group flex items-center gap-3 border-b border-line/70 py-2.5 last:border-0">
                <input
                  type="checkbox"
                  checked={t.done}
                  aria-label={`Mark "${t.title}" as ${t.done ? 'not done' : 'done'}`}
                  onChange={() => void taskApi.update(t.id, { done: !t.done })}
                  className="shrink-0"
                />
                {t.isMilestone && <Milestone size={14} className="shrink-0 text-gold" aria-label="Milestone" />}
                <span className={cx('min-w-0 flex-1 truncate text-[13.5px]', t.done ? 'text-ivory-mute line-through' : 'text-ivory')}>{t.title}</span>
                {t.dueDate && <span className={cx('shrink-0 text-[12px]', overdue ? 'text-danger' : 'text-ivory-mute')}>{t.done ? formatDate(t.dueDate) : relativeDay(t.dueDate, today)}</span>}
                <IconButton icon={Trash2} label={`Delete task "${t.title}"`} onClick={() => void taskApi.remove(t.id)} className="opacity-0 focus:opacity-100 group-hover:opacity-100" />
              </li>
            );
          })}
        </ul>

        <form
          className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-ink-900/50 p-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void addTask();
          }}
        >
          <Input aria-label="New task" placeholder="Add a task or milestone" value={title} maxLength={240} onChange={(e) => setTitle(e.target.value)} className="min-w-[200px] flex-1" />
          <Input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-40" />
          <label className="flex cursor-pointer items-center gap-2 px-1 text-[12.5px] text-ivory-dim">
            <input type="checkbox" checked={milestone} onChange={(e) => setMilestone(e.target.checked)} className="h-4 w-4" />
            Milestone
          </label>
          <Button type="submit" icon={Plus} loading={adding} disabled={title.trim() === ''}>
            Add
          </Button>
        </form>
      </section>
    </Card>
  );
}

function Detail({ title, value, empty }: { title: string; value: string; empty: string }) {
  return (
    <div>
      <h3 className="mb-2 text-2xs uppercase text-ivory-mute">{title}</h3>
      <p className={cx('whitespace-pre-line text-[13.5px] leading-6', value ? 'text-ivory-dim' : 'text-ivory-mute')}>{value || empty}</p>
    </div>
  );
}

type CampaignData = Pick<Campaign, 'name' | 'objective' | 'audience' | 'channels' | 'startDate' | 'endDate' | 'budgetCents' | 'spentCents' | 'status' | 'notes'>;

function CampaignModal({
  campaign,
  currency,
  bookChannels,
  onClose,
  onSave,
}: {
  campaign: Campaign | null;
  currency: string;
  bookChannels: string[];
  onClose: () => void;
  onSave: (data: CampaignData) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: campaign?.name ?? '',
    objective: campaign?.objective ?? '',
    audience: campaign?.audience ?? '',
    channels: campaign?.channels ?? [],
    startDate: campaign?.startDate ?? '',
    endDate: campaign?.endDate ?? '',
    budget: campaign && campaign.budgetCents ? String(campaign.budgetCents / 100) : '',
    spent: campaign && campaign.spentCents ? String(campaign.spentCents / 100) : '',
    status: campaign?.status ?? ('planning' as Campaign['status']),
    notes: campaign?.notes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const options = Array.from(new Set([...bookChannels, ...CHANNEL_OPTIONS]));

  const submit = async () => {
    const e: Record<string, string> = {};
    if (form.name.trim() === '') e.name = 'Name the campaign';
    if (form.startDate && form.endDate && form.endDate < form.startDate) e.endDate = 'The end date is before the start date';
    const budgetCents = form.budget.trim() === '' ? 0 : parseMoneyToCents(form.budget);
    const spentCents = form.spent.trim() === '' ? 0 : parseMoneyToCents(form.spent);
    if (budgetCents === null) e.budget = 'Enter an amount such as 250 or 250.00';
    if (spentCents === null) e.spent = 'Enter an amount such as 80 or 80.50';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    await onSave({
      name: form.name, objective: form.objective, audience: form.audience, channels: form.channels, startDate: form.startDate,
      endDate: form.endDate, budgetCents: budgetCents!, spentCents: spentCents!, status: form.status, notes: form.notes,
    });
    setSaving(false);
  };

  return (
    <Modal
      title={campaign ? 'Edit campaign' : 'New campaign'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {campaign ? 'Save changes' : 'Create campaign'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Field label="Campaign name" error={errors.name} className="col-span-2">
          {(p) => <Input {...p} value={form.name} maxLength={160} onChange={(e) => set('name', e.target.value)} placeholder="For example, Launch week" data-autofocus />}
        </Field>
        <Field label="Objective" optional hint="What should this campaign achieve?" className="col-span-2">
          {(p) => <Textarea {...p} rows={2} value={form.objective} maxLength={1500} onChange={(e) => set('objective', e.target.value)} />}
        </Field>
        <Field label="Audience" optional className="col-span-2">
          {(p) => <Textarea {...p} rows={2} value={form.audience} maxLength={1500} onChange={(e) => set('audience', e.target.value)} />}
        </Field>
        <div className="col-span-2">
          <p className="mb-2 text-[12.5px] font-medium text-ivory-dim">Channels</p>
          <Chips label="Campaign channels" options={options} value={form.channels} onChange={(v) => set('channels', v)} />
        </div>
        <Field label="Start date" optional>
          {(p) => <Input {...p} type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />}
        </Field>
        <Field label="End date" optional error={errors.endDate}>
          {(p) => <Input {...p} type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />}
        </Field>
        <Field label={`Budget (${currency})`} optional error={errors.budget}>
          {(p) => <Input {...p} inputMode="decimal" value={form.budget} onChange={(e) => set('budget', e.target.value)} placeholder="0" />}
        </Field>
        <Field label={`Spent so far (${currency})`} optional error={errors.spent}>
          {(p) => <Input {...p} inputMode="decimal" value={form.spent} onChange={(e) => set('spent', e.target.value)} placeholder="0" />}
        </Field>
        <Field label="Status">
          {(p) => (
            <Select {...p} value={form.status} onChange={(e) => set('status', e.target.value as Campaign['status'])}>
              {CAMPAIGN_STATUS.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Notes" optional className="col-span-2">
          {(p) => <Textarea {...p} rows={3} value={form.notes} maxLength={4000} onChange={(e) => set('notes', e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}
