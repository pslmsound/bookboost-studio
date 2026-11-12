import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BookOpen, CalendarDays, ChartLine, Check, ChevronsUpDown, Flag, FlaskConical, LayoutDashboard, Library, Mail,
  PenLine, Settings as SettingsIcon, Sparkles, Users, type LucideIcon,
} from 'lucide-react';
import { AppProvider, useApp, type Page } from './lib/store';
import { Button, EmptyState, ErrorNote, Spinner, cx } from './components/ui';
import { Cover } from './components/common';
import { Onboarding } from './pages/Onboarding';
import { Overview } from './pages/Overview';
import { Books } from './pages/Books';
import { Campaigns } from './pages/Campaigns';
import { ContentStudio, EmailPage, AssistantPage } from './pages/Writing';
import { CalendarPage } from './pages/Calendar';
import { Outreach } from './pages/Outreach';
import { Analytics } from './pages/Analytics';
import { SettingsPage } from './pages/Settings';

const NAV: { page: Page; label: string; icon: LucideIcon; group: 'main' | 'tools' }[] = [
  { page: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'main' },
  { page: 'books', label: 'My Books', icon: Library, group: 'main' },
  { page: 'campaigns', label: 'Campaigns', icon: Flag, group: 'main' },
  { page: 'content', label: 'Content Studio', icon: PenLine, group: 'main' },
  { page: 'calendar', label: 'Calendar', icon: CalendarDays, group: 'main' },
  { page: 'outreach', label: 'Outreach', icon: Users, group: 'main' },
  { page: 'email', label: 'Email', icon: Mail, group: 'main' },
  { page: 'analytics', label: 'Analytics', icon: ChartLine, group: 'main' },
  { page: 'assistant', label: 'AI Assistant', icon: Sparkles, group: 'tools' },
  { page: 'settings', label: 'Settings', icon: SettingsIcon, group: 'tools' },
];

export function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}

function Root() {
  const app = useApp();
  if (!app.ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Opening your studio" />
      </div>
    );
  }
  if (app.loadError || !app.settings) {
    return (
      <div className="mx-auto flex h-full max-w-md flex-col justify-center gap-4 p-8">
        <h1 className="font-serif text-[28px] text-ivory">The studio could not load</h1>
        <ErrorNote message={app.loadError || 'Your settings could not be read.'} onRetry={() => void app.reloadAll()} />
      </div>
    );
  }
  if (!app.settings.onboardingComplete) return <Onboarding />;
  return <Shell />;
}

function Shell() {
  const { page, navigate, activeBook, settings } = useApp();
  const needsBook = !['books', 'settings'].includes(page);

  let content: ReactNode;
  if (needsBook && !activeBook) {
    content = (
      <div className="card mt-10">
        <EmptyState
          icon={BookOpen}
          title="Add a book to begin"
          body="Everything in the studio is organized around a book. Add yours and this page will come to life."
          action={
            <Button variant="primary" onClick={() => navigate('books', 'new')}>
              Add a book
            </Button>
          }
        />
      </div>
    );
  } else {
    const key = activeBook?.id ?? 'none';
    content = {
      overview: <Overview key={key} />,
      books: <Books />,
      campaigns: <Campaigns key={key} />,
      content: <ContentStudio key={key} />,
      calendar: <CalendarPage key={key} />,
      outreach: <Outreach key={key} />,
      email: <EmailPage key={key} />,
      analytics: <Analytics key={key} />,
      assistant: <AssistantPage key={key} />,
      settings: <SettingsPage />,
    }[page];
  }

  return (
    <div className="flex h-full">
      <a href="#main-scroll" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-ink-800 focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {settings?.demoMode && activeBook?.isDemo && (
          <div role="status" className="flex items-center justify-center gap-3 border-b border-warn/25 bg-warn/[0.07] px-6 py-2 text-[12.5px] text-ivory-dim">
            <FlaskConical size={14} className="text-warn" aria-hidden />
            <span>
              <span className="font-medium text-ivory">Sample data.</span> This book and every number shown with it are fictional examples.
            </span>
            <button type="button" className="font-medium text-gold underline-offset-4 hover:underline" onClick={() => navigate('settings', 'demo')}>
              Turn off in Settings
            </button>
          </div>
        )}
        <main id="main-scroll" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
          <div className="mx-auto w-full max-w-[1320px] px-10 pb-16 pt-9">{content}</div>
        </main>
      </div>
    </div>
  );
}

function Sidebar() {
  const { page, navigate } = useApp();
  const link = (item: (typeof NAV)[number]) => {
    const active = page === item.page;
    return (
      <li key={item.page}>
        <button
          type="button"
          aria-current={active ? 'page' : undefined}
          onClick={() => navigate(item.page)}
          className={cx(
            'group relative flex h-9 w-full items-center gap-3 rounded-md px-3 text-[13px] transition-colors',
            active ? 'bg-ink-800 text-ivory' : 'text-ivory-dim hover:bg-ink-850 hover:text-ivory',
          )}
        >
          <span className={cx('absolute left-0 top-2 h-5 w-[2px] rounded-full transition-colors', active ? 'bg-gold' : 'bg-transparent')} aria-hidden />
          <item.icon size={16} strokeWidth={1.6} className={active ? 'text-gold' : 'text-ivory-mute group-hover:text-ivory-dim'} aria-hidden />
          {item.label}
        </button>
      </li>
    );
  };
  return (
    <nav aria-label="Main" className="flex w-[236px] shrink-0 flex-col border-r border-line bg-ink-900">
      <div className="px-6 pb-7 pt-7">
        <p className="font-serif text-[25px] font-semibold leading-none tracking-tight text-ivory">BookBoost</p>
        <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.34em] text-gold">Studio</p>
      </div>
      <ul className="space-y-0.5 px-3">{NAV.filter((n) => n.group === 'main').map(link)}</ul>
      <div className="mx-6 my-4 h-px bg-line" />
      <ul className="space-y-0.5 px-3">{NAV.filter((n) => n.group === 'tools').map(link)}</ul>
      <div className="mt-auto p-3">
        <BookSwitcher />
      </div>
    </nav>
  );
}

function BookSwitcher() {
  const { books, activeBook, setActiveBook, navigate } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const available = books.filter((b) => b.status === 'active');

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!activeBook) {
    return (
      <Button className="w-full" onClick={() => navigate('books', 'new')}>
        Add a book
      </Button>
    );
  }
  return (
    <div ref={ref} className="relative">
      {open && (
        <div role="menu" aria-label="Switch book" className="animate-rise absolute bottom-full left-0 z-30 mb-2 w-full rounded-lg border border-line-strong bg-ink-800 p-1.5 shadow-modal">
          <p className="px-2.5 pb-1.5 pt-1 text-2xs uppercase text-ivory-mute">Switch book</p>
          <div className="max-h-64 overflow-y-auto">
            {available.map((book) => (
              <button
                key={book.id}
                type="button"
                role="menuitemradio"
                aria-checked={book.id === activeBook.id}
                onClick={() => {
                  setOpen(false);
                  if (book.id !== activeBook.id) void setActiveBook(book.id);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-ivory-dim hover:bg-ink-700 hover:text-ivory"
              >
                <span className="min-w-0 flex-1 truncate">{book.title}</span>
                {book.id === activeBook.id && <Check size={14} className="text-gold" aria-hidden />}
              </button>
            ))}
          </div>
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate('books');
            }}
            className="w-full rounded-md px-2.5 py-2 text-left text-[13px] text-gold hover:bg-ink-700"
          >
            Manage books
          </button>
        </div>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-lg border border-line bg-ink-850 p-2.5 text-left transition-colors hover:border-line-strong"
      >
        <Cover book={activeBook} className="w-9 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-2xs uppercase text-ivory-mute">Active book</span>
          <span className="block truncate text-[13px] font-medium text-ivory">{activeBook.title}</span>
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-ivory-mute" aria-hidden />
      </button>
    </div>
  );
}
