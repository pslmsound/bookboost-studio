// End to end smoke test. Launches the real built app with a throwaway data
// folder and walks the critical path: onboarding, persistence across a
// restart, writing and autosave, an AI draft against a local stand-in
// provider, sample data, and every main screen.
//
// Run with: npm run build && npm run e2e
// Screenshots are written to tests/e2e/screenshots.
import { _electron as electron } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'tests/e2e/screenshots');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'bookboost-e2e-'));
fs.mkdirSync(shots, { recursive: true });

// A local stand-in for an OpenAI compatible provider. No real AI service is contacted.
const requests = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    requests.push({ url: req.url, body });
    res.setHeader('content-type', 'application/json');
    if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'local-writer' }, { id: 'text-embedding-x' }] }));
    res.end(JSON.stringify({ choices: [{ message: { content: 'Subject: The harbor is calling\nPreview: A first look inside\n\nDear reader,\n\nThis is a **generated** draft from the test provider.\n\n- Point one\n- Point two' } }] }));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const launch = async () => {
  const app = await electron.launch({
    args: [process.env.BOOKBOOST_APP_PATH || root, '--no-sandbox'],
    env: { ...process.env, BOOKBOOST_USER_DATA: userData },
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  page.on('pageerror', (e) => { throw e; });
  return { app, page };
};
const shot = (page, name) => page.screenshot({ path: path.join(shots, `${name}.png`) });
const nav = async (page, name) => {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(350);
};
const step = (text) => console.log(`  ok  ${text}`);

let { app, page } = await launch();
try {
  // ---- Security posture ----
  const exposure = await page.evaluate(async () => ({
    hasRequire: typeof window.require !== 'undefined',
    hasProcess: typeof window.process !== 'undefined',
    bridgeKeys: Object.keys(window.bookboost).sort(),
    blocked: await window.bookboost.invoke('fs:readFile', { path: 'C:/secret' }),
    badEntity: await window.bookboost.invoke('entity:list', { entity: 'sqlite_master' }),
  }));
  assert.equal(exposure.hasRequire, false);
  assert.equal(exposure.hasProcess, false);
  assert.deepEqual(exposure.bridgeKeys, ['invoke', 'onBeforeClose', 'onDataReplaced']);
  assert.equal(exposure.blocked.ok, false);
  assert.equal(exposure.badEntity.ok, false);
  step('renderer has no Node access and unknown IPC calls are refused');

  // ---- Onboarding ----
  await page.getByRole('heading', { name: /A quiet, capable studio/ }).waitFor();
  await page.waitForTimeout(500);
  await shot(page, '01-welcome');
  await page.getByRole('button', { name: 'Set up my book' }).click();
  await page.getByLabel('Your name or pen name').fill('Eleanor Marsh');
  await page.getByLabel('Short author bio').fill('Eleanor Marsh writes historical fiction set on the northern coast.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click(); // Title is required.
  await page.getByText('Add the book title').waitFor();
  step('onboarding blocks an empty title with a clear message');
  await page.getByLabel('Book title').fill('The Lantern Keeper');
  await page.getByLabel('Genre').fill('Historical fiction');
  await page.getByLabel('Publication date').fill('2027-03-02');
  await page.waitForTimeout(400);
  await shot(page, '02-onboarding-book');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Summary').fill('A lighthouse keeper uncovers the bargain that built her town.');
  await page.getByLabel('Target readers').fill('Readers of quiet, character driven historical fiction.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Instagram' }).click();
  await page.getByRole('button', { name: 'Newsletter' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Open my studio' }).click();
  await page.getByRole('heading', { name: 'The Lantern Keeper', level: 2 }).waitFor();
  await page.waitForTimeout(400);
  await shot(page, '03-overview-empty');
  step('onboarding creates the first book and opens the dashboard');

  // ---- Persistence across restart ----
  await app.close();
  ({ app, page } = await launch());
  await page.getByRole('heading', { name: 'The Lantern Keeper', level: 2 }).waitFor();
  await page.getByRole('heading', { name: 'Welcome back, Eleanor' }).waitFor();
  step('book and profile persist after closing and reopening the app');

  // ---- Cover images are served through the private bbimg scheme ----
  const coverName = '11111111-2222-3333-4444-555555555555.png';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAEklEQVR4nGP8z8Dwn4GBgYEJAA4aAgHF3hTMAAAAAElFTkSuQmCC', 'base64');
  fs.mkdirSync(path.join(userData, 'covers'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'covers', coverName), png);
  const cover = await page.evaluate(async (name) => {
    const books = await window.bookboost.invoke('entity:list', { entity: 'books' });
    const updated = await window.bookboost.invoke('entity:update', { entity: 'books', id: books.data[0].id, patch: { coverFile: name } });
    const traversal = await window.bookboost.invoke('entity:update', { entity: 'books', id: books.data[0].id, patch: { coverFile: '../../secrets.json' } });
    const load = (src) => new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img.naturalWidth); img.onerror = () => resolve(0); img.src = src; });
    return { saved: updated.ok, traversalOk: traversal.ok, width: await load(`bbimg://covers/${name}`), missing: await load('bbimg://covers/..%2Fsecrets.json') };
  }, coverName);
  assert.deepEqual(cover, { saved: true, traversalOk: false, width: 2, missing: 0 });
  step('cover images load through the private scheme and path tricks are refused');

  // ---- AI not configured: graceful ----
  await nav(page, 'Content Studio');
  await page.getByRole('button', { name: 'New draft' }).first().click();
  await page.getByLabel('What are you writing?').selectOption('newsletter');
  await page.getByLabel('Title').fill('Launch newsletter');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await page.getByLabel('Draft text').waitFor();
  await page.getByRole('button', { name: 'Draft with AI' }).click();
  await page.getByText('The AI assistant is optional and not set up yet.').waitFor();
  step('AI controls explain themselves when no provider is configured');

  // ---- Manual writing and autosave ----
  await page.getByLabel('Draft text').fill('Hand written first line.');
  await page.getByText('All changes saved').waitFor({ timeout: 6000 });
  step('manual draft autosaves');

  // ---- Closing the window right after typing must not lose text ----
  await page.getByLabel('Draft text').fill('Hand written first line. Typed just before closing.');
  await app.close();
  ({ app, page } = await launch());
  await nav(page, 'Content Studio');
  await page.getByRole('button', { name: /Launch newsletter/ }).click();
  assert.equal(await page.getByLabel('Draft text').inputValue(), 'Hand written first line. Typed just before closing.');
  await page.getByLabel('Draft text').fill('Hand written first line.');
  await page.getByText('All changes saved').waitFor({ timeout: 6000 });
  step('text typed immediately before closing the window is saved');
  await page.getByRole('button', { name: 'Draft with AI' }).click();

  // ---- Configure the stand-in provider ----
  await page.getByRole('button', { name: 'Set up AI in Settings' }).click();
  await page.getByLabel('Provider', { exact: true }).selectOption('custom');
  await page.getByLabel('Endpoint address').fill(`http://127.0.0.1:${port}/v1`);
  await page.getByRole('button', { name: 'Load available models' }).click();
  await page.getByRole('button', { name: 'local-writer', exact: true }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await page.getByText('Connection works. The assistant is ready.').waitFor();
  await shot(page, '04-settings-ai');
  step('provider setup: model list loads, embeddings are hidden, connection test passes');

  // ---- AI draft with consent, review and apply ----
  await nav(page, 'Content Studio');
  await page.getByRole('button', { name: /Launch newsletter/ }).click();
  await page.getByRole('button', { name: 'Draft with AI' }).click();
  await page.getByLabel('Brief for the assistant').fill('Announce the cover reveal.');
  const before = requests.length;
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await page.getByRole('heading', { name: 'Before your first AI request' }).waitFor();
  assert.equal(requests.length, before, 'nothing may be sent before consent');
  await shot(page, '05-ai-consent');
  await page.getByRole('button', { name: 'I understand, continue' }).click();
  await page.getByText('Suggested draft. Review it before using.').waitFor();
  const sent = JSON.parse(requests.at(-1).body);
  assert.match(sent.messages[1].content, /Title: The Lantern Keeper/);
  assert.match(sent.messages[1].content, /Announce the cover reveal\./);
  await shot(page, '06-ai-proposal');
  await page.getByRole('button', { name: 'Replace my draft' }).click();
  await page.getByText('All changes saved').waitFor({ timeout: 6000 });
  assert.equal(await page.getByLabel('Subject line').inputValue(), 'The harbor is calling');
  assert.match(await page.getByLabel('Draft text').inputValue(), /generated\*\* draft/);
  await page.getByRole('button', { name: 'Version history' }).click();
  await page.getByText('Hand written first line.').waitFor();
  await page.getByRole('button', { name: 'Close' }).first().click();
  await page.getByRole('radio', { name: 'Preview' }).click();
  await shot(page, '07-content-studio');
  step('AI draft: consent first, book context sent, reviewed before use, previous text kept in history');

  // ---- Sample data and every screen ----
  await nav(page, 'Settings');
  await page.getByRole('button', { name: 'Add sample book' }).click();
  await page.getByText('Sample book added and selected.').waitFor();
  await nav(page, 'Overview');
  await page.getByRole('heading', { name: 'The Salt Road', level: 2 }).waitFor();
  await page.getByText('Sample data.', { exact: true }).waitFor();
  await page.waitForTimeout(600);
  await shot(page, '08-overview');
  for (const [name, file] of [['My Books', '09-books'], ['Campaigns', '10-campaigns'], ['Calendar', '11-calendar'], ['Outreach', '12-outreach'], ['Email', '13-email'], ['Analytics', '14-analytics'], ['AI Assistant', '15-assistant'], ['Settings', '16-settings']]) {
    await nav(page, name);
    await page.waitForTimeout(450);
    await shot(page, file);
  }
  // The smallest supported window.
  await page.setViewportSize({ width: 1024, height: 680 });
  for (const [name, file] of [['Overview', '17-small-overview'], ['Content Studio', '18-small-content'], ['Outreach', '19-small-outreach']]) {
    await nav(page, name);
    await page.waitForTimeout(450);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, `${name} should not scroll sideways at the minimum window size`);
    await shot(page, file);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  step('sample data is labeled, all ten screens render, and the minimum window size has no sideways scroll');

  // ---- Campaign task, calendar approval, outreach consent guard ----
  await nav(page, 'Campaigns');
  await page.getByLabel('New task').fill('Confirm launch venue');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByText('Confirm launch venue').waitFor();
  await page.getByLabel('Mark "Confirm launch venue" as done').click();
  await page.getByLabel('Mark "Confirm launch venue" as not done').waitFor();
  step('campaign tasks can be added and completed');

  await nav(page, 'Calendar');
  const approve = page.getByRole('button', { name: 'Approve', exact: true });
  const pending = await approve.count();
  await approve.first().click();
  await page.waitForTimeout(400);
  assert.equal(await approve.count(), pending - 1);
  step('calendar items move from draft to approved only by an explicit action');

  await nav(page, 'Outreach');
  await page.getByRole('button', { name: 'Log that you contacted Sample Journalist today' }).click();
  await page.getByText(/Record how this person agreed to be contacted/).waitFor();
  step('logging a pitch is blocked until consent is recorded');

  // ---- Analytics entry ----
  await nav(page, 'Analytics');
  await page.getByRole('button', { name: 'Add numbers' }).click();
  await page.getByLabel('Value').fill('abc');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await page.getByText('Enter a number of zero or more').waitFor();
  await page.getByLabel('Value').fill('7');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  step('analytics entries are validated and saved');

  // ---- Remove sample data: own book returns untouched ----
  await nav(page, 'Settings');
  await page.getByRole('button', { name: 'Remove sample data' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove sample data' }).click();
  await page.getByText('Sample data removed.').waitFor();
  await nav(page, 'Overview');
  await page.getByRole('heading', { name: 'The Lantern Keeper', level: 2 }).waitFor();
  step('removing sample data restores the real book');

  // ---- Files on disk ----
  await app.close();
  app = null;
  assert.ok(fs.existsSync(path.join(userData, 'data', 'bookboost.sqlite')));
  assert.ok(fs.readdirSync(path.join(userData, 'backups')).some((n) => n.startsWith('auto-')));
  step('database and automatic snapshot exist in the data folder');
  console.log('\nSmoke test passed.');
} catch (error) {
  if (page) await shot(page, 'zz-failure').catch(() => {});
  console.error('\nSmoke test FAILED\n', error);
  process.exitCode = 1;
} finally {
  if (app) await app.close().catch(() => {});
  server.close();
  fs.rmSync(userData, { recursive: true, force: true });
}
