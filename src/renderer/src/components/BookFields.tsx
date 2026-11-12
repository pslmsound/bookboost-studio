// Book form fields, shared by onboarding and the book library.
import { useState } from 'react';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { CHANNEL_OPTIONS, bookSchema, type BookInput } from '@shared/schema';
import { call, errorMessage } from '../lib/api';
import { useApp } from '../lib/store';
import { Button, Chips, Field, IconButton, Input, Textarea } from './ui';
import { Cover } from './common';

export type BookDraft = Required<Pick<BookInput, 'title' | 'authorName'>> & {
  subtitle: string;
  genre: string;
  audience: string;
  summary: string;
  tone: string;
  goals: string;
  channels: string[];
  purchaseLinks: { label: string; url: string }[];
  publicationDate: string;
  coverFile: string;
};

export const emptyBook = (authorName = ''): BookDraft => ({
  title: '', subtitle: '', authorName, genre: '', audience: '', summary: '', tone: '', goals: '',
  channels: [], purchaseLinks: [], publicationDate: '', coverFile: '',
});

export type BookErrors = Partial<Record<string, string>>;

/** Validates a book draft. Empty purchase link rows are dropped before validation. */
export function validateBook(draft: BookDraft): { data: BookDraft; errors: BookErrors } {
  const data = { ...draft, purchaseLinks: draft.purchaseLinks.filter((l) => l.label.trim() || l.url.trim()) };
  const parsed = bookSchema.safeParse(data);
  const errors: BookErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] === 'purchaseLinks' ? 'purchaseLinks' : String(issue.path[0]);
      errors[key] ??= issue.message;
    }
  }
  return { data, errors };
}

type Section = 'basics' | 'readers' | 'marketing';

export function BookFields({
  value,
  onChange,
  errors,
  sections = ['basics', 'readers', 'marketing'],
}: {
  value: BookDraft;
  onChange: (next: BookDraft) => void;
  errors: BookErrors;
  sections?: Section[];
}) {
  const { toast } = useApp();
  const [choosing, setChoosing] = useState(false);
  const set = <K extends keyof BookDraft>(key: K, v: BookDraft[K]) => onChange({ ...value, [key]: v });

  const chooseCover = async () => {
    setChoosing(true);
    try {
      const file = await call<string | null>('books:chooseCover');
      if (file) set('coverFile', file);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setChoosing(false);
    }
  };

  return (
    <div className="space-y-8">
      {sections.includes('basics') && (
        <div className="grid grid-cols-[132px_1fr] gap-6">
          <div>
            <Cover book={value} className="w-full" />
            <Button size="sm" icon={ImagePlus} onClick={chooseCover} loading={choosing} className="mt-3 w-full">
              {value.coverFile ? 'Replace' : 'Add cover'}
            </Button>
            {value.coverFile && (
              <Button size="sm" variant="ghost" onClick={() => set('coverFile', '')} className="mt-1 w-full">
                Remove
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Field label="Book title" error={errors.title} className="col-span-2">
              {(p) => <Input {...p} value={value.title} onChange={(e) => set('title', e.target.value)} maxLength={200} data-autofocus />}
            </Field>
            <Field label="Subtitle" optional className="col-span-2">
              {(p) => <Input {...p} value={value.subtitle} onChange={(e) => set('subtitle', e.target.value)} maxLength={200} />}
            </Field>
            <Field label="Author name" error={errors.authorName}>
              {(p) => <Input {...p} value={value.authorName} onChange={(e) => set('authorName', e.target.value)} maxLength={120} />}
            </Field>
            <Field label="Genre" optional>
              {(p) => <Input {...p} value={value.genre} onChange={(e) => set('genre', e.target.value)} placeholder="For example, cozy mystery" maxLength={120} />}
            </Field>
            <Field label="Publication date" optional error={errors.publicationDate} hint="Past or planned.">
              {(p) => <Input {...p} type="date" value={value.publicationDate} onChange={(e) => set('publicationDate', e.target.value)} />}
            </Field>
          </div>
        </div>
      )}

      {sections.includes('readers') && (
        <div className="space-y-4">
          <Field label="Summary" optional hint="A few sentences on what the book is about. The AI assistant uses this as its main source.">
            {(p) => <Textarea {...p} rows={5} value={value.summary} onChange={(e) => set('summary', e.target.value)} maxLength={8000} />}
          </Field>
          <Field label="Target readers" optional hint="Who is this book for? Think of ages, interests and similar authors they enjoy.">
            {(p) => <Textarea {...p} rows={3} value={value.audience} onChange={(e) => set('audience', e.target.value)} maxLength={1500} />}
          </Field>
          <Field label="Voice and tone" optional hint="How should your marketing sound? For example: warm, witty and plain spoken.">
            {(p) => <Textarea {...p} rows={2} value={value.tone} onChange={(e) => set('tone', e.target.value)} maxLength={800} />}
          </Field>
        </div>
      )}

      {sections.includes('marketing') && (
        <div className="space-y-5">
          <Field label="Marketing goals" optional hint="What would make this a success for you?">
            {(p) => <Textarea {...p} rows={3} value={value.goals} onChange={(e) => set('goals', e.target.value)} maxLength={2500} />}
          </Field>
          <div>
            <p className="mb-2 text-[12.5px] font-medium text-ivory-dim">Marketing channels you use or plan to use</p>
            <Chips label="Marketing channels" options={CHANNEL_OPTIONS} value={value.channels} onChange={(v) => set('channels', v)} />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12.5px] font-medium text-ivory-dim">Where readers can buy the book</p>
              <Button
                size="sm"
                variant="ghost"
                icon={Plus}
                disabled={value.purchaseLinks.length >= 12}
                onClick={() => set('purchaseLinks', [...value.purchaseLinks, { label: '', url: '' }])}
              >
                Add link
              </Button>
            </div>
            {value.purchaseLinks.length === 0 && <p className="text-[12.5px] text-ivory-mute">No purchase links yet.</p>}
            <div className="space-y-2">
              {value.purchaseLinks.map((link, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    aria-label={`Store name for link ${i + 1}`}
                    placeholder="Store name"
                    className="w-40"
                    value={link.label}
                    maxLength={60}
                    onChange={(e) => set('purchaseLinks', value.purchaseLinks.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))}
                  />
                  <Input
                    aria-label={`Web address for link ${i + 1}`}
                    placeholder="https://"
                    value={link.url}
                    maxLength={500}
                    onChange={(e) => set('purchaseLinks', value.purchaseLinks.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))}
                  />
                  <IconButton icon={Trash2} label={`Remove link ${i + 1}`} onClick={() => set('purchaseLinks', value.purchaseLinks.filter((_, j) => j !== i))} />
                </div>
              ))}
            </div>
            {errors.purchaseLinks && (
              <p role="alert" className="mt-1.5 text-[12px] text-danger">
                {errors.purchaseLinks}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
