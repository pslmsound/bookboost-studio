// First run setup. Six short steps, all skippable except the book basics.
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, FlaskConical, Lock, Sparkles } from 'lucide-react';
import { call, db, errorMessage } from '../lib/api';
import { useApp } from '../lib/store';
import { Button, Field, Input, Notice, Textarea, cx } from '../components/ui';
import { BookFields, emptyBook, validateBook, type BookDraft, type BookErrors } from '../components/BookFields';

const STEPS = ['Welcome', 'About you', 'Your book', 'Readers and voice', 'Goals and channels', 'Finish'] as const;

export function Onboarding() {
  const { updateSettings, reloadBooks, reloadAll, toast, books } = useApp();
  const [step, setStep] = useState(0);
  const [author, setAuthor] = useState({ name: '', bio: '', website: '', email: '' });
  const [authorErrors, setAuthorErrors] = useState<Record<string, string>>({});
  const [book, setBook] = useState<BookDraft>(emptyBook());
  const [errors, setErrors] = useState<BookErrors>({});
  const [saving, setSaving] = useState(false);

  const changeBook = (nextBook: BookDraft) => {
    setBook(nextBook);
    if (Object.keys(errors).length) setErrors({});
  };

  const next = () => {
    if (step === 1) {
      const e: Record<string, string> = {};
      if (author.website && !/^https?:\/\/\S+$/i.test(author.website.trim())) e.website = 'Enter a full link starting with https://';
      if (author.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(author.email.trim())) e.email = 'Enter a valid email address';
      setAuthorErrors(e);
      if (Object.keys(e).length) return;
      if (!book.authorName) setBook((b) => ({ ...b, authorName: author.name }));
    }
    if (step === 2 || step === 4) {
      const result = validateBook(book);
      const relevant = step === 2 ? ['title', 'authorName', 'publicationDate'] : ['purchaseLinks'];
      const shown = Object.fromEntries(Object.entries(result.errors).filter(([k]) => relevant.includes(k)));
      setErrors(shown);
      if (Object.keys(shown).length) return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const finish = async () => {
    const { data, errors: all } = validateBook(book);
    if (Object.keys(all).length) {
      setErrors(all);
      setStep(all.title || all.authorName || all.publicationDate ? 2 : 4);
      return;
    }
    setSaving(true);
    try {
      const created = await db.create('books', data);
      await updateSettings({ author, activeBookId: created.id, onboardingComplete: true });
      await reloadBooks();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const exploreDemo = async () => {
    setSaving(true);
    try {
      await call('demo:enable');
      await updateSettings({ onboardingComplete: true });
      await reloadAll();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const skipExisting = async () => {
    await updateSettings({ onboardingComplete: true });
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-[340px] shrink-0 flex-col justify-between border-r border-line bg-ink-900 p-10">
        <div>
          <p className="font-serif text-[30px] font-semibold leading-none tracking-tight text-ivory">BookBoost</p>
          <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.34em] text-gold">Studio</p>
          <ol className="mt-14 space-y-4">
            {STEPS.map((label, i) => (
              <li key={label} aria-current={i === step ? 'step' : undefined} className="flex items-center gap-3 text-[13px]">
                <span
                  className={cx(
                    'flex h-6 w-6 items-center justify-center rounded-full border text-[11px]',
                    i < step ? 'border-gold/60 bg-gold/10 text-gold' : i === step ? 'border-gold text-gold' : 'border-line-strong text-ivory-mute',
                  )}
                >
                  {i < step ? <Check size={12} aria-hidden /> : i + 1}
                </span>
                <span className={i === step ? 'text-ivory' : 'text-ivory-mute'}>{label}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="flex items-start gap-2.5 text-[12px] leading-5 text-ivory-mute">
          <Lock size={13} className="mt-0.5 shrink-0 text-olive" aria-hidden />
          Your book details are stored on this computer only. Nothing is uploaded unless you choose to use the AI assistant.
        </p>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[680px] flex-1 flex-col px-10 py-14">
          <div key={step} className="animate-rise flex-1">
            {step === 0 && (
              <div className="pt-10">
                <p className="eyebrow mb-4">Welcome</p>
                <h1 className="font-serif text-[46px] font-medium leading-[1.05] tracking-tight text-ivory">
                  A quiet, capable studio for bringing your book to its readers.
                </h1>
                <p className="mt-6 max-w-lg text-[15px] leading-7 text-ivory-dim">
                  Plan campaigns, write and refine your marketing copy, keep track of reviewers and podcasts, and see what is
                  working. Setup takes about three minutes, and you can change everything later.
                </p>
                <div className="mt-10 flex flex-wrap gap-3">
                  <Button variant="primary" icon={ArrowRight} onClick={() => setStep(1)} className="h-11 px-6 text-[14px]" data-autofocus>
                    Set up my book
                  </Button>
                  <Button icon={FlaskConical} onClick={exploreDemo} loading={saving} className="h-11 px-5 text-[14px]">
                    Explore with a sample book
                  </Button>
                </div>
                {books.some((b) => !b.isDemo) && (
                  <button type="button" onClick={skipExisting} className="mt-6 text-[13px] text-gold underline-offset-4 hover:underline">
                    Skip setup and open my existing books
                  </button>
                )}
              </div>
            )}

            {step === 1 && (
              <StepFrame title="About you" lead="This helps the assistant write in your name. Every field here is optional.">
                <div className="space-y-4">
                  <Field label="Your name or pen name" optional>
                    {(p) => <Input {...p} value={author.name} onChange={(e) => setAuthor({ ...author, name: e.target.value })} maxLength={120} data-autofocus />}
                  </Field>
                  <Field label="Short author bio" optional hint="Two or three sentences, as it might appear on a book jacket.">
                    {(p) => <Textarea {...p} rows={4} value={author.bio} onChange={(e) => setAuthor({ ...author, bio: e.target.value })} maxLength={3000} />}
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Website" optional error={authorErrors.website}>
                      {(p) => <Input {...p} value={author.website} onChange={(e) => setAuthor({ ...author, website: e.target.value })} placeholder="https://" maxLength={500} />}
                    </Field>
                    <Field label="Contact email" optional error={authorErrors.email}>
                      {(p) => <Input {...p} type="email" value={author.email} onChange={(e) => setAuthor({ ...author, email: e.target.value })} maxLength={200} />}
                    </Field>
                  </div>
                </div>
              </StepFrame>
            )}

            {step === 2 && (
              <StepFrame title="Your book" lead="Start with the essentials. Only the title and author name are required.">
                <BookFields value={book} onChange={changeBook} errors={errors} sections={['basics']} />
              </StepFrame>
            )}
            {step === 3 && (
              <StepFrame title="Readers and voice" lead="The more specific you are here, the better your drafts will sound. You can skip this and fill it in later.">
                <BookFields value={book} onChange={changeBook} errors={errors} sections={['readers']} />
              </StepFrame>
            )}
            {step === 4 && (
              <StepFrame title="Goals and channels" lead="Choose where you plan to show up. This shapes the suggestions you will see.">
                <BookFields value={book} onChange={changeBook} errors={errors} sections={['marketing']} />
              </StepFrame>
            )}
            {step === 5 && (
              <StepFrame title="You are ready" lead={`"${book.title}" will be added to your library. Here is what to know before you begin.`}>
                <div className="space-y-3">
                  <Notice icon={Sparkles}>
                    <p className="text-ivory">The AI assistant is optional.</p>
                    <p className="mt-0.5">
                      To generate drafts you will connect your own AI provider key in Settings. Until then, every writing and
                      planning tool works by hand.
                    </p>
                  </Notice>
                  <Notice icon={Lock} tone="olive">
                    <p className="text-ivory">You stay in control.</p>
                    <p className="mt-0.5">
                      The studio never posts, emails or contacts anyone for you. It helps you prepare, and you decide what goes
                      out.
                    </p>
                  </Notice>
                </div>
              </StepFrame>
            )}
          </div>

          {step > 0 && (
            <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
              <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep((s) => s - 1)} disabled={saving}>
                Back
              </Button>
              {step < STEPS.length - 1 ? (
                <Button variant="primary" onClick={next}>
                  Continue
                </Button>
              ) : (
                <Button variant="primary" onClick={finish} loading={saving}>
                  Open my studio
                </Button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StepFrame({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-serif text-[36px] font-medium leading-tight tracking-tight text-ivory">{title}</h1>
      <p className="mb-8 mt-2 text-[14px] leading-6 text-ivory-dim">{lead}</p>
      {children}
    </div>
  );
}
