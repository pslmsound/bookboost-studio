// AI provider adapter. One function per capability, with the HTTP client
// injected so the adapter can be tested without a network. API keys only
// ever exist in the main process.
import type { AiProvider } from '@shared/schema';

export type AiErrorCode =
  | 'not_configured'
  | 'consent_required'
  | 'network'
  | 'timeout'
  | 'auth'
  | 'rate_limit'
  | 'bad_request'
  | 'provider'
  | 'empty';

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface AiConfig {
  provider: AiProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
}

export interface AiRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
}

type FetchLike = typeof fetch;
const TIMEOUT_MS = 120_000;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1';
const OPENAI_URL = 'https://api.openai.com/v1';

/** Custom endpoints must use HTTPS, except a server on this computer. */
export function resolveBaseUrl(provider: AiProvider, baseUrl: string): string {
  if (provider === 'anthropic') return ANTHROPIC_URL;
  if (provider === 'openai') return OPENAI_URL;
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new AiError('not_configured', 'Enter the full address of your AI endpoint in Settings, for example https://example.com/v1.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new AiError('not_configured', 'A custom AI endpoint must use https, unless it runs on this computer.');
  }
  return url.toString().replace(/\/+$/, '');
}

export function assertConfigured(config: AiConfig): void {
  if (!config.model.trim()) {
    throw new AiError('not_configured', 'Choose an AI model in Settings before generating.');
  }
  if (config.provider !== 'custom' && !config.apiKey) {
    throw new AiError('not_configured', 'Add your AI provider key in Settings before generating.');
  }
  resolveBaseUrl(config.provider, config.baseUrl);
}

function headers(config: AiConfig): Record<string, string> {
  const base: Record<string, string> = { 'content-type': 'application/json' };
  if (config.provider === 'anthropic') {
    base['x-api-key'] = config.apiKey;
    base['anthropic-version'] = '2023-06-01';
  } else if (config.apiKey) {
    base.authorization = `Bearer ${config.apiKey}`;
  }
  return base;
}

async function request(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new AiError('timeout', 'The AI provider took too long to respond. Please try again.');
    }
    throw new AiError('network', 'Could not reach the AI provider. Check your internet connection and try again.');
  } finally {
    clearTimeout(timer);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non JSON responses are handled by the status checks below.
  }
  if (response.ok) return body;

  const detail = providerMessage(body);
  if (response.status === 401 || response.status === 403) {
    throw new AiError('auth', 'The AI provider rejected the key. Check that it is correct and active in Settings.');
  }
  if (response.status === 429) {
    throw new AiError('rate_limit', 'The AI provider is limiting requests or the account is out of credit. Wait a moment, then try again.');
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    throw new AiError('bad_request', `The AI provider could not process the request${detail ? `: ${detail}` : '. Check the model name in Settings.'}`);
  }
  throw new AiError('provider', `The AI provider returned an error (${response.status})${detail ? `: ${detail}` : '.'}`);
}

function providerMessage(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const error = (body as { error?: unknown }).error;
  if (typeof error === 'string') return error.slice(0, 240);
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message.slice(0, 240);
  }
  return '';
}

export async function generateText(config: AiConfig, req: AiRequest, fetchImpl: FetchLike = fetch): Promise<string> {
  assertConfigured(config);
  const base = resolveBaseUrl(config.provider, config.baseUrl);
  let text = '';

  if (config.provider === 'anthropic') {
    const body = (await request(fetchImpl, `${base}/messages`, {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify({
        model: config.model.trim(),
        max_tokens: req.maxTokens ?? 4000,
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
      }),
    })) as { content?: { type?: string; text?: string }[] };
    text = (body?.content ?? [])
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('');
  } else {
    const body = (await request(fetchImpl, `${base}/chat/completions`, {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify({
        model: config.model.trim(),
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.prompt },
        ],
      }),
    })) as { choices?: { message?: { content?: unknown } }[] };
    const content = body?.choices?.[0]?.message?.content;
    text = typeof content === 'string' ? content : '';
  }

  text = text.trim();
  if (!text) throw new AiError('empty', 'The AI provider returned an empty response. Please try again.');
  return text;
}

export async function listModels(config: Omit<AiConfig, 'model'>, fetchImpl: FetchLike = fetch): Promise<string[]> {
  if (config.provider !== 'custom' && !config.apiKey) {
    throw new AiError('not_configured', 'Save your API key first, then load the model list.');
  }
  const base = resolveBaseUrl(config.provider, config.baseUrl);
  const url = config.provider === 'anthropic' ? `${base}/models?limit=100` : `${base}/models`;
  const body = (await request(fetchImpl, url, { method: 'GET', headers: headers({ ...config, model: '' }) })) as {
    data?: { id?: unknown }[];
  };
  const ids = (body?.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string');
  // Hide models that cannot write text, such as embeddings and audio.
  const hidden = /(embed|whisper|tts|dall-e|image|audio|moderation|realtime|transcribe)/i;
  return ids.filter((id) => !hidden.test(id)).sort((a, b) => a.localeCompare(b));
}
