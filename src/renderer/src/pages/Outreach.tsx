import { useEffect, useMemo, useState } from 'react';
import { Ban, Download, ExternalLink, FileText, Mail, MessageSquareText, Pencil, Plus, Search, Send, ShieldCheck, Trash2, Upload, Users } from 'lucide-react';
import { CONSENT, CONTACT_STATUS, CONTACT_TYPES, label, type Contact, type Draft } from '@shared/schema';
import type { ImportSummary } from '@shared/api';
import { addDays, canPitch, formatDate, pipelineCounts, relativeDay, todayISO } from '@shared/domain';
import { call, errorMessage } from '../lib/api';
import { useApp, useEntityList } from '../lib/store';
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, ErrorNote, Field, IconButton, Input, Modal, Notice, PageHeader, STATUS_TONE,
  Select, Spinner, Textarea, cx,
} from '../components/ui';
import { DraftEditor } from '../components/DraftEditor';

const CONSENT_HELP: Record<(typeof CONSENT)[number], string> = {
  unknown: 'You have not confirmed how this person prefers to be contacted.',
  public_contact: 'They publish a submission address or form and invite pitches.',
  opted_in: 'They have asked to hear from you or agreed to be contacted.',
  do_not_contact: 'They declined or asked not to be contacted. Pitching is blocked.',
};

export function Outreach() {
  const { activeBook, pageParam, toast } = useApp();
  const book = activeBook!;
  const contacts = useEntityList('contacts', { bookId: book.id });
  const pitches = useEntityList('drafts', { bookId: book.id, kind: 'outreach_pitch' });
  const [statusFilter, setStatusFilter] = useState<Contact['status'] | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<Contact['type'] | 'all'>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Contact | 'new' | null>(pageParam === 'new' ? 'new' : null);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const [pitchFor, setPitchFor] = useState<{ contact: Contact; draftId: string } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const today = todayISO();

  useEffect(() => {
    if (pageParam === 'new') setEditing('new');
  }, [pageParam]);

  const counts = useMemo(() => pipelineCounts(contacts.items), [contacts.items]);
  const visible = contacts.items.filter(
    (c) =>
      (statusFilter === 'all' || c.status === statusFilter) &&
      (typeFilter === 'all' || c.type === typeFilter) &&
      (query.trim() === '' || `${c.name} ${c.outlet} ${c.notes}`.toLowerCase().includes(query.trim().toLowerCase())),
  );

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const importCsv = () =>
    run(async () => {
      const result = await call<ImportSummary>('import:csv', { dataset: 'contacts', bookId: book.id });
      if (result.canceled) return;
      await contacts.reload();
      setSummary(result);
    });
  const template = () =>
    run(async () => {
      const path = await call<string | null>('import:template', { dataset: 'contacts' });
      if (path) toast(`Template saved to ${path}`);
    });
  const exportCsv = () =>
    run(async () => {
      const path = await call<string | null>('export:csv', { dataset: 'contacts', bookId: book.id });
      if (path) toast(`Saved to ${path}`);
    });

  const openPitch = async (contact: Contact) => {
    const existing = pitches.items.find((d) => d.contactId === contact.id && d.status !== 'archived');
    if (existing) return setPitchFor({ contact, draftId: existing.id });
    const created = await pitches.create({ bookId: book.id, kind: 'outreach_pitch', title: `Pitch to ${contact.name}`, contactId: contact.id });
    if (created) setPitchFor({ contact, draftId: created.id });
  };

  const logContact = async (contact: Contact) => {
    if (!canPitch(contact)) {
      toast('Record how this person agreed to be contacted before logging a pitch. Edit the contact and set their consent.', 'error');
      return;
    }
    const status = contact.status === 'prospect' || contact.status === 'ready' ? 'pitched' : contact.status === 'pitched' ? 'follow_up' : contact.status;
    const updated = await contacts.update(contact.id, { lastContacted: today, status, nextFollowUp: addDays(today, 7) });
    if (updated) toast(`Logged today's contact with ${contact.name}. Follow up set for ${formatDate(addDays(today, 7))}.`);
  };

  const header = (
    <PageHeader
      eyebrow="Relationships"
      title="Outreach"
      description="Keep track of reviewers, podcast hosts, booksellers and media. Write each pitch personally, and record how each person prefers to be contacted."
      actions={
        <>
          <Button icon={Upload} onClick={importCsv}>
            Import CSV
          </Button>
          <Button icon={Download} onClick={exportCsv} disabled={contacts.items.length === 0}>
            Export
          </Button>
          <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
            Add contact
          </Button>
        </>
      }
    />
  );

  if (contacts.loading) return <>{header}<Card><Spinner /></Card></>;

  return (
    <>
      {header}
      {contacts.error && <div className="mb-5"><ErrorNote message={contacts.error} onRetry={() => void contacts.reload()} /></div>}

      {contacts.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="Start your outreach list"
            body="Add the people you would like to reach one at a time, or import a spreadsheet you already keep."
            action={
              <>
                <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
                  Add contact
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
          <div role="group" aria-label="Filter by stage" className="mb-5 grid grid-cols-4 gap-3 xl:grid-cols-8">
            <StageTile text="All contacts" count={contacts.items.length} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
            {CONTACT_STATUS.map((s) => (
              <StageTile key={s} text={label(s)} count={counts[s]} active={statusFilter === s} onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)} />
            ))}
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
              <div className="relative w-72">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ivory-mute" aria-hidden />
                <Input aria-label="Search contacts" placeholder="Search by name, outlet or notes" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
              </div>
              <Select aria-label="Filter by type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as Contact['type'] | 'all')} className="w-44">
                <option value="all">All types</option>
                {CONTACT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {label(t)}
                  </option>
                ))}
              </Select>
              <span className="flex-1" />
              <button type="button" onClick={template} className="text-[12.5px] text-gold hover:text-gold-pale">
                Get CSV template
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-[13px]">
                <thead>
                  <tr className="whitespace-nowrap border-b border-line text-2xs uppercase text-ivory-mute">
                    <th scope="col" className="px-5 py-2.5 font-medium">Contact</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Stage</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Consent</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Last contact</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Follow up</th>
                    <th scope="col" className="px-5 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-ivory-mute">
                        No contacts match these filters.
                      </td>
                    </tr>
                  )}
                  {visible.map((c) => {
                    const blocked = c.consent === 'do_not_contact';
                    const overdue = !!c.nextFollowUp && c.nextFollowUp < today && !['booked', 'declined'].includes(c.status);
                    return (
                      <tr key={c.id} className="border-b border-line/70 last:border-0 hover:bg-ink-800/50">
                        <td className="px-5 py-3">
                          <p className="font-medium text-ivory">{c.name}</p>
                          <p className="text-[12px] text-ivory-mute">
                            {label(c.type)}
                            {c.outlet && ` · ${c.outlet}`}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <Select
                            aria-label={`Stage for ${c.name}`}
                            value={c.status}
                            onChange={(e) => void contacts.update(c.id, { status: e.target.value as Contact['status'] })}
                            className="!h-8 w-36 text-[12.5px]"
                          >
                            {CONTACT_STATUS.map((s) => (
                              <option key={s} value={s}>
                                {label(s)}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={STATUS_TONE[c.consent]}>{label(c.consent)}</Badge>
                        </td>
                        <td className="px-3 py-3 text-ivory-dim">{c.lastContacted ? formatDate(c.lastContacted) : <span className="text-ivory-mute">Never</span>}</td>
                        <td className={cx('px-3 py-3', overdue ? 'text-danger' : 'text-ivory-dim')}>
                          {c.nextFollowUp ? relativeDay(c.nextFollowUp, today) : <span className="text-ivory-mute">Not set</span>}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-0.5">
                            <IconButton icon={blocked ? Ban : MessageSquareText} label={blocked ? `${c.name} is marked do not contact` : `Write a pitch to ${c.name}`} disabled={blocked} onClick={() => void openPitch(c)} />
                            <IconButton icon={Send} label={`Log that you contacted ${c.name} today`} disabled={blocked} onClick={() => void logContact(c)} />
                            {c.email && <IconButton icon={Mail} label={`Open an email to ${c.name} in your mail app`} disabled={blocked} onClick={() => void run(async () => void (await call('shell:openExternal', { url: `mailto:${c.email}` })))} />}
                            {c.url && <IconButton icon={ExternalLink} label={`Open website for ${c.name}`} onClick={() => void run(async () => void (await call('shell:openExternal', { url: c.url })))} />}
                            <IconButton icon={Pencil} label={`Edit ${c.name}`} onClick={() => setEditing(c)} />
                            <IconButton icon={Trash2} label={`Delete ${c.name}`} onClick={() => setDeleting(c)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="mt-4 flex items-start gap-2 text-[12.5px] leading-5 text-ivory-mute">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-olive" aria-hidden />
            The studio never sends messages. Pitches are written one at a time for you to send yourself, and contacts marked do not
            contact cannot be pitched.
          </p>
        </>
      )}

      {editing && (
        <ContactModal
          contact={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            const saved = editing === 'new' ? await contacts.create({ ...data, bookId: book.id }) : await contacts.update(editing.id, data);
            if (saved) setEditing(null);
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this contact?"
          body={<>{deleting.name} will be removed from your outreach list. Pitch drafts written for them are kept in your drafts.</>}
          confirmLabel="Delete contact"
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            if (await contacts.remove(deleting.id)) setDeleting(null);
          }}
        />
      )}
      {pitchFor && (
        <PitchModal
          contact={pitchFor.contact}
          draft={pitches.items.find((d) => d.id === pitchFor.draftId) ?? null}
          onChanged={() => void pitches.reload()}
          onClose={() => {
            setPitchFor(null);
            void pitches.reload();
          }}
        />
      )}
      {summary && <ImportSummaryModal summary={summary} noun="contacts" onClose={() => setSummary(null)} />}
    </>
  );
}

function StageTile({ text, count, active, onClick }: { text: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx('rounded-lg border px-3.5 py-3 text-left transition-colors', active ? 'border-gold/50 bg-gold/[0.05]' : 'border-line bg-ink-850 hover:border-line-strong')}
    >
      <span className="block font-serif text-[26px] leading-none text-ivory">{count}</span>
      <span className="mt-1.5 block truncate text-[11.5px] text-ivory-mute">{text}</span>
    </button>
  );
}

function PitchModal({ contact, draft, onChanged, onClose }: { contact: Contact; draft: Draft | null; onChanged: () => void; onClose: () => void }) {
  return (
    <Modal title={`Pitch to ${contact.name}`} description={contact.outlet || undefined} size="xl" onClose={onClose}>
      {contact.consent === 'unknown' && (
        <div className="mb-4">
          <Notice tone="warn" icon={ShieldCheck}>
            You have not recorded how {contact.name} prefers to be contacted. Check that they accept pitches before you send this.
          </Notice>
        </div>
      )}
      <div className="-mx-6 -mb-5 h-[560px] border-t border-line">
        {draft ? <DraftEditor draft={draft} onChanged={onChanged} onDeleted={onClose} emailFields /> : <Spinner />}
      </div>
    </Modal>
  );
}

export function ImportSummaryModal({ summary, noun, onClose }: { summary: ImportSummary; noun: string; onClose: () => void }) {
  return (
    <Modal
      title="Import finished"
      size="md"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose} data-autofocus>
          Done
        </Button>
      }
    >
      {summary.missingRequired.length > 0 ? (
        <ErrorNote message={`Nothing was imported. The file is missing the required column${summary.missingRequired.length > 1 ? 's' : ''}: ${summary.missingRequired.join(', ')}. Download the CSV template to see the expected layout.`} />
      ) : (
        <>
          <p className="text-[14px] text-ivory">
            {summary.imported} {noun} imported.
            {summary.errors.length > 0 && ` ${summary.errors.length} row${summary.errors.length === 1 ? ' was' : 's were'} skipped.`}
          </p>
          {summary.errors.length > 0 && (
            <ul className="mt-4 max-h-64 space-y-1.5 overflow-y-auto rounded-md border border-line bg-ink-900 p-3 text-[12.5px] text-ivory-dim">
              {summary.errors.map((e, i) => (
                <li key={i}>
                  <span className="text-ivory-mute">Row {e.row}:</span> {e.message}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}

type ContactData = Omit<Contact, 'id' | 'createdAt' | 'updatedAt' | 'bookId'>;

function ContactModal({ contact, onClose, onSave }: { contact: Contact | null; onClose: () => void; onSave: (data: ContactData) => Promise<void> }) {
  const [form, setForm] = useState<ContactData>({
    name: contact?.name ?? '',
    outlet: contact?.outlet ?? '',
    type: contact?.type ?? 'reviewer',
    email: contact?.email ?? '',
    url: contact?.url ?? '',
    status: contact?.status ?? 'prospect',
    consent: contact?.consent ?? 'unknown',
    lastContacted: contact?.lastContacted ?? '',
    nextFollowUp: contact?.nextFollowUp ?? '',
    notes: contact?.notes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ContactData>(key: K, value: ContactData[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    const e: Record<string, string> = {};
    if (form.name.trim() === '') e.name = 'Add a name';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Enter a valid email address';
    if (form.url.trim() && !/^https?:\/\/\S+$/i.test(form.url.trim())) e.url = 'Enter a full link starting with https://';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Modal
      title={contact ? 'Edit contact' : 'Add a contact'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {contact ? 'Save changes' : 'Add contact'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Field label="Name" error={errors.name}>
          {(p) => <Input {...p} value={form.name} maxLength={160} onChange={(e) => set('name', e.target.value)} data-autofocus />}
        </Field>
        <Field label="Outlet, show or organization" optional>
          {(p) => <Input {...p} value={form.outlet} maxLength={200} onChange={(e) => set('outlet', e.target.value)} />}
        </Field>
        <Field label="Type">
          {(p) => (
            <Select {...p} value={form.type} onChange={(e) => set('type', e.target.value as Contact['type'])}>
              {CONTACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Stage">
          {(p) => (
            <Select {...p} value={form.status} onChange={(e) => set('status', e.target.value as Contact['status'])}>
              {CONTACT_STATUS.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Email" optional error={errors.email}>
          {(p) => <Input {...p} type="email" value={form.email} maxLength={200} onChange={(e) => set('email', e.target.value)} />}
        </Field>
        <Field label="Website or submission page" optional error={errors.url}>
          {(p) => <Input {...p} value={form.url} maxLength={500} placeholder="https://" onChange={(e) => set('url', e.target.value)} />}
        </Field>
        <Field label="Consent to contact" hint={CONSENT_HELP[form.consent]} className="col-span-2">
          {(p) => (
            <Select {...p} value={form.consent} onChange={(e) => set('consent', e.target.value as Contact['consent'])}>
              {CONSENT.map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Last contacted" optional>
          {(p) => <Input {...p} type="date" value={form.lastContacted} onChange={(e) => set('lastContacted', e.target.value)} />}
        </Field>
        <Field label="Next follow up" optional>
          {(p) => <Input {...p} type="date" value={form.nextFollowUp} onChange={(e) => set('nextFollowUp', e.target.value)} />}
        </Field>
        <Field label="Notes" optional hint="What they cover, how you found them, anything personal to mention." className="col-span-2">
          {(p) => <Textarea {...p} rows={4} value={form.notes} maxLength={6000} onChange={(e) => set('notes', e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}
