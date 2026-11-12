// The IPC contract between the renderer and the main process.
import type { AiProvider, DraftKind } from './schema';
import type { AssistantTemplate } from './prompts';

export interface ApiError {
  code: string;
  message: string;
}
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** Every channel the renderer may call. The preload script rejects anything else. */
export const IPC_CHANNELS = [
  'app:info',
  'settings:get',
  'settings:update',
  'entity:list',
  'entity:create',
  'entity:update',
  'entity:delete',
  'books:chooseCover',
  'drafts:revisions',
  'ai:status',
  'ai:setKey',
  'ai:clearKey',
  'ai:listModels',
  'ai:test',
  'ai:generate',
  'export:text',
  'export:csv',
  'export:json',
  'import:csv',
  'import:template',
  'backup:create',
  'backup:restore',
  'backup:listAutomatic',
  'demo:enable',
  'demo:disable',
  'shell:openExternal',
  'shell:openDataFolder',
] as const;
export type IpcChannel = (typeof IPC_CHANNELS)[number];

export interface AppInfo {
  version: string;
  dataDir: string;
  encryptionAvailable: boolean;
  platform: string;
}

export interface AiStatus {
  provider: AiProvider;
  model: string;
  baseUrl: string;
  consent: boolean;
  hasKey: boolean;
  /** False when the key is held in memory only because OS encryption is unavailable. */
  keyPersisted: boolean;
  encryptionAvailable: boolean;
  /** True when provider, model and key (where required) are all present. */
  ready: boolean;
}

export type GenerateRequest =
  | { type: 'content'; bookId: string; kind: DraftKind; brief: string; contactId?: string }
  | { type: 'assistant'; bookId: string; template: AssistantTemplate; question: string }
  | { type: 'revise'; bookId: string; body: string; instruction: string };

export interface GenerateResult {
  text: string;
  provider: AiProvider;
  model: string;
}

export interface ImportSummary {
  canceled: boolean;
  imported: number;
  errors: { row: number; message: string }[];
  missingRequired: string[];
}

export interface BackupEntry {
  name: string;
  createdAt: string;
  bytes: number;
}

export type CsvDataset = 'contacts' | 'metrics' | 'calendar';

export interface BookBoostBridge {
  invoke(channel: IpcChannel, payload?: unknown): Promise<ApiResult<unknown>>;
  /** Fires after a restore replaces the database so the UI can reload. */
  onDataReplaced(callback: () => void): () => void;
  /** Registers work to finish before the window closes, such as saving an open draft. */
  onBeforeClose(callback: () => Promise<unknown>): () => void;
}
