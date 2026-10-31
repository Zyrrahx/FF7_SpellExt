// The app's own settings (design 1.8): settings.json in Electron's userData folder, or beside the app's resources
// folder when a file portable.txt is there. Plain functions (no Electron): main.js hands in the folder.
//
// { last_folder, recent: [{path, last_opened}], kernel, confirm_save, live_auto, open_last, window: {x,y,width,height} }
// Written with a .tmp opened 'wx' and a rename, as the config files are.
import fs from 'node:fs';
import nodePath from 'node:path';

export const RECENT_KEPT = 5;
export const DEFAULTS = Object.freeze({ last_folder: null, recent: [], kernel: null, confirm_save: true, live_auto: false,
                                        open_last: false, window: null });

// The folder settings.json lives in: beside `resources` when portable.txt is there, else `user_data`.
export function settings_dir(user_data, resources_path) {
  if (resources_path) {
    const base = nodePath.dirname(resources_path);
    if (fs.existsSync(nodePath.join(base, 'portable.txt'))) return base;
  }
  return user_data;
}

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.path = nodePath.join(dir, 'settings.json');
    this.data = Object.assign({}, DEFAULTS, { recent: [] });
    this.problem = null;
    try {
      const got = JSON.parse(fs.readFileSync(this.path, 'utf8'));
      if (got && typeof got === 'object' && !Array.isArray(got)) {
        for (const k of Object.keys(DEFAULTS)) if (k in got) this.data[k] = got[k];
        if (!Array.isArray(this.data.recent)) this.data.recent = [];
      }
    } catch (e) {
      if (e.code !== 'ENOENT') this.problem = 'settings.json could not be read (' + (e.code || e.name) + '); defaults used';
    }
  }

  get(k) { return this.data[k]; }

  // only the keys of DEFAULTS; written at once
  set(values) {
    for (const [k, v] of Object.entries(values)) {
      if (!(k in DEFAULTS)) throw new Error('not a setting: ' + k);
      this.data[k] = v;
    }
    this.write();
  }

  // a folder opened: first in the recent list (five kept), and the last folder
  remember(folder, now) {
    const when = now || new Date().toISOString();
    const rest = this.data.recent.filter(r => r && r.path !== folder);
    this.data.recent = [{ path: folder, last_opened: when }].concat(rest).slice(0, RECENT_KEPT);
    this.data.last_folder = folder;
    this.write();
  }

  write() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = this.path + '.tmp';
    try { fs.unlinkSync(tmp); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const fd = fs.openSync(tmp, 'wx');
    try {
      fs.writeSync(fd, JSON.stringify(this.data, null, 1) + '\n');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, this.path);
  }
}
