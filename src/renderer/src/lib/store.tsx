// Application state shared across pages: settings, books, navigation,
// AI status and toast notifications.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import type { AiStatus, AppInfo } from '@shared/api';
import type { Book, EntityInput, EntityMap, EntityName, Settings } from '@shared/schema';
import { call, db, errorMessage } from './api';

export type Page =
  | 'overview' | 'books' | 'campaigns' | 'content' | 'calendar'
  | 'outreach' | 'email' | 'analytics' | 'assistant' | 'settings';

interface Toast {
  id: number;
  message: string;
  tone: 'ok' | 'error';
}

interface AppState {
  ready: boolean;
  loadError: string;
  info: AppInfo | null;
  settings: Settings | null;
  books: Book[];
  activeBook: Book | null;
  ai: AiStatus | null;
  page: Page;
  /** Optional hint passed along with navigation, for example a record to open. */
  pageParam: string;
  navigate: (page: Page, param?: string) => void;
  reloadAll: () => Promise<void>;
  reloadBooks: () => Promise<Book[]>;
  reloadAi: () => Promise<void>;
  updateSettings: (patch: Record<string, unknown>) => Promise<Settings>;
  setActiveBook: (id: string) => Promise<void>;
  toast: (message: string, tone?: 'ok' | 'error') => void;
  /** Pages register a guard so unsaved work is not lost on navigation. */
  setLeaveGuard: (guard: (() => boolean) | null) => void;
}

const Ctx = createContext<AppState | null>(null);
export const useApp = () => {
  const value = useContext(Ctx);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [page, setPage] = useState<Page>('overview');
  const [pageParam, setPageParam] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const guard = useRef<(() => boolean) | null>(null);
  const nextToast = useRef(1);

  const toast = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    const id = nextToast.current++;
    setToasts((list) => [...list.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === 'error' ? 7000 : 3800);
  }, []);

  const reloadBooks = useCallback(async () => {
    const list = await db.list('books');
    setBooks(list);
    return list;
  }, []);
  const reloadAi = useCallback(async () => setAi(await call<AiStatus>('ai:status')), []);

  const reloadAll = useCallback(async () => {
    try {
      const [appInfo, nextSettings, list, status] = await Promise.all([
        call<AppInfo>('app:info'),
        call<Settings>('settings:get'),
        db.list('books'),
        call<AiStatus>('ai:status'),
      ]);
      setInfo(appInfo);
      setSettings(nextSettings);
      setBooks(list);
      setAi(status);
      setLoadError('');
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void reloadAll();
    return window.bookboost.onDataReplaced(() => {
      setPage('overview');
      void reloadAll();
    });
  }, [reloadAll]);

  const updateSettings = useCallback(async (patch: Record<string, unknown>) => {
    const next = await call<Settings>('settings:update', patch);
    setSettings(next);
    return next;
  }, []);

  const setActiveBook = useCallback(
    async (id: string) => {
      await updateSettings({ activeBookId: id });
    },
    [updateSettings],
  );

  const navigate = useCallback((next: Page, param = '') => {
    if (guard.current && !guard.current()) return;
    guard.current = null;
    setPage(next);
    setPageParam(param);
    document.getElementById('main-scroll')?.scrollTo({ top: 0 });
  }, []);

  const setLeaveGuard = useCallback((fn: (() => boolean) | null) => {
    guard.current = fn;
  }, []);

  const activeBook = useMemo(() => {
    if (!settings) return null;
    return books.find((b) => b.id === settings.activeBookId && b.status === 'active') ?? books.find((b) => b.status === 'active') ?? null;
  }, [books, settings]);

  const value: AppState = {
    ready, loadError, info, settings, books, activeBook, ai, page, pageParam,
    navigate, reloadAll, reloadBooks, reloadAi, updateSettings, setActiveBook, toast, setLeaveGuard,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex w-[420px] -translate-x-1/2 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="animate-rise pointer-events-auto flex items-start gap-3 rounded-lg border border-line-strong bg-ink-800 px-4 py-3 text-[13px] leading-5 text-ivory shadow-modal"
          >
            {t.tone === 'error' ? (
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
            ) : (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-gold" aria-hidden />
            )}
            <span className="min-w-0 flex-1">{t.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              className="text-ivory-mute hover:text-ivory"
              onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

// ---------- Entity list hook ----------
export interface EntityList<K extends EntityName> {
  items: EntityMap[K][];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  create: (data: EntityInput<K>) => Promise<EntityMap[K] | null>;
  update: (id: string, patch: Partial<EntityInput<K>>) => Promise<EntityMap[K] | null>;
  remove: (id: string) => Promise<boolean>;
}

/** Loads a list of records and keeps it in sync after local changes. Pass null to skip loading. */
export function useEntityList<K extends EntityName>(entity: K, filter: Record<string, string> | null): EntityList<K> {
  const { toast } = useApp();
  const [items, setItems] = useState<EntityMap[K][]>([]);
  const [loading, setLoading] = useState(filter !== null);
  const [error, setError] = useState('');
  const key = filter ? JSON.stringify(filter) : null;
  const request = useRef(0);

  const reload = useCallback(async () => {
    if (key === null) {
      setItems([]);
      setLoading(false);
      return;
    }
    const current = ++request.current;
    try {
      const list = await db.list(entity, JSON.parse(key));
      if (current !== request.current) return;
      setItems(list);
      setError('');
    } catch (e) {
      if (current === request.current) setError(errorMessage(e));
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [entity, key]);

  useEffect(() => {
    setLoading(key !== null);
    void reload();
  }, [reload, key]);

  const create = useCallback(
    async (data: EntityInput<K>) => {
      try {
        const created = await db.create(entity, data);
        await reload();
        return created;
      } catch (e) {
        toast(errorMessage(e), 'error');
        return null;
      }
    },
    [entity, reload, toast],
  );
  const update = useCallback(
    async (id: string, patch: Partial<EntityInput<K>>) => {
      try {
        const updated = await db.update(entity, id, patch);
        await reload();
        return updated;
      } catch (e) {
        toast(errorMessage(e), 'error');
        await reload();
        return null;
      }
    },
    [entity, reload, toast],
  );
  const remove = useCallback(
    async (id: string) => {
      try {
        await db.remove(entity, id);
        await reload();
        return true;
      } catch (e) {
        toast(errorMessage(e), 'error');
        return false;
      }
    },
    [entity, reload, toast],
  );

  return { items, loading, error, reload, create, update, remove };
}
