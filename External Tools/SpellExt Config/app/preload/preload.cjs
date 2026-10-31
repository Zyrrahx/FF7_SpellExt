// The preload (design 1.1, 1.2): runs in the page's renderer, isolated from it, sandboxed (hence CommonJS). It gives
// the page window.spellext with two functions and nothing else:
//   invoke(route, body)  one IPC channel 'sx'; a route not in the frozen allowlist is refused here, before anything
//                        reaches the main process (which checks the route, the sender and the body again); the
//                        words "refused by the preload" tell the smoke test which of the two refused
//   dropToken(file)      a folder dropped on the first screen: its path is read here (webUtils.getPathForFile) and
//                        handed to the main process, which answers with a token; the page gets the token, never the
//                        path
// The allowlist is ipc.js's ROUTES (a unit test compares the two).
'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const ROUTES = Object.freeze([
  'app.state', 'app.pick_folder', 'app.pick_game_folder', 'app.open_folder', 'app.close_folder', 'app.recent',
  'app.settings', 'app.show_backup', 'schema.get', 'file.open', 'file.diff', 'file.raw', 'file.edit',
  'file.apply_text', 'file.save', 'file.save_all', 'file.reload', 'check.run', 'log.read', 'lib.list', 'lib.suggest',
  'lib.preview', 'lib.insert', 'lib.capture', 'lib.save_user', 'lib.remove_user', 'lib.import', 'lib.export',
  'ai.list', 'ai.open', 'ai.overview', 'ai.library', 'ai.check', 'ai.save', 'ai.from_kernel', 'ai.kernel_choose',
  'ai.kernel_pick', 'ai.cards', 'ai.card_edit', 'ai.recipe', 'ai.explain', 'ai.set_character', 'live.status',
  'live.tables', 'live.table', 'live.compare', 'live.find', 'ai.stage', 'ai.unstage', 'ai.rename', 'ai.delete',
  'lib.reference',
]);

contextBridge.exposeInMainWorld('spellext', Object.freeze({
  invoke(route, body) {
    if (typeof route !== 'string' || ROUTES.indexOf(route) < 0) {
      return Promise.resolve({ refused: 'refused by the preload: no route ' + String(route) });
    }
    return ipcRenderer.invoke('sx', { route, body });
  },
  dropToken(file) {
    let p = '';
    try {
      p = webUtils.getPathForFile(file);
    } catch (e) {
      p = '';
    }
    if (!p) return Promise.resolve({ refused: 'that is not a folder on this computer' });
    return ipcRenderer.invoke('sx-drop', p);
  },
}));
