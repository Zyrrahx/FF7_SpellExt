// The main process (design 1.1, 1.2, 1.7, 1.8): the app's life, the window, the app:// protocol, the one IPC channel,
// the dialogs, the unsaved-changes guard and the settings. Everything else is ipc.js (the routes), paths.js (the
// path rules), save.js (Save and Save all), store.js (settings.json) and core/ (the port of sxcfg), none of which
// imports Electron.
//
// Started by Electron as the app's "main" (package.json). A test harness may set globalThis.__SPELLEXT_NO_AUTOSTART
// before importing this module and call start() itself with its own options.
import { app, BrowserWindow, ipcMain, protocol, dialog, shell, Menu, session } from 'electron';
import fs from 'node:fs';
import nodePath from 'node:path';
import { Host } from './ipc.js';
import { LiveHost } from './livehost.js';
import { Store, settings_dir } from './store.js';
import { serve_path, parse_argv, ORIGIN, CSP } from './paths.js';

const APP_DIR = nodePath.dirname(import.meta.dirname);
const RENDERER = nodePath.join(APP_DIR, 'renderer');
const PRELOAD = nodePath.join(APP_DIR, 'preload', 'preload.cjs');
const ICON = nodePath.join(RENDERER, 'icon.png');

const WEBPREFS = Object.freeze({ contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
                                 preload: PRELOAD, spellcheck: false });

// The guard's question (design 1.7): 'save' | 'close' | 'keep'
function ask_unsaved(win, dirty) {
  const n = dirty.length;
  const what = n ? n + ' file' + (n > 1 ? 's have' : ' has') + ' unsaved changes' : 'There are unsaved changes';
  const r = dialog.showMessageBoxSync(win, {
    type: 'warning', title: 'SpellExt Config', message: what + '. Close and lose them?',
    detail: n ? dirty.join('\n') : 'an edit on the page that was not applied yet (the Raw tab)',
    buttons: ['Save all first', 'Close', 'Keep editing'], defaultId: 2, cancelId: 2, noLink: true,
  });
  return ['save', 'close', 'keep'][r];
}

export function start(opts) {
  const o = opts || {};
  app.setName('SpellExt Config');
  if (o.userData) app.setPath('userData', o.userData);
  protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
  const argv = parse_argv(o.argv || process.argv.slice(1));
  const log_bug = (r) => {
    if (argv.log && r && r.bug) {
      try { fs.appendFileSync(argv.log, new Date().toISOString() + ' ' + r.bug + '\n' + (r.stack || '') + '\n'); } catch (e) { /* no log */ }
    }
  };
  let host = null;
  let win = null;
  const live = new LiveHost(o.live || {});      // the Live tables reader: a worker thread, started on its first request
  app.on('will-quit', () => live.close());

  app.on('web-contents-created', (e, contents) => {
    const keep_in = (ev, url) => { if (!String(url).startsWith(ORIGIN)) ev.preventDefault(); };
    contents.on('will-navigate', keep_in);
    contents.on('will-redirect', keep_in);
    contents.on('will-attach-webview', ev => ev.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      if (String(url).startsWith(ORIGIN + 'aiwin.html')) {
        return { action: 'allow', overrideBrowserWindowOptions: { width: 1300, height: 850, icon: ICON, autoHideMenuBar: true,
                                                                  webPreferences: WEBPREFS } };
      }
      return { action: 'deny' };
    });
  });

  app.on('window-all-closed', () => app.quit());

  return app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(false));
    protocol.handle('app', (req) => {
      const r = serve_path(RENDERER, req.url);
      const headers = { 'content-type': r.type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
      if (r.type.startsWith('text/html')) headers['content-security-policy'] = CSP;
      return new Response(r.body, { status: r.status, headers });
    });
    const store = new Store(settings_dir(app.getPath('userData'), process.resourcesPath));
    host = new Host({
      store, argv, live,
      versions: { node: process.versions.node, electron: process.versions.electron, chrome: process.versions.chrome },
      dialogs: {
        pick_folder: (title) => {
          const r = dialog.showOpenDialogSync(win, { title, properties: ['openDirectory'] });
          return r && r.length ? r[0] : null;
        },
        show_item: (p) => shell.showItemInFolder(p),
        // the Library's Import and Export (design 1.3 lib.import, lib.export)
        open_file: (title, kind) => {
          const filters = kind === 'kernel'
            ? [{ name: 'KERNEL.BIN', extensions: ['bin', 'BIN'] }, { name: 'All files', extensions: ['*'] }]
            : [{ name: 'Templates', extensions: ['txt'] }, { name: 'All files', extensions: ['*'] }];
          const r = dialog.showOpenDialogSync(win, { title, properties: ['openFile'], filters });
          return r && r.length ? r[0] : null;
        },
        save_file: (title, name) => dialog.showSaveDialogSync(win, { title, defaultPath: name,
          filters: [{ name: 'Templates', extensions: ['txt'] }] }) || null,
      },
    });
    const first = argv.config || (store.get('open_last') && store.get('last_folder')) || null;
    if (first) {
      try {
        host.open_folder({ token: host.token_for(first) });
      } catch (e) {
        host.start_problem = (argv.config ? '--config ' : 'the last folder ') + first + ': ' + e.message;
      }
    }
    ipcMain.handle('sx', (event, msg) => {
      const url = event.senderFrame ? event.senderFrame.url : '';
      if (!msg || typeof msg !== 'object') return { refused: 'bad request' };
      const r = host.handle(msg.route, msg.body, url);
      Promise.resolve(r).then(log_bug);
      return r;
    });
    ipcMain.handle('sx-drop', (event, p) => host.drop_token(p, event.senderFrame ? event.senderFrame.url : ''));
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'File', submenu: [{ role: 'quit', accelerator: 'CmdOrCtrl+Q' }] },
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    ]));
    const wb = store.get('window');
    win = new BrowserWindow(Object.assign({ width: 1400, height: 900, minWidth: 720, minHeight: 480 },
      wb && Number.isInteger(wb.width) ? wb : {}, { title: 'SpellExt Config', icon: ICON, show: o.show !== false,
      webPreferences: WEBPREFS }));
    win.on('close', () => {
      try {
        if (!win.isMaximized() && !win.isMinimized()) store.set({ window: win.getBounds() });
      } catch (e) { /* settings are a convenience */ }
    });
    // design 1.7: the page's beforeunload asks while anything is dirty; Electron shows no prompt of its own, so the
    // question is asked here. preventDefault() lets the window close (it ignores the page's beforeunload).
    // "Save all first" is the page's own Save all (it applies a Raw-tab edit first, shows the preview, offers the
    // overwrite of a file changed on disk and tells what was refused): the window stays open meanwhile, and closes
    // only when the page answers that nothing is left unsaved. The close then asks again if anything became dirty.
    win.webContents.on('will-prevent-unload', (event) => {
      const dirty = host.ws ? [...host.ws.docs.entries()].filter(([, x]) => x.dirty).map(([k]) => k)
        .concat([...host.pending_ai.keys()].map(n => 'ai/' + n + ' (staged)')) : [];
      const choice = (o.ask || ask_unsaved)(win, dirty);
      if (choice === 'close') {
        event.preventDefault();
      } else if (choice === 'save') {
        win.webContents.executeJavaScript('window.SpellExtPage.saveAllForClose()', true).then((ok) => {
          if (ok === true && !win.isDestroyed()) win.close();
        }).catch((e) => log_bug({ bug: 'the guard\'s Save all: ' + String(e && e.message || e), stack: e && e.stack }));
      }
    });
    win.loadURL(ORIGIN + 'index.html');
    if (o.onReady) o.onReady(win, host);
    return { win, host };
  });
}

if (!globalThis.__SPELLEXT_NO_AUTOSTART) start();
