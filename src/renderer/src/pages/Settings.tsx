import { useEffect, useRef, useState } from 'react';
import { Check, Database, Download, FlaskConical, FolderOpen, KeyRound, Lock, RefreshCw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { AI_PROVIDERS, type AiProvider, type Settings } from '@shared/schema';
import type { AiStatus, BackupEntry } from '@shared/api';
import { call, errorMessage } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Button, Card, ConfirmDialog, ErrorNote, Field, Input, Notice, PageHeader, Select, Textarea } from '../components/ui';

const PROVIDERS: Record<AiProvider, { name: string; keyHint: string; modelHint: string; help: string }> = {
  anthropic: {
    name: 'Anthropic (Claude)',
    keyHint: 'Create a key in the Anthropic Console under API keys. It starts with "sk-ant-".',
    modelHint: 'For example, claude-sonnet-5-5. Use "Load available models" to pick from your account.',
    help: 'Requests go to api.anthropic.com.',
  },
  openai: {
    name: 'OpenAI',
    keyHint: 'Create a key on the OpenAI platform under API keys. It starts with "sk-".',
    modelHint: 'Use "Load available models" to pick a chat model available to your account.',
    help: 'Requests go to api.openai.com.',
  },
  custom: {
    name: 'Custom endpoint (OpenAI compatible)',
    keyHint: 'Only needed if your endpoint requires a key.',
    modelHint: 'The model name your endpoint expects.',
    help: 'For services or local apps that offer an OpenAI compatible API. The address must use https unless it is on this computer.',
  },
};

export function SettingsPage() {
  const { pageParam } = useApp();
  const aiRef = useRef<HTMLDivElement>(null);
  const demoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = pageParam === 'ai' ? aiRef.current : pageParam === 'demo' ? demoRef.current : null;
    target?.scrollIntoView({ block: 'start' });
  }, [pageParam]);

  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeader eyebrow="Preferences" title="Settings" description="Your profile, the optional AI assistant, and how your data is stored and protected." />
      <div className="space-y-6">
        <AuthorSection />
        <div ref={aiRef} className="scroll-mt-6">
          <AiSection />
        </div>
        <DataSection />
        <div ref={demoRef} className="scroll-mt-6">
          <DemoSection />
        </div>
        <AboutSection />
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="p-6">
      <h2 className="font-serif text-[24px] leading-tight text-ivory">{title}</h2>
      <p className="mb-5 mt-1 text-[13px] leading-6 text-ivory-dim">{description}</p>
      {children}
    </Card>
  );
}

function AuthorSection() {
  const { settings, updateSettings, toast } = useApp();
  const [author, setAuthor] = useState(settings!.author);
  const [currency, setCurrency] = useState(settings!.currency);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(author) !== JSON.stringify(settings!.author) || currency !== settings!.currency;

  const save = async () => {
    const e: Record<string, string> = {};
    if (author.website.trim() && !/^https?:\/\/\S+$/i.test(author.website.trim())) e.website = 'Enter a full link starting with https://';
    if (author.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(author.email.trim())) e.email = 'Enter a valid email address';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const next = await updateSettings({ author, currency });
      setAuthor(next.author);
      toast('Profile saved.');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Author profile" description="Used to personalize your dashboard and to give the assistant context about you.">
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Field label="Name or pen name" optional>
          {(p) => <Input {...p} value={author.name} maxLength={120} onChange={(e) => setAuthor({ ...author, name: e.target.value })} />}
        </Field>
        <Field label="Currency for budgets and revenue">
          {(p) => (
            <Select {...p} value={currency} onChange={(e) => setCurrency(e.target.value as Settings['currency'])}>
              {(['USD', 'GBP', 'EUR', 'CAD', 'AUD'] as const).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Author bio" optional className="col-span-2">
          {(p) => <Textarea {...p} rows={3} value={author.bio} maxLength={3000} onChange={(e) => setAuthor({ ...author, bio: e.target.value })} />}
        </Field>
        <Field label="Website" optional error={errors.website}>
          {(p) => <Input {...p} value={author.website} maxLength={500} placeholder="https://" onChange={(e) => setAuthor({ ...author, website: e.target.value })} />}
        </Field>
        <Field label="Contact email" optional error={errors.email}>
          {(p) => <Input {...p} type="email" value={author.email} maxLength={200} onChange={(e) => setAuthor({ ...author, email: e.target.value })} />}
        </Field>
      </div>
      <div className="mt-5 flex justify-end">
        <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>
          Save profile
        </Button>
      </div>
    </Section>
  );
}

function AiSection() {
  const { ai, settings, updateSettings, reloadAi, toast, info } = useApp();
  const [provider, setProvider] = useState<AiProvider>(settings!.ai.provider);
  const [model, setModel] = useState(settings!.ai.model);
  const [baseUrl, setBaseUrl] = useState(settings!.ai.baseUrl);
  const [key, setKey] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<'' | 'key' | 'models' | 'test' | 'save' | 'clear'>('');
  const [error, setError] = useState('');
  const [tested, setTested] = useState(false);
  const meta = PROVIDERS[provider];
  const status: AiStatus | null = ai && ai.provider === provider ? ai : null;
  const dirty = provider !== settings!.ai.provider || model !== settings!.ai.model || baseUrl !== settings!.ai.baseUrl;

  const act = async (name: typeof busy, fn: () => Promise<void>) => {
    setBusy(name);
    setError('');
    setTested(false);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const persist = async () => {
    await updateSettings({ ai: { provider, model: model.trim(), baseUrl: baseUrl.trim() } });
    await reloadAi();
  };

  const changeProvider = (next: AiProvider) => {
    setProvider(next);
    setModels([]);
    setKey('');
    setError('');
    setTested(false);
    if (next !== settings!.ai.provider) setModel('');
    else setModel(settings!.ai.model);
  };

  return (
    <Section
      title="AI assistant"
      description="Optional. Connect your own account with an AI provider to generate plans and drafts. You pay the provider directly for what you use."
    >
      <div className="mb-5">
        <Notice icon={ShieldCheck} tone="olive">
          <p className="text-ivory">What leaves this computer</p>
          <p className="mt-0.5">
            Only when you press Generate or Revise, the selected book's details, your bio, your brief and the draft being revised are
            sent to the provider below. Nothing else is shared and nothing is sent in the background. The provider's own terms and
            privacy policy apply to that content.
          </p>
        </Notice>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Field label="Provider" hint={meta.help} className="col-span-2">
          {(p) => (
            <Select {...p} value={provider} onChange={(e) => changeProvider(e.target.value as AiProvider)}>
              {AI_PROVIDERS.map((id) => (
                <option key={id} value={id}>
                  {PROVIDERS[id].name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {provider === 'custom' && (
          <Field label="Endpoint address" hint="The base address ending in /v1, for example http://localhost:11434/v1" className="col-span-2">
            {(p) => <Input {...p} value={baseUrl} maxLength={300} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://" />}
          </Field>
        )}

        <div className="col-span-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[12.5px] font-medium text-ivory-dim">API key</span>
            {status?.hasKey ? (
              <Badge tone="ok">
                <Check size={11} className="mr-1" aria-hidden />
                {status.keyPersisted ? 'Key saved securely' : 'Key held for this session only'}
              </Badge>
            ) : (
              <Badge>{provider === 'custom' ? 'No key saved (optional)' : 'No key saved'}</Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              aria-label="API key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              maxLength={500}
              onChange={(e) => setKey(e.target.value)}
              placeholder={status?.hasKey ? 'Enter a new key to replace the saved one' : 'Paste your key'}
            />
            <Button
              icon={KeyRound}
              loading={busy === 'key'}
              disabled={key.trim().length < 8}
              onClick={() =>
                act('key', async () => {
                  await persist();
                  await call('ai:setKey', { provider, key });
                  setKey('');
                  await reloadAi();
                  toast('API key saved.');
                })
              }
            >
              Save key
            </Button>
            {status?.hasKey && (
              <Button
                variant="danger"
                icon={Trash2}
                loading={busy === 'clear'}
                onClick={() =>
                  act('clear', async () => {
                    await call('ai:clearKey', { provider });
                    await reloadAi();
                    toast('API key removed from this computer.');
                  })
                }
              >
                Remove
              </Button>
            )}
          </div>
          <p className="mt-1.5 flex items-start gap-2 text-[12px] leading-5 text-ivory-mute">
            <Lock size={12} className="mt-1 shrink-0" aria-hidden />
            <span>
              {meta.keyHint}{' '}
              {info?.encryptionAvailable
                ? 'The key is encrypted with Windows account protection, kept out of backups, and can never be displayed again after saving.'
                : 'Secure storage is unavailable on this computer, so the key will be kept only until you close the app.'}
            </span>
          </p>
        </div>

        <Field label="Model" hint={meta.modelHint} className="col-span-2">
          {(p) => (
            <div className="flex gap-2">
              <Input {...p} list="ai-models" value={model} maxLength={120} onChange={(e) => setModel(e.target.value)} placeholder="Model name" spellCheck={false} />
              <datalist id="ai-models">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <Button
                icon={RefreshCw}
                loading={busy === 'models'}
                onClick={() =>
                  act('models', async () => {
                    await persist();
                    const list = await call<string[]>('ai:listModels');
                    setModels(list);
                    if (list.length === 0) setError('The provider did not return any models.');
                    else toast(`${list.length} ${list.length === 1 ? 'model' : 'models'} found. Choose one below.`);
                  })
                }
              >
                Load available models
              </Button>
            </div>
          )}
        </Field>
        {models.length > 0 && (
          <div className="col-span-2 -mt-1 flex flex-wrap gap-1.5">
            {models.slice(0, 14).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModel(m)}
                className={`h-7 rounded-full border px-2.5 text-[12px] transition-colors ${m === model ? 'border-gold/70 bg-gold/10 text-gold-pale' : 'border-line text-ivory-dim hover:border-line-strong hover:text-ivory'}`}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="mt-4"><ErrorNote message={error} /></div>}
      {tested && (
        <p role="status" className="mt-4 flex items-center gap-2 text-[13px] text-ok">
          <Check size={15} aria-hidden /> Connection works. The assistant is ready.
        </p>
      )}

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-5">
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ivory-dim">
          <input
            type="checkbox"
            checked={settings!.ai.consent}
            onChange={(e) => void updateSettings({ ai: { consent: e.target.checked } }).then(reloadAi)}
            className="h-4 w-4"
          />
          I understand what is sent to the provider when I use the assistant
        </label>
        <div className="flex gap-2">
          <Button
            loading={busy === 'test'}
            disabled={model.trim() === ''}
            onClick={() =>
              act('test', async () => {
                await persist();
                await call('ai:test');
                setTested(true);
              })
            }
          >
            Test connection
          </Button>
          <Button variant="primary" loading={busy === 'save'} disabled={!dirty} onClick={() => act('save', async () => { await persist(); toast('AI settings saved.'); })}>
            Save AI settings
          </Button>
        </div>
      </div>
    </Section>
  );
}

function DataSection() {
  const { info, toast, reloadAll } = useApp();
  const [snapshots, setSnapshots] = useState<BackupEntry[]>([]);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    call<BackupEntry[]>('backup:listAutomatic').then(setSnapshots).catch(() => setSnapshots([]));
  }, []);

  const act = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try {
      await fn();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <Section title="Your data" description="Everything is stored in a single folder on this computer. Back it up regularly, especially before moving to a new PC.">
      <div className="grid grid-cols-2 gap-4">
        <ActionTile
          icon={Download}
          title="Create a backup"
          body="Saves all books, drafts, contacts, numbers and cover images to one file. API keys are not included."
          action={
            <Button icon={Download} loading={busy === 'backup'} onClick={() => act('backup', async () => { const path = await call<string | null>('backup:create'); if (path) toast(`Backup saved to ${path}`); })}>
              Back up now
            </Button>
          }
        />
        <ActionTile
          icon={Upload}
          title="Restore from a backup"
          body="Replaces everything currently in the studio with the contents of a backup file."
          action={
            <Button icon={Upload} loading={busy === 'restore'} onClick={() => setConfirmRestore(true)}>
              Restore
            </Button>
          }
        />
        <ActionTile
          icon={Database}
          title="Export everything as JSON"
          body="A readable copy of all your data for use in other tools. Does not include API keys."
          action={
            <Button icon={Download} loading={busy === 'json'} onClick={() => act('json', async () => { const path = await call<string | null>('export:json'); if (path) toast(`Export saved to ${path}`); })}>
              Export
            </Button>
          }
        />
        <ActionTile
          icon={FolderOpen}
          title="Data folder"
          body={info?.dataDir ?? ''}
          mono
          action={
            <Button icon={FolderOpen} onClick={() => act('folder', async () => void (await call('shell:openDataFolder')))}>
              Open folder
            </Button>
          }
        />
      </div>
      <p className="mt-4 text-[12.5px] leading-5 text-ivory-mute">
        {snapshots.length > 0
          ? `A safety copy of the database is made automatically each day you open the app. ${snapshots.length} recent ${snapshots.length === 1 ? 'copy is' : 'copies are'} kept in the "backups" folder inside your data folder.`
          : 'A safety copy of the database is made automatically each day you open the app and kept in the "backups" folder inside your data folder.'}
      </p>
      {confirmRestore && (
        <ConfirmDialog
          title="Restore from a backup?"
          confirmLabel="Choose backup file"
          danger={false}
          onCancel={() => setConfirmRestore(false)}
          onConfirm={() => {
            setConfirmRestore(false);
            void act('restore', async () => {
              const restored = await call<boolean>('backup:restore');
              if (restored) {
                await reloadAll();
                toast('Backup restored. A copy of your previous data was kept in the backups folder.');
              }
            });
          }}
          body={
            <>
              <p>Everything currently in the studio will be replaced by the backup you choose.</p>
              <p className="mt-3">A safety copy of your current data is saved first, so this can be undone by hand if needed.</p>
            </>
          }
        />
      )}
    </Section>
  );
}

function ActionTile({ icon: Icon, title, body, action, mono }: { icon: typeof Download; title: string; body: string; action: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col rounded-lg border border-line bg-ink-900/50 p-4">
      <div className="mb-1.5 flex items-center gap-2.5">
        <Icon size={15} strokeWidth={1.6} className="text-gold" aria-hidden />
        <h3 className="text-[13.5px] font-medium text-ivory">{title}</h3>
      </div>
      <p className={`mb-4 flex-1 text-[12.5px] leading-5 text-ivory-mute ${mono ? 'select-text break-all font-mono text-[11.5px]' : ''}`}>{body}</p>
      <div>{action}</div>
    </div>
  );
}

function DemoSection() {
  const { settings, books, reloadAll, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const hasDemo = books.some((b) => b.isDemo);

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      await call(on ? 'demo:enable' : 'demo:disable');
      await reloadAll();
      toast(on ? 'Sample book added and selected.' : 'Sample data removed.');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <Section title="Sample data" description="Explore the studio with a fictional book, campaigns, contacts and numbers. Sample data is always labeled and never mixed with your own.">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-ink-900/50 p-4">
        <div className="flex items-center gap-3">
          <FlaskConical size={16} className="text-warn" aria-hidden />
          <div>
            <p className="text-[13.5px] font-medium text-ivory">{hasDemo || settings?.demoMode ? 'Sample data is on' : 'Sample data is off'}</p>
            <p className="text-[12.5px] text-ivory-mute">{hasDemo ? 'Turning it off deletes the sample book and everything attached to it.' : 'Adds one sample book called "The Salt Road".'}</p>
          </div>
        </div>
        {hasDemo ? (
          <Button variant="danger" loading={busy} onClick={() => setConfirm(true)}>
            Remove sample data
          </Button>
        ) : (
          <Button loading={busy} onClick={() => void toggle(true)}>
            Add sample book
          </Button>
        )}
      </div>
      {confirm && (
        <ConfirmDialog
          title="Remove sample data?"
          body="The sample book and its campaigns, drafts, contacts and numbers will be deleted. Your own books are not affected."
          confirmLabel="Remove sample data"
          busy={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() => void toggle(false)}
        />
      )}
    </Section>
  );
}

function AboutSection() {
  const { info } = useApp();
  return (
    <Section title="About" description="BookBoost Studio is a private desktop app for planning and managing book marketing.">
      <dl className="grid grid-cols-[160px_1fr] gap-y-2.5 text-[13px]">
        <dt className="text-ivory-mute">Version</dt>
        <dd className="text-ivory">{info?.version}</dd>
        <dt className="text-ivory-mute">Privacy</dt>
        <dd className="leading-6 text-ivory-dim">No account, no telemetry, no analytics and no automatic updates. The app makes no network requests except the AI requests you start yourself.</dd>
        <dt className="text-ivory-mute">Publishing</dt>
        <dd className="leading-6 text-ivory-dim">The app never posts, emails or contacts anyone. It prepares the work, and you send it.</dd>
      </dl>
    </Section>
  );
}
