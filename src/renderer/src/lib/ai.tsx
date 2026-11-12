// AI request hook. Handles the three states that must never surprise the
// author: not configured, consent not yet given, and provider failure.
import { useCallback, useRef, useState } from 'react';
import { ShieldCheck, Sparkles } from 'lucide-react';
import type { GenerateRequest, GenerateResult } from '@shared/api';
import { Button, Modal, Notice } from '../components/ui';
import { call, errorMessage, ApiCallError } from './api';
import { useApp } from './store';

const PROVIDER_NAMES = { anthropic: 'Anthropic', openai: 'OpenAI', custom: 'your custom endpoint' } as const;

export function useAi() {
  const { ai, updateSettings, reloadAi, navigate } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consentOpen, setConsentOpen] = useState(false);
  const pending = useRef<{ request: GenerateRequest; resolve: (r: GenerateResult | null) => void } | null>(null);

  const execute = useCallback(async (request: GenerateRequest): Promise<GenerateResult | null> => {
    setBusy(true);
    setError('');
    try {
      return await call<GenerateResult>('ai:generate', request);
    } catch (e) {
      if (e instanceof ApiCallError && e.code === 'consent_required') {
        return new Promise((resolve) => {
          pending.current = { request, resolve };
          setConsentOpen(true);
        });
      }
      setError(errorMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const run = useCallback(
    async (request: GenerateRequest): Promise<GenerateResult | null> => {
      if (!ai?.ready) {
        setError('The AI assistant is not set up yet. Add a provider and key in Settings.');
        return null;
      }
      if (!ai.consent) {
        return new Promise((resolve) => {
          pending.current = { request, resolve };
          setConsentOpen(true);
        });
      }
      return execute(request);
    },
    [ai, execute],
  );

  const accept = async () => {
    const waiting = pending.current;
    pending.current = null;
    setConsentOpen(false);
    await updateSettings({ ai: { consent: true } });
    await reloadAi();
    if (waiting) waiting.resolve(await execute(waiting.request));
  };
  const decline = () => {
    pending.current?.resolve(null);
    pending.current = null;
    setConsentOpen(false);
  };

  const provider = ai ? PROVIDER_NAMES[ai.provider] : 'your AI provider';
  const consentModal = consentOpen ? (
    <Modal
      title="Before your first AI request"
      onClose={decline}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={decline}>
            Not now
          </Button>
          <Button variant="primary" icon={ShieldCheck} onClick={accept} data-autofocus>
            I understand, continue
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-[13.5px] leading-6 text-ivory-dim">
        <p>
          Everything in BookBoost Studio stays on this computer. The one exception is when you ask the AI assistant to write
          or revise something.
        </p>
        <p>
          When you do, the app sends the details of the selected book (title, summary, audience, voice, goals and links),
          your author bio, your brief, and any draft you ask it to revise to <span className="text-ivory">{provider}</span>,
          using your own API key. Contact notes are included only when you draft a pitch for that contact.
        </p>
        <p>
          That provider handles the content under its own terms and privacy policy. Avoid including anything confidential
          that you would not want to share with them. Nothing is sent in the background, and no data goes to the makers of
          this app.
        </p>
      </div>
    </Modal>
  ) : null;

  return { run, busy, error, clearError: () => setError(''), consentModal, ready: !!ai?.ready, goToSettings: () => navigate('settings', 'ai') };
}

/** Shown in place of AI controls when no provider is configured. */
export function AiSetupNotice({ onSetup }: { onSetup: () => void }) {
  return (
    <Notice icon={Sparkles}>
      <p className="text-ivory">The AI assistant is optional and not set up yet.</p>
      <p className="mt-0.5">
        You can write and manage everything by hand. To generate drafts, connect your own AI provider key.
      </p>
      <Button size="sm" className="mt-3" onClick={onSetup}>
        Set up AI in Settings
      </Button>
    </Notice>
  );
}
