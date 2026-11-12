// The writing surface used by Content Studio, Email, the AI Assistant and
// outreach pitches. Saves automatically, keeps a version history, and never
// replaces the author's words with AI output without an explicit choice.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarPlus, Check, Copy, Download, Eye, History, PenLine, Sparkles, Trash2, WandSparkles, X } from 'lucide-react';
import { CHANNEL_OPTIONS, DRAFT_KIND_LABELS, DRAFT_STATUS, label, type Draft, type DraftRevision } from '@shared/schema';
import { CONTENT_GUIDES } from '@shared/prompts';
import { formatDate, todayISO, wordCount } from '@shared/domain';
import { toEmailHtml } from '@shared/markdown';
import type { GenerateRequest } from '@shared/api';
import { call, db, errorMessage } from '../lib/api';
import { AiSetupNotice, useAi } from '../lib/ai';
import { useApp } from '../lib/store';
import { Badge, Button, ConfirmDialog, ErrorNote, Field, IconButton, Input, Modal, Segmented, Select, Spinner, Textarea, cx } from './ui';
import { Markdown } from './common';

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

/** Pulls "Subject:" and "Preview:" lines off the top of an AI written email. */
export function splitEmailHeader(text: string): { subject: string; preheader: string; body: string } {
  const lines = text.split('\n');
  let subject = '';
  let preheader = '';
  let i = 0;
  for (; i < Math.min(lines.length, 6); i++) {
    const line = lines[i].replace(/\*\*/g, '').trim();
    const s = /^subject(?: line)?:\s*(.+)$/i.exec(line);
    const p = /^(?:preview|preheader|preview line|preview text):\s*(.+)$/i.exec(line);
    if (s && !subject) subject = s[1].trim();
    else if (p && !preheader) preheader = p[1].trim();
    else if (line !== '') break;
  }
  return subject || preheader ? { subject, preheader, body: lines.slice(i).join('\n').trim() } : { subject: '', preheader: '', body: text };
}

export function DraftEditor({
  draft,
  onChanged,
  onDeleted,
  emailFields = false,
}: {
  draft: Draft;
  onChanged: () => void;
  onDeleted: () => void;
  emailFields?: boolean;
}) {
  const { toast, navigate } = useApp();
  const ai = useAi();
  const [title, setTitle] = useState(draft.title);
  const [subject, setSubject] = useState(draft.subject);
  const [preheader, setPreheader] = useState(draft.preheader);
  const [body, setBody] = useState(draft.body);
  const [status, setStatus] = useState(draft.status);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [aiMode, setAiMode] = useState<'generate' | 'revise' | null>(null);
  const [aiInput, setAiInput] = useState('');
  const [proposal, setProposal] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const saved = useRef({ title: draft.title, subject: draft.subject, preheader: draft.preheader, body: draft.body, status: draft.status });
  const current = useRef({ title, subject, preheader, body, status });
  current.current = { title, subject, preheader, body, status };
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  const guide = CONTENT_GUIDES[draft.kind];
  const showEmail = emailFields || draft.kind === 'email' || draft.kind === 'newsletter' || draft.kind === 'outreach_pitch' || draft.kind === 'podcast_pitch';

  const isDirty = () => {
    const a = saved.current;
    const b = current.current;
    return a.title !== b.title || a.subject !== b.subject || a.preheader !== b.preheader || a.body !== b.body || a.status !== b.status;
  };

  const save = useCallback(
    async (snapshot = false): Promise<boolean> => {
      if (!isDirty()) return true;
      const next = { ...current.current };
      if (next.title.trim() === '') next.title = saved.current.title;
      setSaveState('saving');
      try {
        await db.update('drafts', draft.id, next, snapshot);
        saved.current = next;
        setSaveState(isDirty() ? 'dirty' : 'saved');
        onChangedRef.current();
        return true;
      } catch (e) {
        setSaveState('error');
        toast(errorMessage(e), 'error');
        return false;
      }
    },
    [draft.id, toast],
  );

  // Autosave shortly after typing stops.
  useEffect(() => {
    if (!isDirty()) return;
    setSaveState('dirty');
    const timer = window.setTimeout(() => void save(), 1400);
    return () => window.clearTimeout(timer);
  }, [title, subject, preheader, body, status, save]);

  // Save on Ctrl+S, when leaving the editor, and when the window closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    const unregister = window.bookboost.onBeforeClose(() => save());
    return () => {
      window.removeEventListener('keydown', onKey);
      unregister();
      void save();
    };
  }, [save]);

  const runAi = async () => {
    setProposal(null);
    const request: GenerateRequest =
      aiMode === 'revise'
        ? { type: 'revise', bookId: draft.bookId, body, instruction: aiInput }
        : { type: 'content', bookId: draft.bookId, kind: draft.kind, brief: aiInput, contactId: draft.contactId || undefined };
    const result = await ai.run(request);
    if (result) setProposal(result.text);
  };

  const applyProposal = async (how: 'replace' | 'append') => {
    if (proposal === null) return;
    await save(); // Keep what the author has now before changing it.
    let text = proposal;
    const next = { ...current.current };
    if (showEmail && how === 'replace') {
      const parts = splitEmailHeader(proposal);
      if (parts.subject) next.subject = parts.subject;
      if (parts.preheader) next.preheader = parts.preheader;
      text = parts.body;
    }
    next.body = how === 'replace' ? text : `${body.trimEnd()}\n\n${text}`.trim();
    setSubject(next.subject);
    setPreheader(next.preheader);
    setBody(next.body);
    current.current = next;
    setProposal(null);
    setAiMode(null);
    setAiInput('');
    window.setTimeout(() => void save(true), 0);
  };

  const copy = async () => {
    try {
      const text = showEmail && subject ? `Subject: ${subject}\n\n${body}` : body;
      await navigator.clipboard.writeText(text);
      toast('Copied to the clipboard.');
    } catch {
      toast('Copying was blocked. Select the text and press Ctrl+C instead.', 'error');
    }
  };

  const exportAs = async (format: 'txt' | 'md' | 'html') => {
    try {
      const header = showEmail && subject ? `Subject: ${subject}\n${preheader ? `Preview: ${preheader}\n` : ''}\n` : '';
      const content = format === 'html' ? toEmailHtml({ subject: subject || title, preheader, body }) : format === 'md' ? `# ${title}\n\n${header}${body}\n` : `${header}${body}\n`;
      const path = await call<string | null>('export:text', { name: title, content, format });
      if (path) toast(`Saved to ${path}`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const remove = async () => {
    try {
      saved.current = { ...current.current }; // Nothing left to save.
      await db.remove('drafts', draft.id);
      toast('Draft deleted.');
      onDeleted();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const stateText = { saved: 'All changes saved', dirty: 'Unsaved changes', saving: 'Saving', error: 'Could not save' }[saveState];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Title row */}
      <div className="flex items-start gap-3 border-b border-line px-6 pb-4 pt-5">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <Badge tone="olive">{DRAFT_KIND_LABELS[draft.kind]}</Badge>
            {draft.source === 'ai' && <Badge>AI assisted{draft.aiModel ? ` · ${draft.aiModel}` : ''}</Badge>}
            <span role="status" className={cx('ml-1 inline-flex items-center gap-1.5 text-[12px]', saveState === 'error' ? 'text-danger' : 'text-ivory-mute')}>
              {saveState === 'saved' && <Check size={12} className="text-ok" aria-hidden />}
              {stateText}
            </span>
          </div>
          <input
            aria-label="Draft title"
            value={title}
            maxLength={240}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent font-serif text-[26px] leading-tight text-ivory placeholder:text-ivory-mute focus:outline-none"
            placeholder="Untitled draft"
          />
        </div>
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as Draft['status'])} className="mt-1 w-36">
          {DRAFT_STATUS.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </Select>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-6 py-2.5">
        <Segmented
          label="Editor mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'write', label: 'Write' },
            { value: 'preview', label: 'Preview' },
          ]}
        />
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        {guide && (
          <Button size="sm" variant={aiMode === 'generate' ? 'secondary' : 'ghost'} icon={Sparkles} onClick={() => { setAiMode(aiMode === 'generate' ? null : 'generate'); setProposal(null); ai.clearError(); }}>
            Draft with AI
          </Button>
        )}
        <Button size="sm" variant={aiMode === 'revise' ? 'secondary' : 'ghost'} icon={WandSparkles} disabled={body.trim() === ''} onClick={() => { setAiMode(aiMode === 'revise' ? null : 'revise'); setProposal(null); ai.clearError(); }}>
          Revise with AI
        </Button>
        <span className="flex-1" />
        <IconButton icon={CalendarPlus} label="Add to calendar" onClick={() => setScheduling(true)} />
        <IconButton icon={Copy} label="Copy text" onClick={copy} />
        <ExportMenu onExport={exportAs} html={showEmail} />
        <IconButton icon={History} label="Version history" onClick={() => setShowHistory(true)} />
        <IconButton icon={Trash2} label="Delete draft" onClick={() => setConfirmDelete(true)} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* AI panel */}
        {aiMode && (
          <div className="animate-rise border-b border-line bg-ink-900/60 px-6 py-4">
            {!ai.ready ? (
              <AiSetupNotice onSetup={ai.goToSettings} />
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <Field
                    className="flex-1"
                    label={aiMode === 'revise' ? 'How should this draft change?' : 'Brief for the assistant'}
                    hint={aiMode === 'revise' ? 'For example: make it shorter and warmer, or add a clearer call to action.' : 'Your book details are included automatically.'}
                  >
                    {(p) => (
                      <Textarea
                        {...p}
                        rows={2}
                        value={aiInput}
                        maxLength={4000}
                        onChange={(e) => setAiInput(e.target.value)}
                        placeholder={aiMode === 'generate' ? guide?.placeholder : undefined}
                        data-autofocus
                      />
                    )}
                  </Field>
                  <div className="flex flex-col gap-1.5 pt-[26px]">
                    <Button variant="primary" icon={Sparkles} onClick={runAi} loading={ai.busy} disabled={aiMode === 'revise' && aiInput.trim() === ''}>
                      {aiMode === 'revise' ? 'Revise' : 'Generate'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setAiMode(null); setProposal(null); }}>
                      Close
                    </Button>
                  </div>
                </div>
                {ai.busy && <Spinner label="Writing. This usually takes a few seconds." />}
                {ai.error && <div className="mt-3"><ErrorNote message={ai.error} /></div>}
                {proposal !== null && !ai.busy && (
                  <div className="mt-4 rounded-lg border border-gold/25 bg-ink-850">
                    <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                      <p className="text-[12.5px] font-medium text-gold-pale">Suggested draft. Review it before using.</p>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" icon={X} onClick={() => setProposal(null)}>
                          Discard
                        </Button>
                        {aiMode === 'generate' && body.trim() !== '' && (
                          <Button size="sm" onClick={() => void applyProposal('append')}>
                            Add below mine
                          </Button>
                        )}
                        <Button size="sm" variant="primary" icon={Check} onClick={() => void applyProposal('replace')}>
                          {body.trim() === '' ? 'Use this draft' : 'Replace my draft'}
                        </Button>
                      </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto px-5 py-4">
                      <Markdown source={proposal} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Email fields */}
        {showEmail && (
          <div className="grid grid-cols-2 gap-4 border-b border-line px-6 py-4">
            <Field label="Subject line">
              {(p) => <Input {...p} value={subject} maxLength={300} onChange={(e) => setSubject(e.target.value)} />}
            </Field>
            <Field label="Preview text" optional>
              {(p) => <Input {...p} value={preheader} maxLength={300} onChange={(e) => setPreheader(e.target.value)} />}
            </Field>
          </div>
        )}

        {/* Body */}
        <div className="px-6 py-5">
          {mode === 'write' ? (
            <textarea
              aria-label="Draft text"
              value={body}
              maxLength={80000}
              onChange={(e) => setBody(e.target.value)}
              spellCheck
              placeholder="Start writing here, or use Draft with AI for a first version."
              className="block min-h-[340px] w-full resize-y bg-transparent text-[14.5px] leading-7 text-ivory placeholder:text-ivory-mute focus:outline-none"
            />
          ) : (
            <div className="min-h-[340px]">
              <Markdown source={body} />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line px-6 py-2.5 text-[12px] text-ivory-mute">
        <span>
          {wordCount(body)} words · {body.length.toLocaleString()} characters
        </span>
        <span>Last saved {formatDate(draft.updatedAt.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      </div>

      {ai.consentModal}
      {showHistory && (
        <HistoryModal
          draftId={draft.id}
          onClose={() => setShowHistory(false)}
          onRestore={(text) => {
            setBody(text);
            current.current = { ...current.current, body: text };
            setShowHistory(false);
            window.setTimeout(() => void save(true), 0);
            toast('Earlier version restored. Your previous text was kept in the history.');
          }}
        />
      )}
      {scheduling && (
        <ScheduleModal
          draft={{ ...draft, title }}
          onClose={() => setScheduling(false)}
          onDone={() => {
            setScheduling(false);
            toast('Added to the calendar as a draft item.');
          }}
          onOpenCalendar={() => navigate('calendar')}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this draft?"
          body={<>"{title}" and its version history will be permanently deleted.</>}
          confirmLabel="Delete draft"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}

function ExportMenu({ onExport, html }: { onExport: (format: 'txt' | 'md' | 'html') => void; html: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const options: { format: 'txt' | 'md' | 'html'; text: string }[] = [
    { format: 'txt', text: 'Plain text (.txt)' },
    { format: 'md', text: 'Markdown (.md)' },
    ...(html ? [{ format: 'html' as const, text: 'Email HTML (.html)' }] : []),
  ];
  return (
    <div ref={ref} className="relative">
      <IconButton icon={Download} label="Export" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} />
      {open && (
        <div role="menu" className="animate-rise absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-line-strong bg-ink-800 p-1 shadow-modal">
          {options.map((o) => (
            <button
              key={o.format}
              type="button"
              role="menuitem"
              className="w-full rounded-md px-3 py-2 text-left text-[13px] text-ivory-dim hover:bg-ink-700 hover:text-ivory"
              onClick={() => {
                setOpen(false);
                onExport(o.format);
              }}
            >
              {o.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryModal({ draftId, onClose, onRestore }: { draftId: string; onClose: () => void; onRestore: (body: string) => void }) {
  const [revisions, setRevisions] = useState<DraftRevision[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    call<DraftRevision[]>('drafts:revisions', { draftId }).then(setRevisions).catch((e) => setError(errorMessage(e)));
  }, [draftId]);
  const active = revisions?.[selected];
  return (
    <Modal
      title="Version history"
      description="Earlier versions are kept as you write and whenever AI changes a draft."
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" disabled={!active} onClick={() => active && onRestore(active.body)}>
            Restore this version
          </Button>
        </>
      }
    >
      {error ? (
        <ErrorNote message={error} />
      ) : revisions === null ? (
        <Spinner />
      ) : revisions.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-ivory-mute">No earlier versions yet. They appear here as the draft changes.</p>
      ) : (
        <div className="grid grid-cols-[200px_1fr] gap-5">
          <ul className="space-y-1" aria-label="Versions">
            {revisions.map((r, i) => (
              <li key={r.id}>
                <button
                  type="button"
                  aria-current={i === selected}
                  onClick={() => setSelected(i)}
                  className={cx('w-full rounded-md px-3 py-2 text-left text-[12.5px]', i === selected ? 'bg-ink-700 text-ivory' : 'text-ivory-dim hover:bg-ink-800')}
                >
                  {new Date(r.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  <span className="block text-[11.5px] text-ivory-mute">{wordCount(r.body)} words</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="max-h-[420px] overflow-y-auto rounded-md border border-line bg-ink-900 p-4">
            <Markdown source={active?.body ?? ''} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function ScheduleModal({ draft, onClose, onDone, onOpenCalendar }: { draft: Draft; onClose: () => void; onDone: () => void; onOpenCalendar: () => void }) {
  const { toast, activeBook } = useApp();
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('');
  const [channel, setChannel] = useState('');
  const [saving, setSaving] = useState(false);
  const channels = Array.from(new Set([...(activeBook?.channels ?? []), ...CHANNEL_OPTIONS]));
  const submit = async () => {
    if (!date) return;
    setSaving(true);
    try {
      await db.create('calendarItems', { bookId: draft.bookId, draftId: draft.id, campaignId: draft.campaignId, title: draft.title, channel, scheduledDate: date, scheduledTime: time, status: 'draft' });
      onDone();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title="Add to calendar"
      description="This plans when you intend to post it. The studio does not publish for you."
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onOpenCalendar} icon={Eye}>
            Open calendar
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={PenLine} onClick={submit} loading={saving} disabled={!date}>
            Add
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date">{(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} data-autofocus />}</Field>
          <Field label="Time" optional>
            {(p) => <Input {...p} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}
          </Field>
        </div>
        <Field label="Channel" optional>
          {(p) => (
            <Select {...p} value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">Not set</option>
              {channels.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Modal>
  );
}
