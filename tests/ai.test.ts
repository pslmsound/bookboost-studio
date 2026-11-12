import { describe, expect, it, vi } from 'vitest';
import { AiError, generateText, listModels, resolveBaseUrl, type AiConfig } from '../src/main/ai';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const anthropic: AiConfig = { provider: 'anthropic', model: 'claude-test', baseUrl: '', apiKey: 'sk-ant-secret' };
const openai: AiConfig = { provider: 'openai', model: 'gpt-test', baseUrl: '', apiKey: 'sk-secret' };
const req = { system: 'sys', prompt: 'hello' };
const code = async (p: Promise<unknown>) => p.then(() => 'none', (e) => (e as AiError).code);

describe('generateText', () => {
  it('calls Anthropic with the right endpoint, headers and body', async () => {
    const fetchMock = vi.fn(async () => json(200, { content: [{ type: 'text', text: ' Hello ' }, { type: 'text', text: 'there' }] }));
    const text = await generateText(anthropic, req, fetchMock as unknown as typeof fetch);
    expect(text).toBe('Hello there');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-secret');
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'claude-test', system: 'sys', messages: [{ role: 'user', content: 'hello' }] });
  });
  it('calls OpenAI compatible chat completions', async () => {
    const fetchMock = vi.fn(async () => json(200, { choices: [{ message: { content: 'Draft' } }] }));
    expect(await generateText(openai, req, fetchMock as unknown as typeof fetch)).toBe('Draft');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-secret');
  });
  it('fails clearly before any request when not configured', async () => {
    const fetchMock = vi.fn();
    expect(await code(generateText({ ...anthropic, apiKey: '' }, req, fetchMock as unknown as typeof fetch))).toBe('not_configured');
    expect(await code(generateText({ ...anthropic, model: ' ' }, req, fetchMock as unknown as typeof fetch))).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('maps provider failures to friendly error codes', async () => {
    const run = (status: number) => code(generateText(anthropic, req, (async () => json(status, { error: { message: 'detail' } })) as unknown as typeof fetch));
    expect(await run(401)).toBe('auth');
    expect(await run(429)).toBe('rate_limit');
    expect(await run(404)).toBe('bad_request');
    expect(await run(500)).toBe('provider');
  });
  it('reports network failures, empty responses and never leaks the key in messages', async () => {
    const offline = (async () => { throw new TypeError('fetch failed sk-ant-secret'); }) as unknown as typeof fetch;
    const error = await generateText(anthropic, req, offline).catch((e) => e as AiError);
    expect((error as AiError).code).toBe('network');
    expect((error as AiError).message).not.toContain('sk-ant-secret');
    expect(await code(generateText(anthropic, req, (async () => json(200, { content: [] })) as unknown as typeof fetch))).toBe('empty');
  });
});

describe('custom endpoints', () => {
  it('requires https except on this computer', () => {
    expect(resolveBaseUrl('custom', 'http://localhost:11434/v1/')).toBe('http://localhost:11434/v1');
    expect(resolveBaseUrl('custom', 'https://ai.example.com/v1')).toBe('https://ai.example.com/v1');
    expect(() => resolveBaseUrl('custom', 'http://ai.example.com/v1')).toThrow(AiError);
    expect(() => resolveBaseUrl('custom', 'not a url')).toThrow(AiError);
  });
  it('works without a key for a local server', async () => {
    const fetchMock = vi.fn(async () => json(200, { choices: [{ message: { content: 'ok' } }] }));
    await generateText({ provider: 'custom', model: 'local', baseUrl: 'http://127.0.0.1:1234/v1', apiKey: '' }, req, fetchMock as unknown as typeof fetch);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });
});

describe('listModels', () => {
  it('returns sorted text models and hides others', async () => {
    const fetchMock = (async () => json(200, { data: [{ id: 'gpt-b' }, { id: 'text-embedding-3' }, { id: 'gpt-a' }, { id: 'whisper-1' }] })) as unknown as typeof fetch;
    expect(await listModels({ provider: 'openai', baseUrl: '', apiKey: 'k' }, fetchMock)).toEqual(['gpt-a', 'gpt-b']);
  });
  it('needs a key for hosted providers', async () => {
    expect(await code(listModels({ provider: 'anthropic', baseUrl: '', apiKey: '' }, vi.fn() as unknown as typeof fetch))).toBe('not_configured');
  });
});
