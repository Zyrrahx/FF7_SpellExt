// Finding the folders: the SpellExtConfig folder (given), the game folder (beside ff7_en.exe, where the DLL's log
// is) from 7th Heaven's settings.xml, with Wine drive letters mapped on Linux. Read only: nothing here writes.
// Port of sxcfg/discover.py.
import fs from 'node:fs';
import os from 'node:os';
import * as grammar from './grammar.js';
import {
  PY_SPACE_CLASS, pyJoin, pyDirname, pyRealpath, pyExists, pyLexists, pyIsfile, pyIsdir, pyScandir, pyStrip, pyLower,
} from './py.js';

function expanduser(p) {
  // os.path.expanduser: $HOME, else the password database's (os.homedir)
  if (!p.startsWith('~')) return p;
  const home = process.env.HOME !== undefined ? process.env.HOME : os.homedir();
  return home.replace(/\/+$/, '') + p.slice(1) || '/';
}

// glob.glob('<dir>/*/<name>'): the entries of dir (no hidden ones) that are folders and hold `name`, in the file
// system's order
function glob_children(dir, name) {
  let entries;
  try {
    entries = pyScandir(dir);
  } catch (e) {
    return [];
  }
  return entries.filter(e => !e.name.startsWith('.') && e.isDir && pyLexists(pyJoin(dir, e.name, name)))
    .map(e => pyJoin(dir, e.name, name));
}

// the file as Python reads it with encoding='utf-8', errors='replace'
function read_text(p) {
  return new TextDecoder('utf-8', { fatal: false }).decode(fs.readFileSync(p));
}

// A Windows path from settings.xml to a host path: Z: is / ; another letter through a prefix's dosdevices, else
// through the Steam libraries this user has (the path after the letter is tried in each).
export function _wine_to_host(path) {
  const m = /^([A-Za-z]):[\\/]([^\n]*)$/.exec(path);
  if (!m) return pyExists(path) ? path : null;
  const letter = pyLower(m[1]);
  const rest = m[2].replace(/\\/g, '/');
  if (process.platform === 'win32') return path;
  if (letter === 'z') return '/' + rest;
  let prefixes = [process.env.WINEPREFIX || '', expanduser('~/.wine')];
  prefixes = prefixes.concat(glob_children(expanduser('~/.local/share/Steam/steamapps/compatdata'), 'pfx'));
  for (const pfx of prefixes) {
    const dev = pyJoin(pfx, 'dosdevices', letter + ':');
    if (pfx && pyExists(dev)) {
      const p = pyJoin(pyRealpath(dev), rest);
      if (pyExists(p)) return p;
    }
  }
  const vdf = expanduser('~/.local/share/Steam/steamapps/libraryfolders.vdf');
  let libs = [];
  try {
    const re = new RegExp('"path"' + PY_SPACE_CLASS + '+"([^"]+)"', 'g');
    const text = read_text(vdf);
    let x;
    while ((x = re.exec(text)) !== null) libs.push(x[1]);
  } catch (e) {
    libs = [];
  }
  for (const lib of libs) {
    const p = pyJoin(lib, rest);
    if (pyExists(p)) return p;
  }
  return null;
}

export function mod_folder(config_dir) {
  return pyDirname(pyRealpath(config_dir));
}

// <7th Heaven>/mods/<mod>/SpellExtConfig -> <7th Heaven>, if it looks like one.
export function seventh_heaven(config_dir) {
  const d = pyDirname(pyDirname(mod_folder(config_dir)));
  return pyIsfile(pyJoin(d, '7thWorkshop', 'settings.xml')) ? d : null;
}

export function game_dir(config_dir, given) {
  if (given) return pyIsdir(given) ? given : null;
  const sh = seventh_heaven(config_dir);
  if (sh) {
    try {
      const m = /<FF7Exe>([^<]+)<\/FF7Exe>/.exec(read_text(pyJoin(sh, '7thWorkshop', 'settings.xml')));
      if (m) {
        const exe = _wine_to_host(pyStrip(m[1]));
        if (exe && pyIsfile(exe)) return pyDirname(exe);
      }
    } catch (e) {
      // OSError: as Python, go on
    }
  }
  // the DLL beside the game (no 7th Heaven): SpellExtConfig sits beside the exe
  const parent = pyDirname(pyRealpath(config_dir));
  if (pyIsfile(pyJoin(parent, 'ff7_en.exe'))) return parent;
  return null;
}

// The file the game file's fields_file names (the DLL's value), or null.
export function fields_file_name(game_ini_text) {
  let name = null;
  const s = game_ini_text;
  for (const ln of grammar.lines(s)) {
    if (ln.start === ln.stop || s[ln.start] === '[') continue;
    const [ks, ke, vs, ve] = grammar.split_key(s, ln.start, ln.stop);
    if (grammar.word_is(s, ks, ke, 'fields_file')) {
      const v = s.slice(vs, ve);
      name = (!v || pyLower(v) === 'none' || pyLower(v) === 'off') ? null : v;
    }
  }
  return name;
}
