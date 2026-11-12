// Backup, restore and automatic daily snapshots. No Electron imports,
// so this module is exercised directly by the test suite.
import fs from 'node:fs';
import path from 'node:path';
import { Db } from './database';

export const BACKUP_FORMAT = 'bookboost-studio-backup';
export const COVER_NAME = /^[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$/;
const MAX_BACKUP_BYTES = 400 * 1024 * 1024;
const KEEP_AUTOMATIC = 10;

export interface Paths {
  dbFile: string;
  coversDir: string;
  backupsDir: string;
}

interface BackupFile {
  format: string;
  version: number;
  createdAt: string;
  appVersion: string;
  database: string;
  covers: { name: string; data: string }[];
}

export class BackupError extends Error {}

function listCovers(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => COVER_NAME.test(name));
}

/** Writes one portable file containing the database and cover images. API keys are never included. */
export function createBackup(db: Db, paths: Paths, target: string, appVersion: string): void {
  const backup: BackupFile = {
    format: BACKUP_FORMAT,
    version: 1,
    createdAt: new Date().toISOString(),
    appVersion,
    database: Buffer.from(db.export()).toString('base64'),
    covers: listCovers(paths.coversDir).map((name) => ({
      name,
      data: fs.readFileSync(path.join(paths.coversDir, name)).toString('base64'),
    })),
  };
  fs.writeFileSync(target, JSON.stringify(backup));
}

/**
 * Validates a backup, saves a safety copy of the current data, then replaces
 * the database and covers. Returns the newly opened database.
 */
export async function restoreBackup(current: Db, paths: Paths, source: string): Promise<Db> {
  const stat = fs.statSync(source);
  if (stat.size > MAX_BACKUP_BYTES) throw new BackupError('That file is too large to be a BookBoost Studio backup.');

  let backup: BackupFile;
  try {
    backup = JSON.parse(fs.readFileSync(source, 'utf8'));
  } catch {
    throw new BackupError('That file is not a BookBoost Studio backup.');
  }
  if (!backup || backup.format !== BACKUP_FORMAT || typeof backup.database !== 'string' || !Array.isArray(backup.covers)) {
    throw new BackupError('That file is not a BookBoost Studio backup.');
  }
  if (backup.version !== 1) {
    throw new BackupError('This backup was made by a newer version of BookBoost Studio. Update the app, then try again.');
  }
  const bytes = Buffer.from(backup.database, 'base64');
  if (!(await Db.validate(bytes))) {
    throw new BackupError('The backup is damaged or incomplete, so nothing was changed.');
  }
  for (const cover of backup.covers) {
    if (!cover || typeof cover.name !== 'string' || !COVER_NAME.test(cover.name) || typeof cover.data !== 'string') {
      throw new BackupError('The backup contains an unexpected file, so nothing was changed.');
    }
  }

  // Safety copy of what is about to be replaced.
  fs.mkdirSync(paths.backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(paths.backupsDir, `before-restore-${stamp}.sqlite`), current.export());

  current.close();
  const tmp = `${paths.dbFile}.restore`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, paths.dbFile);

  fs.mkdirSync(paths.coversDir, { recursive: true });
  for (const name of listCovers(paths.coversDir)) fs.rmSync(path.join(paths.coversDir, name), { force: true });
  for (const cover of backup.covers) {
    fs.writeFileSync(path.join(paths.coversDir, cover.name), Buffer.from(cover.data, 'base64'));
  }
  return Db.open(paths.dbFile);
}

/** Keeps one snapshot of the database per day, and removes the oldest beyond the retention limit. */
export function automaticSnapshot(db: Db, paths: Paths, today: string): string | null {
  fs.mkdirSync(paths.backupsDir, { recursive: true });
  const target = path.join(paths.backupsDir, `auto-${today}.sqlite`);
  let created: string | null = null;
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, db.export());
    created = target;
  }
  const autos = fs
    .readdirSync(paths.backupsDir)
    .filter((n) => /^auto-\d{4}-\d{2}-\d{2}\.sqlite$/.test(n))
    .sort();
  for (const old of autos.slice(0, Math.max(0, autos.length - KEEP_AUTOMATIC))) {
    fs.rmSync(path.join(paths.backupsDir, old), { force: true });
  }
  return created;
}

export function listSnapshots(paths: Paths): { name: string; createdAt: string; bytes: number }[] {
  if (!fs.existsSync(paths.backupsDir)) return [];
  return fs
    .readdirSync(paths.backupsDir)
    .filter((n) => n.endsWith('.sqlite'))
    .map((name) => {
      const stat = fs.statSync(path.join(paths.backupsDir, name));
      return { name, createdAt: stat.mtime.toISOString(), bytes: stat.size };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Removes cover images that no book refers to, for example after a canceled edit. */
export function removeOrphanCovers(paths: Paths, inUse: Set<string>): number {
  let removed = 0;
  for (const name of listCovers(paths.coversDir)) {
    if (!inUse.has(name)) {
      fs.rmSync(path.join(paths.coversDir, name), { force: true });
      removed++;
    }
  }
  return removed;
}
