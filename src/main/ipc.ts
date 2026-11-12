// IPC handlers. Every call arrives on a single channel, is checked against
// the allow list, verified to come from the app window, and has its payload
// validated with zod before any work is done.
import { app, dialog, ipcMain, net, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { IPC_CHANNELS, type AiStatus, type ApiResult, type AppInfo, type GenerateResult, type ImportSummary, type IpcChannel } from '@shared/api';
import { AI_PROVIDERS, DRAFT_KINDS, ENTITY_NAMES, type EntityName } from '@shared/schema';
import { CONTACT_CSV_HEADERS, METRIC_CSV_HEADERS, importContacts, importMetrics, toCsv } from '@shared/csv';
import { ASSISTANT_TEMPLATES, SYSTEM_PROMPT, assistantPrompt, contentPrompt, revisePrompt, type AssistantTemplate } from '@shared/prompts';
import { safeFileName, todayISO } from '@shared/domain';
import { AiError, generateText, listModels } from './ai';
import { BackupError, createBackup, listSnapshots, restoreBackup, type Paths } from './backup';
import { disableDemo, enableDemo } from './demo';
import { NotFoundError, type Repository } from './repository';
import type { SecretStore } from './secrets';

export interface IpcContext {
  repo: Repository;
  secrets: SecretStore;
  paths: Paths & { dataDir: string };
  getWindow: () => BrowserWindow | null;
  isTrustedUrl: (url: string) => boolean;
}

class UserError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const MAX_COVER_BYTES = 10 * 1024 * 1024;
const MAX_CSV_BYTES = 5 * 1024 * 1024;
const idSchema = z.string().min(1).max(64);
const entitySchema = z.enum(ENTITY_NAMES as [EntityName, ...EntityName[]]);

export function registerIpc(ctx: IpcContext): void {
  const { repo, secrets, paths } = ctx;
  const fetchImpl = ((input: string, init?: RequestInit) => net.fetch(input, init)) as typeof fetch;

  const aiStatus = (): AiStatus => {
    const { ai } = repo.getSettings();
    const hasKey = secrets.has(ai.provider);
    return {
      provider: ai.provider,
      model: ai.model,
      baseUrl: ai.baseUrl,
      consent: ai.consent,
      hasKey,
      keyPersisted: secrets.isPersisted(ai.provider),
      encryptionAvailable: secrets.encryptionAvailable,
      ready: ai.model.trim() !== '' && (hasKey || (ai.provider === 'custom' && ai.baseUrl.trim() !== '')),
    };
  };

  const aiConfig = () => {
    const { ai } = repo.getSettings();
    return { provider: ai.provider, model: ai.model, baseUrl: ai.baseUrl, apiKey: secrets.get(ai.provider) };
  };

  const removeCover = (file: string) => {
    if (file) fs.rmSync(path.join(paths.coversDir, path.basename(file)), { force: true });
  };

  const save = async (defaultName: string, filters: Electron.FileFilter[]): Promise<string | null> => {
    const win = ctx.getWindow();
    const options = { defaultPath: path.join(app.getPath('documents'), defaultName), filters };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    return result.canceled || !result.filePath ? null : result.filePath;
  };

  const open = async (filters: Electron.FileFilter[]): Promise<string | null> => {
    const win = ctx.getWindow();
    const options: Electron.OpenDialogOptions = { properties: ['openFile'], filters };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  };

  const handlers: Record<IpcChannel, (payload: unknown) => unknown | Promise<unknown>> = {
    'app:info': (): AppInfo => ({
      version: app.getVersion(),
      dataDir: paths.dataDir,
      encryptionAvailable: secrets.encryptionAvailable,
      platform: process.platform,
    }),

    // ---------- Settings ----------
    'settings:get': () => repo.getSettings(),
    'settings:update': (payload) => repo.updateSettings(z.record(z.string(), z.unknown()).parse(payload)),

    // ---------- Entities ----------
    'entity:list': (payload) => {
      const { entity, filter } = z
        .object({ entity: entitySchema, filter: z.record(z.string(), z.string().max(64)).default({}) })
        .parse(payload);
      return repo.list(entity, filter);
    },
    'entity:create': (payload) => {
      const { entity, data } = z.object({ entity: entitySchema, data: z.record(z.string(), z.unknown()) }).parse(payload);
      return repo.create(entity, data as never);
    },
    'entity:update': (payload) => {
      const { entity, id, patch, snapshot } = z
        .object({ entity: entitySchema, id: idSchema, patch: z.record(z.string(), z.unknown()), snapshot: z.boolean().optional() })
        .parse(payload);
      const before = entity === 'books' ? repo.get('books', id) : undefined;
      const updated = repo.update(entity, id, patch as never, { snapshot });
      if (before && 'coverFile' in patch && before.coverFile && before.coverFile !== patch.coverFile) {
        removeCover(before.coverFile);
      }
      return updated;
    },
    'entity:delete': (payload) => {
      const { entity, id } = z.object({ entity: entitySchema, id: idSchema }).parse(payload);
      const book = entity === 'books' ? repo.get('books', id) : undefined;
      repo.delete(entity, id);
      if (book) {
        removeCover(book.coverFile);
        const settings = repo.getSettings();
        if (settings.activeBookId === id) {
          const next = repo.list('books').find((b) => b.status === 'active');
          repo.updateSettings({ activeBookId: next?.id ?? '', ...(book.isDemo ? { demoMode: false } : {}) });
        } else if (book.isDemo) {
          repo.updateSettings({ demoMode: false });
        }
      }
      return true;
    },

    'books:chooseCover': async () => {
      const file = await open([{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]);
      if (!file) return null;
      const ext = path.extname(file).slice(1).toLowerCase();
      if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
        throw new UserError('invalid_file', 'Choose a PNG, JPG or WebP image.');
      }
      if (fs.statSync(file).size > MAX_COVER_BYTES) {
        throw new UserError('too_large', 'That image is larger than 10 MB. Choose a smaller file.');
      }
      fs.mkdirSync(paths.coversDir, { recursive: true });
      const name = `${randomUUID()}.${ext}`;
      fs.copyFileSync(file, path.join(paths.coversDir, name));
      return name;
    },

    'drafts:revisions': (payload) => repo.revisions(z.object({ draftId: idSchema }).parse(payload).draftId),

    // ---------- AI ----------
    'ai:status': () => aiStatus(),
    'ai:setKey': (payload) => {
      const { provider, key } = z
        .object({ provider: z.enum(AI_PROVIDERS), key: z.string().trim().min(8, 'That key looks too short.').max(500) })
        .parse(payload);
      secrets.set(provider, key);
      return aiStatus();
    },
    'ai:clearKey': (payload) => {
      secrets.clear(z.object({ provider: z.enum(AI_PROVIDERS) }).parse(payload).provider);
      return aiStatus();
    },
    'ai:listModels': () => {
      const { model: _model, ...config } = aiConfig();
      return listModels(config, fetchImpl);
    },
    'ai:test': async () => {
      await generateText(aiConfig(), { system: 'Reply with the single word: ready', prompt: 'Connection test.', maxTokens: 16 }, fetchImpl);
      return true;
    },
    'ai:generate': async (payload): Promise<GenerateResult> => {
      const request = z
        .discriminatedUnion('type', [
          z.object({
            type: z.literal('content'),
            bookId: idSchema,
            kind: z.enum(DRAFT_KINDS),
            brief: z.string().max(6000),
            contactId: idSchema.optional(),
          }),
          z.object({
            type: z.literal('assistant'),
            bookId: idSchema,
            template: z.enum(Object.keys(ASSISTANT_TEMPLATES) as [AssistantTemplate, ...AssistantTemplate[]]),
            question: z.string().max(6000),
          }),
          z.object({
            type: z.literal('revise'),
            bookId: idSchema,
            body: z.string().min(1).max(80000),
            instruction: z.string().trim().min(1, 'Describe the change you want.').max(4000),
          }),
        ])
        .parse(payload);

      const settings = repo.getSettings();
      if (!settings.ai.consent) {
        throw new AiError('consent_required', 'Review and accept the AI privacy notice before generating.');
      }
      const book = repo.require('books', request.bookId);
      const author = settings.author;
      let prompt: string;
      if (request.type === 'content') {
        const contact = request.contactId ? repo.require('contacts', request.contactId) : undefined;
        if (contact && contact.consent === 'do_not_contact') {
          throw new UserError('do_not_contact', 'This contact is marked do not contact, so a pitch cannot be drafted.');
        }
        prompt = contentPrompt({ book, author, kind: request.kind, brief: request.brief, contact });
      } else if (request.type === 'assistant') {
        prompt = assistantPrompt({ book, author, template: request.template, question: request.question });
      } else {
        prompt = revisePrompt({ book, author, body: request.body, instruction: request.instruction });
      }
      const config = aiConfig();
      const text = await generateText(config, { system: SYSTEM_PROMPT, prompt }, fetchImpl);
      return { text, provider: config.provider, model: config.model };
    },

    // ---------- Export ----------
    'export:text': async (payload) => {
      const { name, content, format } = z
        .object({ name: z.string().max(200), content: z.string().max(2_000_000), format: z.enum(['txt', 'md', 'html']) })
        .parse(payload);
      const labels = { txt: 'Plain text', md: 'Markdown', html: 'Web page' };
      const target = await save(`${safeFileName(name)}.${format}`, [{ name: labels[format], extensions: [format] }]);
      if (!target) return null;
      fs.writeFileSync(target, content, 'utf8');
      return target;
    },
    'export:csv': async (payload) => {
      const { dataset, bookId } = z.object({ dataset: z.enum(['contacts', 'metrics', 'calendar']), bookId: idSchema }).parse(payload);
      const book = repo.require('books', bookId);
      let csv: string;
      if (dataset === 'contacts') {
        csv = toCsv(
          CONTACT_CSV_HEADERS,
          repo.list('contacts', { bookId }).map((c) => [c.name, c.outlet, c.type, c.email, c.url, c.status, c.consent, c.lastContacted, c.nextFollowUp, c.notes]),
        );
      } else if (dataset === 'metrics') {
        csv = toCsv(
          METRIC_CSV_HEADERS,
          repo.list('metrics', { bookId }).map((m) => [m.date, m.metric, m.value, m.channel, m.source, m.note]),
        );
      } else {
        const drafts = new Map(repo.list('drafts', { bookId }).map((d) => [d.id, d]));
        csv = toCsv(
          ['date', 'time', 'channel', 'title', 'status', 'content', 'notes'],
          repo
            .list('calendarItems', { bookId })
            .map((i) => [i.scheduledDate, i.scheduledTime, i.channel, i.title, i.status, drafts.get(i.draftId)?.body ?? '', i.notes]),
        );
      }
      const target = await save(`${safeFileName(book.title)} ${dataset} ${todayISO()}.csv`, [{ name: 'CSV', extensions: ['csv'] }]);
      if (!target) return null;
      // A byte order mark makes Excel open the file as UTF-8.
      fs.writeFileSync(target, `﻿${csv}`, 'utf8');
      return target;
    },
    'export:json': async () => {
      const target = await save(`BookBoost Studio data ${todayISO()}.json`, [{ name: 'JSON', extensions: ['json'] }]);
      if (!target) return null;
      const { ai, ...settings } = repo.getSettings();
      const data: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        appVersion: app.getVersion(),
        settings: { ...settings, ai: { provider: ai.provider, model: ai.model } },
      };
      for (const entity of ENTITY_NAMES) data[entity] = repo.list(entity);
      fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf8');
      return target;
    },

    // ---------- Import ----------
    'import:csv': async (payload): Promise<ImportSummary> => {
      const { dataset, bookId } = z.object({ dataset: z.enum(['contacts', 'metrics']), bookId: idSchema }).parse(payload);
      repo.require('books', bookId);
      const file = await open([{ name: 'CSV', extensions: ['csv'] }]);
      if (!file) return { canceled: true, imported: 0, errors: [], missingRequired: [] };
      if (fs.statSync(file).size > MAX_CSV_BYTES) throw new UserError('too_large', 'That file is larger than 5 MB.');
      const text = fs.readFileSync(file, 'utf8');

      if (dataset === 'contacts') {
        const result = importContacts(text, bookId);
        const seen = new Set(repo.list('contacts', { bookId }).map((c) => `${c.name.toLowerCase()}|${c.email.toLowerCase()}`));
        const fresh = result.valid.filter((c, i) => {
          const key = `${c.name.toLowerCase()}|${c.email.toLowerCase()}`;
          if (seen.has(key)) {
            result.errors.push({ row: i + 2, message: `${c.name} is already in your contacts, so it was skipped` });
            return false;
          }
          seen.add(key);
          return true;
        });
        repo.createMany('contacts', fresh);
        return { canceled: false, imported: fresh.length, errors: result.errors.slice(0, 50), missingRequired: result.missingRequired };
      }
      const result = importMetrics(text, bookId);
      repo.createMany('metrics', result.valid);
      return { canceled: false, imported: result.valid.length, errors: result.errors.slice(0, 50), missingRequired: result.missingRequired };
    },
    'import:template': async (payload) => {
      const { dataset } = z.object({ dataset: z.enum(['contacts', 'metrics']) }).parse(payload);
      const csv =
        dataset === 'contacts'
          ? toCsv(CONTACT_CSV_HEADERS, [['Jane Example', 'Example Book Blog', 'reviewer', 'jane@example.com', 'https://example.com', 'prospect', 'public_contact', '', '', 'Accepts review requests through her site']])
          : toCsv(METRIC_CSV_HEADERS, [
              ['2026-01-15', 'units_sold', 12, 'Amazon', 'verified', 'From the KDP report'],
              ['2026-01-15', 'link_clicks', 48, 'Newsletter', 'user_entered', ''],
            ]);
      const target = await save(`BookBoost ${dataset} template.csv`, [{ name: 'CSV', extensions: ['csv'] }]);
      if (!target) return null;
      fs.writeFileSync(target, `﻿${csv}`, 'utf8');
      return target;
    },

    // ---------- Backup ----------
    'backup:create': async () => {
      const target = await save(`BookBoost Studio backup ${todayISO()}.bbbackup`, [{ name: 'BookBoost Studio backup', extensions: ['bbbackup'] }]);
      if (!target) return null;
      createBackup(repo.database, paths, target, app.getVersion());
      return target;
    },
    'backup:restore': async () => {
      const source = await open([{ name: 'BookBoost Studio backup', extensions: ['bbbackup'] }]);
      if (!source) return false;
      const restored = await restoreBackup(repo.database, paths, source);
      repo.attach(restored);
      ctx.getWindow()?.webContents.send('bookboost:data-replaced');
      return true;
    },
    'backup:listAutomatic': () => listSnapshots(paths),

    // ---------- Demo ----------
    'demo:enable': () => enableDemo(repo),
    'demo:disable': () => {
      disableDemo(repo);
      return true;
    },

    // ---------- Shell ----------
    'shell:openExternal': async (payload) => {
      const { url } = z.object({ url: z.string().max(2000) }).parse(payload);
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new UserError('invalid_url', 'That link is not valid.');
      }
      if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) {
        throw new UserError('invalid_url', 'Only web and email links can be opened.');
      }
      await shell.openExternal(parsed.toString());
      return true;
    },
    'shell:openDataFolder': async () => {
      await shell.openPath(paths.dataDir);
      return true;
    },
  };

  ipcMain.handle('bookboost', async (event: IpcMainInvokeEvent, channel: unknown, payload: unknown): Promise<ApiResult<unknown>> => {
    try {
      const frameUrl = event.senderFrame?.url ?? '';
      const win = ctx.getWindow();
      if (!win || event.sender.id !== win.webContents.id || !ctx.isTrustedUrl(frameUrl)) {
        return { ok: false, error: { code: 'forbidden', message: 'This request was blocked.' } };
      }
      if (typeof channel !== 'string' || !(IPC_CHANNELS as readonly string[]).includes(channel)) {
        return { ok: false, error: { code: 'forbidden', message: 'This request was blocked.' } };
      }
      const data = await handlers[channel as IpcChannel](payload);
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toApiError(error) };
    }
  });
}

function toApiError(error: unknown): { code: string; message: string } {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    return { code: 'validation', message: issue?.message ?? 'Some of the information entered is not valid.' };
  }
  if (error instanceof AiError || error instanceof UserError) return { code: error.code, message: error.message };
  if (error instanceof BackupError) return { code: 'backup', message: error.message };
  if (error instanceof NotFoundError) return { code: 'not_found', message: error.message };
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'EACCES' || code === 'EPERM' || code === 'EBUSY') {
    return { code: 'file_access', message: 'That file or folder could not be written. It may be open in another program or protected.' };
  }
  if (code === 'ENOSPC') return { code: 'disk_full', message: 'There is not enough free disk space to finish.' };
  console.error('[bookboost] unexpected error', error);
  return { code: 'unexpected', message: 'Something went wrong. Your saved data has not been affected.' };
}
