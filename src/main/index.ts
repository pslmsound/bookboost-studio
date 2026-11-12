// Electron main process: window, security policy, storage startup.
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Db } from './database';
import { Repository } from './repository';
import { SecretStore } from './secrets';
import { COVER_NAME, automaticSnapshot, removeOrphanCovers } from './backup';
import { registerIpc } from './ipc';
import { todayISO } from '@shared/domain';

const DEV_URL = process.env.BOOKBOOST_DEV_URL ?? '';

// Automated tests point the app at a throwaway data folder. Ignored in the installed app.
if (!app.isPackaged && process.env.BOOKBOOST_USER_DATA) {
  app.setPath('userData', process.env.BOOKBOOST_USER_DATA);
}
const isDev = DEV_URL !== '' && !app.isPackaged;
const rendererFile = path.join(__dirname, '../renderer/index.html');

let mainWindow: BrowserWindow | null = null;

// Cover images are served through a private scheme so the renderer never
// needs file system access.
protocol.registerSchemesAsPrivileged([{ scheme: 'bbimg', privileges: { standard: true, secure: true } }]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(start).catch(fatal);
}

function isTrustedUrl(url: string): boolean {
  if (isDev) return url.startsWith(DEV_URL);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'file:') return false;
    return path.normalize(fileURLToPath(parsed)).toLowerCase() === path.normalize(rendererFile).toLowerCase();
  } catch {
    return false;
  }
}

function fatal(error: unknown) {
  console.error(error);
  dialog.showErrorBox(
    'BookBoost Studio could not start',
    `${error instanceof Error ? error.message : 'An unexpected error occurred.'}\n\nYour data folder has not been changed:\n${app.getPath('userData')}\n\nAutomatic daily copies are kept in its "backups" folder.`,
  );
  app.exit(1);
}

async function start() {
  const dataDir = app.getPath('userData');
  const paths = {
    dataDir,
    dbFile: path.join(dataDir, 'data', 'bookboost.sqlite'),
    coversDir: path.join(dataDir, 'covers'),
    backupsDir: path.join(dataDir, 'backups'),
  };
  fs.mkdirSync(path.dirname(paths.dbFile), { recursive: true });
  fs.mkdirSync(paths.coversDir, { recursive: true });

  const db = await Db.open(paths.dbFile);
  const repo = new Repository(db);
  try {
    automaticSnapshot(db, paths, todayISO());
    removeOrphanCovers(paths, new Set(repo.list('books').map((b) => b.coverFile).filter(Boolean)));
  } catch (error) {
    console.error('[bookboost] maintenance skipped', error);
  }
  const secrets = new SecretStore(path.join(dataDir, 'secrets.json'));

  // Deny every browser permission request. The app needs none.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  protocol.handle('bbimg', (request) => {
    const name = path.basename(decodeURIComponent(new URL(request.url).pathname));
    const file = path.join(paths.coversDir, name);
    if (!COVER_NAME.test(name) || !fs.existsSync(file)) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  registerIpc({ repo, secrets, paths, getWindow: () => mainWindow, isTrustedUrl });
  if (!isDev) Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  app.on('before-quit', () => {
    try {
      repo.database.persist();
    } catch (error) {
      console.error('[bookboost] final save failed', error);
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0D0D0C',
    title: 'BookBoost Studio',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
      devTools: isDev,
    },
  });
  mainWindow = win;
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  // Give the interface a moment to save an open draft before the window goes away.
  let closing = false;
  win.on('close', (event) => {
    if (closing || win.webContents.isDestroyed() || win.webContents.isCrashed()) return;
    event.preventDefault();
    closing = true;
    const finish = () => {
      clearTimeout(timer);
      ipcMain.removeListener('bookboost:flushed', onFlushed);
      if (!win.isDestroyed()) win.destroy();
    };
    const onFlushed = (flushEvent: Electron.IpcMainEvent) => {
      if (flushEvent.sender === win.webContents) finish();
    };
    const timer = setTimeout(finish, 2000);
    ipcMain.on('bookboost:flushed', onFlushed);
    win.webContents.send('bookboost:flush');
  });

  // The window may only ever show the app itself. Nothing may open new windows.
  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());

  // Right click menu for text fields, with spelling suggestions.
  win.webContents.on('context-menu', (_event, params) => {
    const items: Electron.MenuItemConstructorOptions[] = [];
    for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
      items.push({ label: suggestion, click: () => win.webContents.replaceMisspelling(suggestion) });
    }
    if (items.length > 0) items.push({ type: 'separator' });
    if (params.isEditable) {
      items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
    } else if (params.selectionText.trim() !== '') {
      items.push({ role: 'copy' });
    }
    if (items.length > 0) Menu.buildFromTemplate(items).popup({ window: win });
  });

  if (isDev) void win.loadURL(DEV_URL);
  else void win.loadFile(rendererFile);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
