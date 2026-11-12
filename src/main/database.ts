// SQLite persistence using sql.js (SQLite compiled to WebAssembly).
// The database lives in memory and is written to disk atomically after
// every mutation. This file has no Electron imports so it can be tested
// directly in Node.
import initSqlJs, { type Database as SqlDatabase, type SqlJsStatic, type SqlValue } from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';

let sqlPromise: Promise<SqlJsStatic> | null = null;
function loadSql(): Promise<SqlJsStatic> {
  sqlPromise ??= initSqlJs();
  return sqlPromise;
}

export type Row = Record<string, SqlValue>;

const MIGRATIONS: string[] = [
  // Version 1
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    author_name TEXT NOT NULL,
    genre TEXT NOT NULL DEFAULT '',
    audience TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    tone TEXT NOT NULL DEFAULT '',
    goals TEXT NOT NULL DEFAULT '',
    channels TEXT NOT NULL DEFAULT '[]',
    purchase_links TEXT NOT NULL DEFAULT '[]',
    publication_date TEXT NOT NULL DEFAULT '',
    cover_file TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE campaigns (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    objective TEXT NOT NULL DEFAULT '',
    audience TEXT NOT NULL DEFAULT '',
    channels TEXT NOT NULL DEFAULT '[]',
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '',
    budget_cents INTEGER NOT NULL DEFAULT 0,
    spent_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'planning',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_campaigns_book ON campaigns(book_id);

  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    due_date TEXT NOT NULL DEFAULT '',
    done INTEGER NOT NULL DEFAULT 0,
    is_milestone INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_tasks_campaign ON tasks(campaign_id);

  CREATE TABLE contacts (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    outlet TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'reviewer',
    email TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'prospect',
    consent TEXT NOT NULL DEFAULT 'unknown',
    last_contacted TEXT NOT NULL DEFAULT '',
    next_follow_up TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_contacts_book ON contacts(book_id);

  CREATE TABLE drafts (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    preheader TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    source TEXT NOT NULL DEFAULT 'manual',
    ai_provider TEXT NOT NULL DEFAULT '',
    ai_model TEXT NOT NULL DEFAULT '',
    campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
    contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_drafts_book ON drafts(book_id);

  CREATE TABLE draft_revisions (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_revisions_draft ON draft_revisions(draft_id);

  CREATE TABLE calendar_items (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
    draft_id TEXT REFERENCES drafts(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT '',
    scheduled_date TEXT NOT NULL,
    scheduled_time TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_calendar_book ON calendar_items(book_id, scheduled_date);

  CREATE TABLE metrics (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    channel TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'user_entered',
    origin TEXT NOT NULL DEFAULT 'manual',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_metrics_book ON metrics(book_id, date);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export class Db {
  private depth = 0;

  private constructor(
    private db: SqlDatabase,
    private readonly filePath: string | null,
  ) {}

  /** Opens the database at filePath, or an in-memory database when filePath is null. */
  static async open(filePath: string | null): Promise<Db> {
    const SQL = await loadSql();
    let bytes: Uint8Array | undefined;
    if (filePath && fs.existsSync(filePath)) bytes = fs.readFileSync(filePath);
    const instance = new Db(bytes ? new SQL.Database(bytes) : new SQL.Database(), filePath);
    instance.pragma();
    instance.assertHealthy();
    instance.migrate();
    return instance;
  }

  /** Validates that a byte buffer is a readable BookBoost database. Used before restore. */
  static async validate(bytes: Uint8Array): Promise<boolean> {
    const SQL = await loadSql();
    try {
      const db = new SQL.Database(bytes);
      const check = db.exec('PRAGMA integrity_check');
      const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('books','settings')");
      const version = Number(db.exec('PRAGMA user_version')[0]?.values[0]?.[0] ?? 0);
      db.close();
      return check[0]?.values[0]?.[0] === 'ok' && (tables[0]?.values.length ?? 0) === 2 && version >= 1 && version <= SCHEMA_VERSION;
    } catch {
      return false;
    }
  }

  private pragma() {
    this.db.run('PRAGMA foreign_keys = ON');
  }

  private assertHealthy() {
    const result = this.db.exec('PRAGMA integrity_check');
    if (result[0]?.values[0]?.[0] !== 'ok') throw new Error('The database file is damaged.');
  }

  private migrate() {
    const current = Number(this.db.exec('PRAGMA user_version')[0]?.values[0]?.[0] ?? 0);
    if (current > SCHEMA_VERSION) {
      throw new Error('This data was created by a newer version of BookBoost Studio.');
    }
    if (current === SCHEMA_VERSION) return;
    for (let v = current; v < SCHEMA_VERSION; v++) {
      this.db.run('BEGIN');
      try {
        this.db.exec(MIGRATIONS[v]);
        this.db.run(`PRAGMA user_version = ${v + 1}`);
        this.db.run('COMMIT');
      } catch (error) {
        this.db.run('ROLLBACK');
        throw error;
      }
    }
    this.persist();
  }

  all<T = Row>(sql: string, params: SqlValue[] = []): T[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  get<T = Row>(sql: string, params: SqlValue[] = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  /** Runs a write statement. Outside a transaction it is persisted immediately. */
  run(sql: string, params: SqlValue[] = []): void {
    this.db.run(sql, params);
    if (this.depth === 0) this.persist();
  }

  /** Runs fn atomically and writes to disk once at the end. Nested calls join the outer transaction. */
  transaction<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.depth++;
    this.db.run('BEGIN');
    try {
      const result = fn();
      this.db.run('COMMIT');
      this.depth--;
      this.persist();
      return result;
    } catch (error) {
      this.db.run('ROLLBACK');
      this.depth--;
      throw error;
    }
  }

  /** A complete copy of the database file contents. */
  export(): Uint8Array {
    const bytes = this.db.export();
    // sql.js resets connection pragmas on export, so they are applied again.
    this.pragma();
    return bytes;
  }

  /** Writes to a temporary file and renames it so a crash cannot leave a half written database. */
  persist(): void {
    if (!this.filePath) return;
    const bytes = this.export();
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, bytes);
    // On Windows a virus scanner or indexer can hold the file for a moment,
    // so the swap is retried briefly before falling back to a direct write.
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        fs.renameSync(tmp, this.filePath);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
      }
    }
    fs.writeFileSync(this.filePath, bytes);
    fs.rmSync(tmp, { force: true });
  }

  close(): void {
    this.persist();
    this.db.close();
  }
}
