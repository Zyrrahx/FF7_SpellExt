// The app's own settings (design 1.8): settings.json in Electron's userData folder, or beside the app's resources
// folder when a file portable.txt is there. Plain functions (no Electron): main.js hands in the folder.
//
// { last_folder, recent: [{path, last_opened}], kernel, confirm_save, live_auto, open_last, window: {x,y,width,height},
//   scene_bin, battle_lgp, menu_lgp }   (formation diagrams, model preview, portraits: a scene.bin, a battle.lgp, a menu archive read in place of the game
//   folder's; null: the game folder's)
// (review F1, minor 4) A settings.json that is there but cannot be read, or is not a JSON object, is never written over
// (its keys would be lost): write() refuses with EUNREADABLE, and `problem` says why.
// Written with a .tmp opened 'wx' and a rename, as the config files are.
import fs from 'node:fs';
import nodePath from 'node:path';

export const RECENT_KEPT = 5;
export const DEFAULTS = Object.freeze({ last_folder: null, recent: [], kernel: null, confirm_save: true, live_auto: false,
                                        open_last: false, window: null, scene_bin: null, battle_lgp: null, menu_lgp: null });

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
    this.unreadable = false;
    try {
      const got = JSON.parse(fs.readFileSync(this.path, 'utf8'));
      if (got && typeof got === 'object' && !Array.isArray(got)) {
        for (const k of Object.keys(DEFAULTS)) if (k in got) this.data[k] = got[k];
        if (!Array.isArray(this.data.recent)) this.data.recent = [];
        // (review F2, minor 4) a game file of the settings that is not a path is said, not passed over
        const bad = ['scene_bin', 'battle_lgp', 'menu_lgp'].filter(k => this.data[k] !== null && this.data[k] !== undefined && typeof this.data[k] !== 'string');
        for (const k of bad) this.data[k] = null;
        if (bad.length) this.problem = bad.map(k => k + ' in settings.json is not a path: not used, the game folder\'s file is read').join('; ');
      } else {
        this.unreadable = true;
        this.problem = 'settings.json is not a JSON object; defaults used, and it is not written over';
      }
    } catch (e) {
      // a file that is there and cannot be read or parsed is kept (unreadable); no file (ENOENT, or a folder that cannot
      // hold one: ENOTDIR) is the defaults, written at the first change as before
      if (e.code !== 'ENOENT') {
        let there = false;
        try { there = fs.statSync(this.path).isFile(); } catch (err) { there = false; }
        this.unreadable = there;
        this.problem = 'settings.json could not be read (' + (e.code || e.name) + '); defaults used' +
          (there ? ', and it is not written over' : '');
      }
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
    if (this.unreadable) {
      throw Object.assign(new Error('settings.json is not written: it could not be read (fix it or rename it; the change ' +
                                    'holds until the app closes)'), { code: 'EUNREADABLE' });
    }
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
