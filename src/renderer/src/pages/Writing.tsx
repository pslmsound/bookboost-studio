// Content Studio, Email and AI Assistant. All three are views over the same
// drafts library, filtered by the kind of writing.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FileText, Info, Mail, Plus, Search, Sparkles } from 'lucide-react';
import { DRAFT_KIND_LABELS, label, type DraftKind } from '@shared/schema';
import { ASSISTANT_TEMPLATES, type AssistantTemplate } from '@shared/prompts';
import { formatDate } from '@shared/domain';
import { AiSetupNotice, useAi } from '../lib/ai';
import { useApp, useEntityList } from '../lib/store';
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Modal, Notice, PageHeader, STATUS_TONE, Select, Spinner, Textarea, cx } from '../components/ui';
import { DraftEditor } from '../components/DraftEditor';

const CONTENT_KINDS: DraftKind[] = [
  'social_caption', 'launch_announcement', 'newsletter', 'ad_copy', 'press_release', 'book_description', 'podcast_pitch', 'video_script', 'outreach_pitch',
];
const EMAIL_KINDS: DraftKind[] = ['email', 'newsletter'];
const ASSISTANT_KINDS: DraftKind[] = ['marketing_plan', 'brand_voice', 'recommendations', 'note'];

function DraftWorkspace({
  kinds,
  emailFields,
  emptyIcon,
  emptyTitle,
  emptyBody,
  selectId,
  newLabel,
  canCreate = true,
  registerCreate,
}: {
  kinds: DraftKind[];
  emailFields?: boolean;
  emptyIcon: typeof FileText;
  emptyTitle: string;
  emptyBody: string;
  /** A draft to select, for example one just created by the assistant. */
  selectId?: string;
  newLabel: string;
  canCreate?: boolean;
  registerCreate?: (open: () => void) => void;
}) {
  const { activeBook, pageParam } = useApp();
  const book = activeBook!;
  const drafts = useEntityList('drafts', { bookId: book.id });
  const [selected, setSelected] = useState(selectId ?? pageParam ?? '');
  const [kindFilter, setKindFilter] = useState<DraftKind | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (selectId) {
      setSelected(selectId);
      void drafts.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectId]);
  useEffect(() => registerCreate?.(() => setCreating(true)), [registerCreate]);

  const mine = useMemo(() => drafts.items.filter((d) => kinds.includes(d.kind)), [drafts.items, kinds]);
  const archivedCount = mine.filter((d) => d.status === 'archived').length;
  const visible = mine.filter(
    (d) =>
      (kindFilter === 'all' || d.kind === kindFilter) &&
      (showArchived ? d.status === 'archived' : d.status !== 'archived') &&
      (query.trim() === '' || `${d.title} ${d.body}`.toLowerCase().includes(query.trim().toLowerCase())),
  );
  // With nothing chosen, open the most recent draft so the editor is never empty.
  const active = mine.find((d) => d.id === selected) ?? visible[0] ?? null;

  if (drafts.loading) return <Card><Spinner /></Card>;
  if (drafts.error) return <ErrorNote message={drafts.error} onRetry={() => void drafts.reload()} />;

  return (
    <>
      {mine.length === 0 ? (
        <Card>
          <EmptyState
            icon={emptyIcon}
            title={emptyTitle}
            body={emptyBody}
            action={
              canCreate ? (
                <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                  {newLabel}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-[300px_minmax(0,1fr)] gap-5" style={{ height: 'max(620px, calc(100vh - 250px))' }}>
          <Card className="flex min-h-0 flex-col">
            <div className="space-y-2 border-b border-line p-3">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ivory-mute" aria-hidden />
                <Input aria-label="Search drafts" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
              </div>
              {kinds.length > 2 && (
                <Select aria-label="Filter by type" value={kindFilter} onChange={(e) => setKindFilter(e.target.value as DraftKind | 'all')}>
                  <option value="all">All types</option>
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {DRAFT_KIND_LABELS[k]}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto p-1.5" aria-label="Drafts">
              {visible.length === 0 && <li className="px-3 py-8 text-center text-[12.5px] text-ivory-mute">Nothing matches.</li>}
              {visible.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    aria-current={d.id === active?.id}
                    onClick={() => setSelected(d.id)}
                    className={cx(
                      'w-full rounded-md px-3 py-2.5 text-left transition-colors',
                      d.id === active?.id ? 'bg-ink-750' : 'hover:bg-ink-800',
                    )}
                  >
                    <span className="block truncate text-[13px] font-medium text-ivory">{d.title}</span>
                    <span className="mt-1 flex items-center gap-2 text-[11.5px] text-ivory-mute">
                      <span className="truncate">{DRAFT_KIND_LABELS[d.kind]}</span>
                      <span aria-hidden>·</span>
                      <span className="shrink-0">{formatDate(d.updatedAt.slice(0, 10))}</span>
                      <span className="flex-1" />
                      {d.status !== 'draft' && <Badge tone={STATUS_TONE[d.status]}>{label(d.status)}</Badge>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {archivedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="border-t border-line px-4 py-2.5 text-left text-[12px] text-ivory-mute hover:text-ivory"
              >
                {showArchived ? 'Back to current drafts' : `Show archived (${archivedCount})`}
              </button>
            )}
          </Card>

          <Card className="min-h-0 overflow-hidden">
            {active ? (
              <DraftEditor
                key={active.id}
                draft={active}
                emailFields={emailFields}
                onChanged={() => void drafts.reload()}
                onDeleted={() => {
                  setSelected('');
                  void drafts.reload();
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <EmptyState compact icon={emptyIcon} title="Select a draft" body="Choose one from the list to keep working on it." />
              </div>
            )}
          </Card>
        </div>
      )}

      {creating && (
        <NewDraftModal
          kinds={kinds.filter((k) => !ASSISTANT_KINDS.includes(k) || kinds.every((x) => ASSISTANT_KINDS.includes(x)))}
          onClose={() => setCreating(false)}
          onCreate={async (kind, title) => {
            const created = await drafts.create({ bookId: book.id, kind, title });
            if (created) {
              setSelected(created.id);
              setShowArchived(false);
              setKindFilter('all');
              setQuery('');
              setCreating(false);
            }
          }}
        />
      )}
    </>
  );
}

function NewDraftModal({ kinds, onClose, onCreate }: { kinds: DraftKind[]; onClose: () => void; onCreate: (kind: DraftKind, title: string) => Promise<void> }) {
  const [kind, setKind] = useState<DraftKind>(kinds[0]);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    await onCreate(kind, title.trim() || `${DRAFT_KIND_LABELS[kind]}, ${formatDate(new Date().toISOString().slice(0, 10))}`);
    setSaving(false);
  };
  return (
    <Modal
      title="New draft"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            Create draft
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {kinds.length > 1 && (
          <Field label="What are you writing?">
            {(p) => (
              <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as DraftKind)} data-autofocus>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {DRAFT_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Title" optional hint="A working title for your own reference.">
          {(p) => <Input {...p} value={title} maxLength={240} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <p className="text-[12.5px] leading-5 text-ivory-mute">The draft opens ready to write. You can ask the AI assistant for a first version from inside the editor.</p>
      </form>
    </Modal>
  );
}

function useCreateTrigger(): [(open: () => void) => void, () => void] {
  const [open, setOpen] = useState<(() => void) | null>(null);
  return [useMemo(() => (fn: () => void) => setOpen(() => fn), []), () => open?.()];
}

export function ContentStudio() {
  const [register, create] = useCreateTrigger();
  return (
    <>
      <PageHeader
        eyebrow="Write"
        title="Content Studio"
        description="Captions, announcements, ad drafts, press releases and more. Write by hand or start from an AI draft, then refine and approve."
        actions={
          <Button variant="primary" icon={Plus} onClick={create}>
            New draft
          </Button>
        }
      />
      <DraftWorkspace
        kinds={CONTENT_KINDS}
        emptyIcon={FileText}
        emptyTitle="Your first draft starts here"
        emptyBody="Create a caption, a launch announcement or a book description. Everything you write is saved on this computer."
        newLabel="New draft"
        registerCreate={register}
      />
    </>
  );
}

export function EmailPage() {
  const [register, create] = useCreateTrigger();
  return (
    <>
      <PageHeader
        eyebrow="Reach your list"
        title="Email"
        description="Compose newsletters and campaign emails for your own subscribers, with subject lines, preview text and a clean HTML export."
        actions={
          <Button variant="primary" icon={Plus} onClick={create}>
            New email
          </Button>
        }
      />
      <div className="mb-5">
        <Notice icon={Info} tone="olive">
          The studio does not send email. When an email is approved, export it as HTML or copy the text into your email service, and send
          only to people who have subscribed to hear from you.
        </Notice>
      </div>
      <DraftWorkspace
        kinds={EMAIL_KINDS}
        emailFields
        emptyIcon={Mail}
        emptyTitle="No emails yet"
        emptyBody="Draft a launch email or a newsletter issue. You approve it here, then send it from your own email service."
        newLabel="New email"
        registerCreate={register}
      />
    </>
  );
}

export function AssistantPage() {
  const { activeBook, toast } = useApp();
  const book = activeBook!;
  const ai = useAi();
  const drafts = useEntityList('drafts', null);
  const [template, setTemplate] = useState<AssistantTemplate>('marketing_plan');
  const [question, setQuestion] = useState('');
  const [createdId, setCreatedId] = useState('');
  const thin = !book.summary.trim() || !book.audience.trim();

  const generate = async () => {
    const result = await ai.run({ type: 'assistant', bookId: book.id, template, question });
    if (!result) return;
    const spec = ASSISTANT_TEMPLATES[template];
    const title =
      template === 'question'
        ? question.trim().slice(0, 80) || 'Assistant note'
        : `${spec.label}, ${formatDate(new Date().toISOString().slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const created = await drafts.create({
      bookId: book.id, kind: spec.kind, title, body: result.text, source: 'ai', aiProvider: result.provider, aiModel: result.model,
    });
    if (created) {
      setCreatedId(created.id);
      setQuestion('');
      toast('Saved to your assistant library below.');
    }
  };

  let panel: ReactNode;
  if (!ai.ready) {
    panel = <AiSetupNotice onSetup={ai.goToSettings} />;
  } else {
    panel = (
      <>
        <div role="radiogroup" aria-label="What would you like help with?" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {(Object.keys(ASSISTANT_TEMPLATES) as AssistantTemplate[]).map((key) => {
            const t = ASSISTANT_TEMPLATES[key];
            const active = key === template;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTemplate(key)}
                className={cx(
                  'rounded-lg border p-4 text-left transition-colors',
                  active ? 'border-gold/60 bg-gold/[0.05]' : 'border-line bg-ink-900/50 hover:border-line-strong',
                )}
              >
                <span className={cx('block text-[13.5px] font-medium', active ? 'text-gold-pale' : 'text-ivory')}>{t.label}</span>
                <span className="mt-1 block text-[12.5px] leading-5 text-ivory-mute">{t.description}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex items-end gap-3">
          <Field className="flex-1" label={template === 'question' ? 'Your question' : 'Anything specific to focus on?'} optional={template !== 'question'}>
            {(p) => (
              <Textarea
                {...p}
                rows={2}
                value={question}
                maxLength={4000}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={template === 'question' ? 'For example: how should I approach book clubs for this title?' : 'For example: I have about five hours a week and a small budget.'}
              />
            )}
          </Field>
          <Button variant="primary" icon={Sparkles} onClick={generate} loading={ai.busy} disabled={template === 'question' && question.trim() === ''} className="mb-px">
            Generate
          </Button>
        </div>
        {thin && (
          <p className="mt-3 text-[12.5px] text-ivory-mute">
            Tip: this book is missing a summary or target readers. Adding them in My Books will make the results far more specific.
          </p>
        )}
        {ai.busy && <Spinner label="Thinking it through. Longer plans can take up to a minute." />}
        {ai.error && <div className="mt-3"><ErrorNote message={ai.error} /></div>}
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Plan with help"
        title="AI Assistant"
        description={`Strategy and guidance written for "${book.title}". Results are saved below so you can edit, revise and export them.`}
      />
      <Card className="mb-5 p-5">{panel}</Card>
      <DraftWorkspace
        kinds={ASSISTANT_KINDS}
        selectId={createdId}
        emptyIcon={Sparkles}
        emptyTitle="Nothing generated yet"
        emptyBody="Plans, voice guides and answers you generate will be kept here."
        newLabel="New note"
        canCreate={false}
      />
      {ai.consentModal}
    </>
  );
}
