// Data access for every entity. All SQL is parameterized and column names
// come only from the validated schema keys defined here, never from callers.
import { randomUUID } from 'node:crypto';
import type { SqlValue } from 'sql.js';
import { z } from 'zod';
import type { Db, Row } from './database';
import {
  ENTITY_SCHEMAS,
  settingsSchema,
  type DraftRevision,
  type EntityInput,
  type EntityMap,
  type EntityName,
  type Settings,
} from '@shared/schema';

interface Spec {
  table: string;
  json: string[];
  bool: string[];
  /** Optional references stored as NULL in SQL and '' in the app. */
  nullable: string[];
  filters: string[];
  order: string;
}

const SPECS: Record<EntityName, Spec> = {
  books: { table: 'books', json: ['channels', 'purchaseLinks'], bool: ['isDemo'], nullable: [], filters: ['status'], order: 'created_at ASC' },
  campaigns: { table: 'campaigns', json: ['channels'], bool: [], nullable: [], filters: ['bookId', 'status'], order: "CASE WHEN start_date = '' THEN 1 ELSE 0 END, start_date ASC, created_at ASC" },
  tasks: { table: 'tasks', json: [], bool: ['done', 'isMilestone'], nullable: [], filters: ['bookId', 'campaignId'], order: "sort_order ASC, CASE WHEN due_date = '' THEN 1 ELSE 0 END, due_date ASC, created_at ASC" },
  drafts: { table: 'drafts', json: [], bool: [], nullable: ['campaignId', 'contactId'], filters: ['bookId', 'kind', 'status', 'contactId', 'campaignId'], order: 'updated_at DESC' },
  calendarItems: { table: 'calendar_items', json: [], bool: [], nullable: ['campaignId', 'draftId'], filters: ['bookId', 'campaignId', 'status'], order: 'scheduled_date ASC, scheduled_time ASC, created_at ASC' },
  contacts: { table: 'contacts', json: [], bool: [], nullable: [], filters: ['bookId', 'status', 'type'], order: 'name COLLATE NOCASE ASC' },
  metrics: { table: 'metrics', json: [], bool: [], nullable: [], filters: ['bookId', 'metric'], order: 'date DESC, created_at DESC' },
};

const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const MAX_REVISIONS = 25;
const REVISION_INTERVAL_MS = 3 * 60 * 1000;

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} could not be found. It may have been deleted.`);
  }
}

export class Repository {
  constructor(private db: Db) {}

  /** Replaces the underlying database, used after a restore. */
  attach(db: Db) {
    this.db = db;
  }
  get database(): Db {
    return this.db;
  }

  private keys(entity: EntityName): string[] {
    return Object.keys(ENTITY_SCHEMAS[entity].shape);
  }

  private toSql(entity: EntityName, key: string, value: unknown): SqlValue {
    const spec = SPECS[entity];
    if (spec.json.includes(key)) return JSON.stringify(value);
    if (spec.bool.includes(key)) return value ? 1 : 0;
    if (spec.nullable.includes(key)) return value === '' ? null : (value as string);
    return value as SqlValue;
  }

  private fromRow<K extends EntityName>(entity: K, row: Row): EntityMap[K] {
    const spec = SPECS[entity];
    const out: Record<string, unknown> = {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    for (const key of this.keys(entity)) {
      const raw = row[snake(key)];
      if (spec.json.includes(key)) {
        try {
          out[key] = JSON.parse(String(raw ?? '[]'));
        } catch {
          out[key] = [];
        }
      } else if (spec.bool.includes(key)) out[key] = raw === 1;
      else if (spec.nullable.includes(key)) out[key] = raw ?? '';
      else out[key] = raw;
    }
    return out as unknown as EntityMap[K];
  }

  list<K extends EntityName>(entity: K, filter: Record<string, string> = {}): EntityMap[K][] {
    const spec = SPECS[entity];
    const where: string[] = [];
    const params: SqlValue[] = [];
    for (const [key, value] of Object.entries(filter)) {
      if (!spec.filters.includes(key)) throw new Error(`Cannot filter ${entity} by ${key}.`);
      where.push(`${snake(key)} = ?`);
      params.push(value);
    }
    const sql = `SELECT * FROM ${spec.table}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${spec.order}`;
    return this.db.all(sql, params).map((row) => this.fromRow(entity, row));
  }

  get<K extends EntityName>(entity: K, id: string): EntityMap[K] | undefined {
    const row = this.db.get(`SELECT * FROM ${SPECS[entity].table} WHERE id = ?`, [id]);
    return row ? this.fromRow(entity, row) : undefined;
  }

  require<K extends EntityName>(entity: K, id: string): EntityMap[K] {
    const found = this.get(entity, id);
    if (!found) throw new NotFoundError('That item');
    return found;
  }

  create<K extends EntityName>(entity: K, input: EntityInput<K>): EntityMap[K] {
    const data = (ENTITY_SCHEMAS[entity] as z.ZodType).parse(input) as Record<string, unknown>;
    const id = randomUUID();
    const now = new Date().toISOString();
    const keys = this.keys(entity);
    const columns = ['id', ...keys.map(snake), 'created_at', 'updated_at'];
    const values: SqlValue[] = [id, ...keys.map((k) => this.toSql(entity, k, data[k])), now, now];
    this.db.run(
      `INSERT INTO ${SPECS[entity].table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      values,
    );
    return this.require(entity, id);
  }

  /**
   * Updates a record. For drafts, the previous body is kept as a revision.
   * Routine saves are throttled so autosave does not flood the history;
   * pass snapshot: true to always keep the previous version (used before an
   * AI rewrite or a restore).
   */
  update<K extends EntityName>(entity: K, id: string, patch: Partial<EntityInput<K>>, options: { snapshot?: boolean } = {}): EntityMap[K] {
    const existing = this.require(entity, id);
    const allowed = this.keys(entity);
    const provided = Object.keys(patch as object).filter((k) => allowed.includes(k));
    // Validate the merged record so cross field rules and required values still hold.
    const merged = (ENTITY_SCHEMAS[entity] as z.ZodType).parse({ ...existing, ...patch }) as Record<string, unknown>;
    if (provided.length === 0) return existing;

    return this.db.transaction(() => {
      if (entity === 'drafts' && provided.includes('body')) {
        const before = (existing as EntityMap['drafts']).body;
        if (before !== merged.body && before.trim() !== '') {
          const latest = this.db.get<{ created_at: string }>(
            'SELECT created_at FROM draft_revisions WHERE draft_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
            [id],
          );
          const recent = latest ? Date.now() - new Date(latest.created_at).getTime() < REVISION_INTERVAL_MS : false;
          if (options.snapshot || !recent) this.addRevision(id, before);
        }
      }
      const sets = provided.map((k) => `${snake(k)} = ?`);
      const values: SqlValue[] = provided.map((k) => this.toSql(entity, k, merged[k]));
      this.db.run(`UPDATE ${SPECS[entity].table} SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [
        ...values,
        new Date().toISOString(),
        id,
      ]);
      return this.require(entity, id);
    });
  }

  delete(entity: EntityName, id: string): void {
    this.db.run(`DELETE FROM ${SPECS[entity].table} WHERE id = ?`, [id]);
  }

  /** Inserts many records in one transaction. Used by CSV import and demo data. */
  createMany<K extends EntityName>(entity: K, inputs: EntityInput<K>[]): number {
    return this.db.transaction(() => {
      for (const input of inputs) this.create(entity, input);
      return inputs.length;
    });
  }

  // ---------- Draft revisions ----------
  private addRevision(draftId: string, body: string) {
    this.db.run('INSERT INTO draft_revisions (id, draft_id, body, created_at) VALUES (?, ?, ?, ?)', [
      randomUUID(),
      draftId,
      body,
      new Date().toISOString(),
    ]);
    this.db.run(
      `DELETE FROM draft_revisions WHERE draft_id = ? AND id NOT IN (
         SELECT id FROM draft_revisions WHERE draft_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)`,
      [draftId, draftId, MAX_REVISIONS],
    );
  }

  revisions(draftId: string): DraftRevision[] {
    return this.db
      .all('SELECT * FROM draft_revisions WHERE draft_id = ? ORDER BY created_at DESC, rowid DESC', [draftId])
      .map((r) => ({ id: String(r.id), draftId: String(r.draft_id), body: String(r.body), createdAt: String(r.created_at) }));
  }

  // ---------- Settings ----------
  getSettings(): Settings {
    const raw: Record<string, unknown> = {};
    for (const row of this.db.all('SELECT key, value FROM settings')) {
      try {
        raw[String(row.key)] = JSON.parse(String(row.value));
      } catch {
        // A corrupt value falls back to its default.
      }
    }
    const parsed = settingsSchema.safeParse(raw);
    return parsed.success ? parsed.data : settingsSchema.parse({});
  }

  updateSettings(patch: Record<string, unknown>): Settings {
    const current = this.getSettings() as unknown as Record<string, unknown>;
    const next: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in settingsSchema.shape)) continue;
      const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
      next[key] = isObject ? { ...(current[key] as object), ...(value as object) } : value;
    }
    const validated = settingsSchema.parse(next) as unknown as Record<string, unknown>;
    this.db.transaction(() => {
      for (const [key, value] of Object.entries(validated)) {
        this.db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
          key,
          JSON.stringify(value),
        ]);
      }
    });
    return this.getSettings();
  }
}
