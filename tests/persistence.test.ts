import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Db } from '../src/main/database';
import { Repository } from '../src/main/repository';
import { automaticSnapshot, createBackup, removeOrphanCovers, restoreBackup, BackupError, type Paths } from '../src/main/backup';
import { disableDemo, enableDemo } from '../src/main/demo';
import { campaignProgress, nextActions, pendingApprovals, todayISO, addDays } from '../src/shared/domain';

let dir: string;
let paths: Paths;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookboost-test-'));
  paths = { dbFile: path.join(dir, 'data', 'bookboost.sqlite'), coversDir: path.join(dir, 'covers'), backupsDir: path.join(dir, 'backups') };
  fs.mkdirSync(paths.coversDir, { recursive: true });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const open = async () => new Repository(await Db.open(paths.dbFile));
const newBook = (repo: Repository, title = 'My Novel') => repo.create('books', { title, authorName: 'A. Writer' });

describe('database', () => {
  it('creates the schema, saves to disk and reads it back after reopening', async () => {
    const repo = await open();
    const book = repo.create('books', { title: 'My Novel', authorName: 'A. Writer', channels: ['Instagram'], purchaseLinks: [{ label: 'Shop', url: 'https://example.com' }] });
    repo.database.close();
    expect(fs.existsSync(paths.dbFile)).toBe(true);
    expect(fs.existsSync(`${paths.dbFile}.tmp`)).toBe(false);

    const reopened = await open();
    const loaded = reopened.require('books', book.id);
    expect(loaded).toMatchObject({ title: 'My Novel', channels: ['Instagram'], purchaseLinks: [{ label: 'Shop', url: 'https://example.com' }], isDemo: false, status: 'active' });
  });
  it('rejects a damaged database file instead of overwriting it', async () => {
    fs.mkdirSync(path.dirname(paths.dbFile), { recursive: true });
    fs.writeFileSync(paths.dbFile, 'this is not a database');
    await expect(Db.open(paths.dbFile)).rejects.toThrow();
    expect(fs.readFileSync(paths.dbFile, 'utf8')).toBe('this is not a database');
  });
  it('rolls back a failed transaction', async () => {
    const repo = await open();
    expect(() =>
      repo.database.transaction(() => {
        newBook(repo);
        throw new Error('fail');
      }),
    ).toThrow('fail');
    expect(repo.list('books')).toHaveLength(0);
  });
});

describe('repository', () => {
  it('validates input and treats hostile text as data', async () => {
    const repo = await open();
    expect(() => repo.create('books', { title: '', authorName: 'A' })).toThrow();
    const hostile = `Robert'); DROP TABLE books;--`;
    const book = newBook(repo, hostile);
    expect(repo.require('books', book.id).title).toBe(hostile);
    expect(() => repo.list('books', { 'title; DROP TABLE books': 'x' })).toThrow(/Cannot filter/);
    expect(repo.list('books')).toHaveLength(1);
  });
  it('updates only the provided fields and re-validates the result', async () => {
    const repo = await open();
    const book = newBook(repo);
    const updated = repo.update('books', book.id, { genre: 'Mystery' });
    expect(updated).toMatchObject({ title: 'My Novel', genre: 'Mystery' });
    expect(() => repo.update('books', book.id, { title: '   ' })).toThrow();
    expect(() => repo.update('books', 'missing', { genre: 'x' })).toThrow(/could not be found/);
  });
  it('filters lists and keeps data separate per book', async () => {
    const repo = await open();
    const a = newBook(repo, 'A');
    const b = newBook(repo, 'B');
    repo.create('contacts', { bookId: a.id, name: 'Ana' });
    repo.create('contacts', { bookId: b.id, name: 'Ben' });
    expect(repo.list('contacts', { bookId: a.id }).map((c) => c.name)).toEqual(['Ana']);
  });
  it('deleting a book removes its data, also after the database has been saved', async () => {
    const repo = await open();
    const book = newBook(repo);
    const campaign = repo.create('campaigns', { bookId: book.id, name: 'Launch' });
    repo.create('tasks', { bookId: book.id, campaignId: campaign.id, title: 'Do it' });
    repo.create('metrics', { bookId: book.id, date: '2026-01-01', metric: 'units_sold', value: 3 });
    repo.database.persist(); // Saving must not switch off foreign key enforcement.
    repo.delete('books', book.id);
    expect(repo.list('campaigns')).toHaveLength(0);
    expect(repo.list('tasks')).toHaveLength(0);
    expect(repo.list('metrics')).toHaveLength(0);
  });
  it('keeps drafts when their campaign or contact is deleted', async () => {
    const repo = await open();
    const book = newBook(repo);
    const campaign = repo.create('campaigns', { bookId: book.id, name: 'Launch' });
    const contact = repo.create('contacts', { bookId: book.id, name: 'Ana' });
    const draft = repo.create('drafts', { bookId: book.id, kind: 'outreach_pitch', title: 'Pitch', campaignId: campaign.id, contactId: contact.id });
    repo.delete('campaigns', campaign.id);
    repo.delete('contacts', contact.id);
    expect(repo.require('drafts', draft.id)).toMatchObject({ campaignId: '', contactId: '' });
  });
  it('refuses records that point at a book that does not exist', async () => {
    const repo = await open();
    expect(() => repo.create('contacts', { bookId: 'nope', name: 'Ana' })).toThrow();
  });
  it('stores settings with defaults, merges nested values and ignores unknown keys', async () => {
    const repo = await open();
    expect(repo.getSettings()).toMatchObject({ onboardingComplete: false, demoMode: false, ai: { provider: 'anthropic', consent: false } });
    repo.updateSettings({ ai: { model: 'm1' }, somethingElse: true });
    const next = repo.updateSettings({ ai: { consent: true }, onboardingComplete: true });
    expect(next.ai).toMatchObject({ provider: 'anthropic', model: 'm1', consent: true });
    expect(next.onboardingComplete).toBe(true);
    expect(next).not.toHaveProperty('somethingElse');
  });
});

describe('draft history', () => {
  it('keeps the previous text when asked to snapshot, and throttles routine saves', async () => {
    const repo = await open();
    const book = newBook(repo);
    const draft = repo.create('drafts', { bookId: book.id, kind: 'social_caption', title: 'Caption', body: 'Version one' });
    repo.update('drafts', draft.id, { body: 'Version two' });
    repo.update('drafts', draft.id, { body: 'Version three' }); // Within the throttle window.
    expect(repo.revisions(draft.id).map((r) => r.body)).toEqual(['Version one']);
    repo.update('drafts', draft.id, { body: 'AI rewrite' }, { snapshot: true });
    expect(repo.revisions(draft.id).map((r) => r.body)).toEqual(['Version three', 'Version one']);
    repo.update('drafts', draft.id, { status: 'approved' });
    expect(repo.revisions(draft.id)).toHaveLength(2);
  });
  it('caps the number of versions kept', async () => {
    const repo = await open();
    const book = newBook(repo);
    const draft = repo.create('drafts', { bookId: book.id, kind: 'note', title: 'Note', body: 'v0' });
    for (let i = 1; i <= 30; i++) repo.update('drafts', draft.id, { body: `v${i}` }, { snapshot: true });
    const revisions = repo.revisions(draft.id);
    expect(revisions).toHaveLength(25);
    expect(revisions[0].body).toBe('v29');
  });
});

describe('backup and restore', () => {
  const cover = '11111111-2222-3333-4444-555555555555.png';
  it('restores books and covers, and keeps a safety copy of what was replaced', async () => {
    const repo = await open();
    const book = repo.create('books', { title: 'Original', authorName: 'A', coverFile: cover });
    fs.writeFileSync(path.join(paths.coversDir, cover), 'image-bytes');
    const file = path.join(dir, 'my.bbbackup');
    createBackup(repo.database, paths, file, '1.0.0');
    expect(fs.readFileSync(file, 'utf8')).not.toContain('sk-');

    repo.delete('books', book.id);
    newBook(repo, 'Newer book');
    fs.rmSync(path.join(paths.coversDir, cover));

    const restored = new Repository(await restoreBackup(repo.database, paths, file));
    expect(restored.list('books').map((b) => b.title)).toEqual(['Original']);
    expect(fs.readFileSync(path.join(paths.coversDir, cover), 'utf8')).toBe('image-bytes');
    expect(fs.readdirSync(paths.backupsDir).some((n) => n.startsWith('before-restore-'))).toBe(true);
    // The restored data is what is on disk.
    restored.database.close();
    expect((await open()).list('books').map((b) => b.title)).toEqual(['Original']);
  });
  it('refuses files that are not valid backups and changes nothing', async () => {
    const repo = await open();
    newBook(repo, 'Keep me');
    const bad = path.join(dir, 'bad.bbbackup');
    fs.writeFileSync(bad, 'not json');
    await expect(restoreBackup(repo.database, paths, bad)).rejects.toThrow(BackupError);
    fs.writeFileSync(bad, JSON.stringify({ format: 'bookboost-studio-backup', version: 1, database: Buffer.from('garbage').toString('base64'), covers: [] }));
    await expect(restoreBackup(repo.database, paths, bad)).rejects.toThrow(/damaged/);
    expect(repo.list('books').map((b) => b.title)).toEqual(['Keep me']);
  });
  it('rejects a backup that tries to write outside the covers folder', async () => {
    const repo = await open();
    const file = path.join(dir, 'ok.bbbackup');
    createBackup(repo.database, paths, file, '1.0.0');
    const tampered = JSON.parse(fs.readFileSync(file, 'utf8'));
    tampered.covers = [{ name: '../../evil.png', data: 'AAAA' }];
    fs.writeFileSync(file, JSON.stringify(tampered));
    await expect(restoreBackup(repo.database, paths, file)).rejects.toThrow(/unexpected file/);
    expect(fs.existsSync(path.join(dir, '..', 'evil.png'))).toBe(false);
  });
  it('makes one automatic snapshot per day and prunes old ones', async () => {
    const repo = await open();
    for (let i = 0; i < 14; i++) automaticSnapshot(repo.database, paths, addDays('2026-01-01', i));
    expect(automaticSnapshot(repo.database, paths, '2026-01-14')).toBeNull();
    const kept = fs.readdirSync(paths.backupsDir).sort();
    expect(kept).toHaveLength(10);
    expect(kept[0]).toBe('auto-2026-01-05.sqlite');
  });
  it('removes cover files that no book uses', async () => {
    fs.writeFileSync(path.join(paths.coversDir, cover), 'x');
    fs.writeFileSync(path.join(paths.coversDir, 'aaaaaaaa-2222-3333-4444-555555555555.jpg'), 'x');
    expect(removeOrphanCovers(paths, new Set([cover]))).toBe(1);
    expect(fs.readdirSync(paths.coversDir)).toEqual([cover]);
  });
});

describe('demo mode', () => {
  it('adds one clearly labeled sample book and removes every trace when turned off', async () => {
    const repo = await open();
    const mine = newBook(repo, 'My real book');
    repo.updateSettings({ activeBookId: mine.id });
    const demoId = enableDemo(repo);
    expect(enableDemo(repo)).toBe(demoId); // Turning it on twice does not duplicate data.
    expect(repo.list('books').filter((b) => b.isDemo)).toHaveLength(1);
    expect(repo.getSettings()).toMatchObject({ demoMode: true, activeBookId: demoId });
    expect(repo.list('metrics', { bookId: demoId }).every((m) => m.source === 'estimate')).toBe(true);

    disableDemo(repo);
    expect(repo.list('books').map((b) => b.title)).toEqual(['My real book']);
    for (const entity of ['campaigns', 'tasks', 'drafts', 'calendarItems', 'contacts', 'metrics'] as const) {
      expect(repo.list(entity)).toHaveLength(0);
    }
    expect(repo.getSettings()).toMatchObject({ demoMode: false, activeBookId: mine.id });
  });
});

describe('critical workflow', () => {
  it('first book, campaign, draft, approval and schedule all persist and drive the dashboard', async () => {
    let repo = await open();
    const today = todayISO();
    const book = repo.create('books', { title: 'Debut', authorName: 'A. Writer', summary: 'A story.' });
    repo.updateSettings({ onboardingComplete: true, activeBookId: book.id, author: { name: 'A. Writer' } });
    const campaign = repo.create('campaigns', { bookId: book.id, name: 'Launch', status: 'active', budgetCents: 50000 });
    const t1 = repo.create('tasks', { bookId: book.id, campaignId: campaign.id, title: 'Write announcement', dueDate: addDays(today, 2) });
    repo.create('tasks', { bookId: book.id, campaignId: campaign.id, title: 'Book a venue', dueDate: addDays(today, -1) });
    const draft = repo.create('drafts', { bookId: book.id, kind: 'launch_announcement', title: 'Announcement', body: 'It is here.', status: 'in_review', campaignId: campaign.id });
    const item = repo.create('calendarItems', { bookId: book.id, draftId: draft.id, title: 'Announce', scheduledDate: addDays(today, 3) });
    repo.database.close();

    repo = await open(); // Simulates closing and reopening the app.
    const state = {
      campaigns: repo.list('campaigns', { bookId: book.id }),
      tasks: repo.list('tasks', { bookId: book.id }),
      drafts: repo.list('drafts', { bookId: book.id }),
      calendar: repo.list('calendarItems', { bookId: book.id }),
      contacts: repo.list('contacts', { bookId: book.id }),
    };
    expect(repo.getSettings()).toMatchObject({ onboardingComplete: true, activeBookId: book.id });
    expect(pendingApprovals(state.drafts, state.calendar)).toBe(2);
    expect(nextActions(state, today).map((a) => a.title)).toEqual(['Book a venue', 'Write announcement', 'Approve: Announce', 'Review: Announcement']);

    repo.update('tasks', t1.id, { done: true });
    repo.update('drafts', draft.id, { status: 'approved' });
    repo.update('calendarItems', item.id, { status: 'approved' });
    expect(campaignProgress(repo.list('tasks', { campaignId: campaign.id }))).toMatchObject({ done: 1, total: 2, percent: 50 });
    expect(pendingApprovals(repo.list('drafts', { bookId: book.id }), repo.list('calendarItems', { bookId: book.id }))).toBe(0);
  });
});
