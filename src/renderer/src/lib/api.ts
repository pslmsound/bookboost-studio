// Typed wrapper around the preload bridge.
import type { ApiResult, BookBoostBridge, IpcChannel } from '@shared/api';
import type { EntityInput, EntityMap, EntityName } from '@shared/schema';

declare global {
  interface Window {
    bookboost: BookBoostBridge;
  }
}

export class ApiCallError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function call<T>(channel: IpcChannel, payload?: unknown): Promise<T> {
  let result: ApiResult<unknown>;
  try {
    result = await window.bookboost.invoke(channel, payload);
  } catch {
    throw new ApiCallError('bridge', 'The app could not complete that request. Please try again.');
  }
  if (!result.ok) throw new ApiCallError(result.error.code, result.error.message);
  return result.data as T;
}

export const db = {
  list: <K extends EntityName>(entity: K, filter: Record<string, string> = {}) =>
    call<EntityMap[K][]>('entity:list', { entity, filter }),
  create: <K extends EntityName>(entity: K, data: EntityInput<K>) => call<EntityMap[K]>('entity:create', { entity, data }),
  update: <K extends EntityName>(entity: K, id: string, patch: Partial<EntityInput<K>>, snapshot = false) =>
    call<EntityMap[K]>('entity:update', { entity, id, patch, snapshot }),
  remove: (entity: EntityName, id: string) => call<boolean>('entity:delete', { entity, id }),
};

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export const coverUrl = (file: string) => (file ? `bbimg://covers/${file}` : '');
