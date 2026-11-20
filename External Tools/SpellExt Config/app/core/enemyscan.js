// The DLL's start-up scan of SpellExtConfig\enemies and SpellExtConfig\scenes (+ scenes\generated), forecast: port of
// sxcfg/enemyscan.py. enemies_scan (spellext.c 49061), enemies_scan_scene (49023), en_scene_number (47964), en_read_pair
// (46830), en_load (46653), en_parse (46710), en_overlay (46796), en_number (46574), en_at (46545), en_decimal (46556),
// en_name_ok (46856), en_listed (48477). It runs with enemies = on, at start-up and at "Re-init .ini files"
// (enemies_reread), after the registry (FF7_SpellExt_Enemies.ini, rules/enemies.js), whose [enemies] and [scenes] load
// lists it obeys.
//
// The scene and enemy files have their own grammar (en_parse), not the main files' (grammar.js): only ; starts a
// comment, anywhere on the line (# is text); a line ends at LF, CR LF or a lone CR; a UTF-8 byte-order mark is skipped;
// section names are lower-cased with their white space collapsed, keys lower-cased; a section given twice in a file, or
// a key twice in a section, refuses the file. A scene is registered by its [scene] number only (256-4095).
//
// What the scan cannot be told apart from here (see enemyscan.py): the ORDER the folders are listed in (Windows' order,
// letters upper-cased, is used; under Wine it is Wine's, not settled from here; it matters only for two scenes with one
// number, or more than 512 enemy folders); names are compared without case, as Windows opens files.
import fs from 'node:fs';
import { cfmt } from './cfmt.js';
import { pyCmp, pyJoin, pyLexists, pyScandir } from './py.js';

export const EN_FILE_MAX = 0x10000;
export const EN_ARENA_SIZE = 0x80000;
export const EN_FILES_MAX = 16;
export const EN_SECTIONS_MAX = 64;
export const EN_KEYS_MAX = 1024;
export const EN_SECTION_KEYS_MAX = 48;
export const EN_NAME_MAX = 31;
export const EN_SCENE_FIRST = 256;
export const EN_SCENE_LAST = 4095;
export const ENEMIES_KNOWN_MAX = 512;
export const ENEMIES_SCAN_LOG_MAX = 40;

export const SKIP_NAME = "enemies: scenes\\%s%s skipped: a scene file's name is 1 to 31 letters, digits, _ or -";
export const SKIP_SCENE = 'enemies: scene %.31s skipped: %.900s';
export const SKIP_TWICE = 'enemies: scene %.31s says number %d, which scene %.31s has: %.31s skipped';
export const DROPPED = 'enemies: more than %d enemy folders: %d are not registered';
export const SUMMARY = 'the start-up scan (forecast): %d enemies (SpellExtConfig\\enemies), %d scenes (SpellExtConfig\\scenes and ' +
  'scenes\\generated), %d file(s) skipped';
export const GENERATED_NOTE = 'made by the converter: running the converter again overwrites this file. A key of the user\'s file ' +
  '(%s) wins over this one and is kept.';

export function en_space(c) {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\x0b' || c === '\x0c' || (c >= '\x1c' && c <= '\x1f');
}

export function en_lower(c) {
  return c >= 'A' && c <= 'Z' ? String.fromCharCode(c.charCodeAt(0) + 0x20) : c;
}

export function ascii_lower(s) {
  let out = '';
  for (const c of s) out += en_lower(c);
  return out;
}

export function en_name_ok(s) {
  if (s.length < 1 || s.length > EN_NAME_MAX) return false;
  for (const c of s) {
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '-')) return false;
  }
  return true;
}

// A C string of s: it ends at a NUL
export function cstr(s) {
  const i = s.indexOf('\0');
  return i < 0 ? s : s.slice(0, i);
}

// en_fail: the problem text, and the file label and line it names (null, 0: none)
export class EnFail extends Error {
  constructor(text, label, line) {
    super(text);
    this.name = 'EnFail';
    this.text = text;
    this.label = label === undefined ? null : label;
    this.line = line === undefined ? 0 : line;
  }
}

function en_fail(where, fmt, ...args) {
  throw new EnFail(cfmt(fmt, ...args).slice(0, 1024), where.label, where.line);
}

// FindFirstFile's order on NTFS: the name with its letters upper-cased (then the name itself)
export function win_key(name) {
  let up = '';
  for (const c of name) up += (c >= 'a' && c <= 'z') ? String.fromCharCode(c.charCodeAt(0) - 0x20) : c;
  return [up, name];
}

function win_cmp(a, b) {
  const ka = win_key(a);
  const kb = win_key(b);
  return pyCmp(ka[0], kb[0]) || pyCmp(ka[1], kb[1]);
}

// The config folder as the DLL's Windows calls see it: names without case, listings in Windows' order, one snapshot
// per scan. `texts`: Map {relative path ('/' between folders, as listed): text} that stand for the file on disk (the
// editor's unsaved documents).
export class Folder {
  constructor(root, texts, made) {
    this.root = root;
    this.texts = texts || new Map();
    this.made = new Set(made || []);   // paths of `texts` with no file on disk yet (made by the editor, not saved)
    this._lists = new Map();
  }

  // [[name, is_dir, is_file]] of the folder `rel` ('' the root; parts found without case), in Windows' order; [] when
  // it is not there
  listdir(rel) {
    const real = rel ? this.resolve(rel) : '';
    if (real === null) return [];
    if (this._lists.has(real)) return this._lists.get(real);
    const p = real ? pyJoin(this.root, real) : this.root;
    let names = [];
    try {
      names = pyScandir(p).map(e => e.name);
    } catch (e) {
      names = [];
    }
    const have = new Set(names);
    for (const t of [...this.made].sort(pyCmp)) {    // (stage C2) a file the editor made in this folder and has not saved
      const cut = t.lastIndexOf('/');
      const d = cut >= 0 ? t.slice(0, cut) : '';
      const n = t.slice(cut + 1);
      if (d === real && n && !have.has(n)) {
        names.push(n);
        have.add(n);
      }
    }
    names.sort(win_cmp);
    const out = [];
    for (const n of names) {
      const q = pyJoin(p, n);
      if (this.made.has(real ? real + '/' + n : n) && !pyLexists(q)) {
        out.push([n, false, true]);
        continue;
      }
      let st = null;
      try { st = fs.statSync(q); } catch (e) { st = null; }
      out.push([n, st !== null && st.isDirectory(), st !== null && st.isFile()]);
    }
    this._lists.set(real, out);
    return out;
  }

  // The real relative path of `rel` (each part found without case, an exact name first), or null
  resolve(rel) {
    const parts = rel.split('/').filter(x => x);
    let real = '';
    for (const part of parts) {
      const entries = this.listdir(real);
      let hit = null;
      for (const [n] of entries) {
        if (n === part) { hit = n; break; }
      }
      if (hit === null) {
        const low = ascii_lower(part);
        for (const [n] of entries) {
          if (ascii_lower(n) === low) { hit = n; break; }
        }
      }
      if (hit === null) return null;
      real = real ? real + '/' + hit : hit;
    }
    return real;
  }

  is_file(rel) {
    const real = this.resolve(rel);
    if (real === null) return false;
    if (this.texts.has(real)) return true;
    try { return fs.statSync(pyJoin(this.root, real)).isFile(); } catch (e) { return false; }
  }

  // GetFileAttributesExA's last write time of a file, in 100 ns (FILETIME's unit) as a BigInt, or null when it is not one
  mtime(rel) {
    const real = this.resolve(rel);
    if (real === null) return null;
    try {
      return fs.statSync(pyJoin(this.root, real), { bigint: true }).mtimeNs / 100n;
    } catch (e) {
      return null;
    }
  }

  // enemies_env_read: [size or -1 absent, -2 larger than capacity or unreadable; the text; the real path]
  read(rel, capacity) {
    const real = this.resolve(rel);
    if (real === null) return [-1, null, null];
    if (this.texts.has(real)) {
      const text = this.texts.get(real);
      return [text.length <= capacity ? text.length : -2, text, real];
    }
    const p = pyJoin(this.root, real);
    let fd;
    try {
      fd = fs.openSync(p, 'r');
    } catch (e) {
      if (e.code === 'ENOENT') return [-1, null, null];
      return [-2, null, real];
    }
    try {
      const buf = Buffer.alloc(capacity + 1);
      let got = 0;
      for (;;) {
        const k = fs.readSync(fd, buf, got, capacity + 1 - got, null);
        if (k === 0) break;
        got += k;
        if (got === capacity + 1) break;
      }
      if (got > capacity) return [-2, null, real];
      return [got, buf.subarray(0, got).toString('latin1'), real];
    } catch (e) {
      return [-2, null, real];
    } finally {
      fs.closeSync(fd);
    }
  }
}

// en_doc: sections in order, each [name, [keys]]; a key [key, value, label, line]
export class Doc {
  constructor() {
    this.sections = [];
    this.keys = 0;
  }

  sec(name) {
    for (const s of this.sections) if (s[0] === name) return s;
    return null;
  }

  static get(s, key) {
    if (s === null) return null;
    for (const k of s[1]) if (k[0] === key) return k;
    return null;
  }
}

// One file into `d` (keys lower case, sections collapsed and lower case)
export function en_parse(text, label, d) {
  d.sections = [];
  d.keys = 0;
  let current = null;
  let p = 0;
  const end = text.length;
  let line = 0;
  while (p < end) {
    let s = p;
    line += 1;
    let e = p;
    while (e < end && text[e] !== '\n' && text[e] !== '\r') e += 1;
    p = e < end && text[e] === '\r' && e + 1 < end && text[e + 1] === '\n' ? e + 2 : e < end ? e + 1 : end;
    let c = s;
    while (c < e && text[c] !== ';') c += 1;
    e = c;
    while (s < e && en_space(text[s])) s += 1;
    while (e > s && en_space(text[e - 1])) e -= 1;
    if (s === e) continue;
    const at = { label, line };
    if (text[s] === '[' && e - s >= 3 && text[e - 1] === ']') {
      c = s + 1;
      while (c < e - 1 && text[c] !== ']') c += 1;
      if (c === e - 1) {            // [name]: white space collapsed to one space, lower case
        const w = [];
        let gap = false;
        for (const ch of cstr(text.slice(s + 1, e - 1))) {
          if (en_space(ch)) { gap = true; continue; }
          if (gap && w.length) w.push(' ');
          gap = false;
          w.push(en_lower(ch));
        }
        const name = w.join('');
        if (d.sections.some(x => x[0] === name)) en_fail(at, '%.320s line %d: section [%.320s] appears twice', label, line, name);
        if (d.sections.length === EN_SECTIONS_MAX) {
          en_fail(at, '%.320s line %d: more than %d sections in one file', label, line, EN_SECTIONS_MAX);
        }
        current = [name, []];
        d.sections.push(current);
        continue;
      }
    }
    c = s;
    while (c < e && text[c] !== '=') c += 1;
    if (c === e) en_fail(at, '%.320s line %d: "%.320s" is not "key = value"', label, line, cstr(text.slice(s, e)));
    if (current === null) en_fail(at, '%.320s line %d: a key before any [section]', label, line);
    let ke = c;
    let v = c + 1;
    while (ke > s && en_space(text[ke - 1])) ke -= 1;
    while (v < e && en_space(text[v])) v += 1;
    const k = ascii_lower(cstr(text.slice(s, ke)));
    if (current[1].some(x => x[0] === k)) en_fail(at, '%.320s line %d: key "%.320s" appears twice in this section', label, line, k);
    if (d.keys === EN_KEYS_MAX || current[1].length === EN_SECTION_KEYS_MAX) en_fail(at, '%.320s line %d: too many keys', label, line);
    current[1].push([k, cstr(text.slice(v, e)), label, line]);
    d.keys += 1;
  }
}

// The user's file over the generated one: a key there wins, a section only there is added after
export function en_overlay(base, user, user_label) {
  for (const [name, ukeys] of user.sections) {
    let bs = base.sec(name);
    if (bs === null) {
      if (base.sections.length === EN_SECTIONS_MAX) {
        // (the C names user->key[0]'s file: the user file when it has a key, stale memory when it has none)
        en_fail({ label: user_label, line: 0 }, '%.320s: more than %d sections with the generated file\'s', user_label, EN_SECTIONS_MAX);
      }
      bs = [name, []];
      base.sections.push(bs);
    }
    for (const uk of ukeys) {
      const i = bs[1].findIndex(bk => bk[0] === uk[0]);
      if (i >= 0) {
        bs[1][i] = uk.slice();
        continue;
      }
      if (base.keys === EN_KEYS_MAX || bs[1].length === EN_SECTION_KEYS_MAX) {
        en_fail({ label: uk[2], line: uk[3] }, '%.320s line %d: too many keys', uk[2], uk[3]);
      }
      bs[1].push(uk.slice());
      base.keys += 1;
    }
  }
}

// One reading's arena (en_arena_used, en_file_count) and the labels it read (label -> real path)
export class Build {
  constructor(folder) {
    this.folder = folder;
    this.used = 0;
    this.count = 0;
    this.paths = new Map();
  }

  // The file's text (a byte-order mark skipped), or null when absent
  en_load(relative, label) {
    let room = EN_ARENA_SIZE - this.used - 1;
    if (room > EN_FILE_MAX) room = EN_FILE_MAX;
    const at = { label, line: 0 };
    if (this.count >= EN_FILES_MAX || room < 1) en_fail(at, '%.320s: too many files for one scene', label);
    const [size, text, real] = this.folder.read(relative, room);
    if (size === -1) return null;
    if (real !== null) this.paths.set(label, real);
    if (size < 0) en_fail(at, '%.320s: cannot be read (or it is larger than %d bytes)', label, room);
    this.count += 1;
    this.used = (this.used + size + 1 + 3) & ~3;
    return text.startsWith('\xef\xbb\xbf') ? text.slice(3) : text;
  }

  // A generated file and the user's over it into `d`; returns whether either was there
  en_read_pair(generated, generated_label, user, user_label, d) {
    d.sections = [];
    d.keys = 0;
    let found = false;
    let t = this.en_load(generated, generated_label);
    if (t !== null) {
      found = true;
      en_parse(t, generated_label, d);
    }
    t = this.en_load(user, user_label);
    if (t !== null) {
      found = true;
      const u = new Doc();
      en_parse(t, user_label, u);
      en_overlay(d, u, user_label);
    }
    return found;
  }
}

export function en_decimal(v) {
  if (v < 0 && -v <= 0xffffffff) return '-' + String(-v);
  if (v >= 0 && v <= 0xffffffff) return String(v);
  return '(a number too large)';
}

export function en_hex(c) {
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  c = en_lower(c);
  return c >= 'a' && c <= 'f' ? c.charCodeAt(0) - 97 + 10 : -1;
}

// A number of the compiler's (Python's int(v, 0), without 0o, 0b and _)
export function en_number(v, where, lo, hi, label, line) {
  const at = { label: label === undefined ? null : label, line: line === undefined ? 0 : line };
  let c = 0;
  let e = v.length;
  let n = 0;
  let digits = 0;
  let huge = false;
  let negative = false;
  while (c < e && en_space(v[c])) c += 1;
  while (e > c && en_space(v[e - 1])) e -= 1;
  if (c < e && (v[c] === '+' || v[c] === '-')) {
    negative = v[c] === '-';
    c += 1;
  }
  if (e - c > 2 && v[c] === '0' && (v[c + 1] === 'x' || v[c + 1] === 'X')) {
    c += 2;
    while (c < e && en_hex(v[c]) >= 0) {
      if (!huge) {
        n = n * 16 + en_hex(v[c]);
        if (n > 0xffffffffff) huge = true;
      }
      c += 1;
      digits += 1;
    }
  } else {
    const first = c;
    while (c < e && v[c] >= '0' && v[c] <= '9') {
      if (!huge) {
        n = n * 10 + (v.charCodeAt(c) - 48);
        if (n > 0xffffffffff) huge = true;
      }
      c += 1;
      digits += 1;
    }
    if (digits > 1 && v[first] === '0' && (n || huge)) digits = 0;   // Python: no leading zero in a decimal number but 0 itself
  }
  if (!digits || c !== e) en_fail(at, '%.320s: "%.320s" is not a number', where, v);
  if (negative) n = -n;
  if (huge || n < lo || n > hi) {
    const x = huge ? v.slice(0, 23) : en_decimal(n);
    en_fail(at, '%.320s: %.320s is outside %.320s..%.320s', where, x, en_decimal(lo), en_decimal(hi));
  }
  return n;
}

// The [scene] number of the scene `name` (registration reads only that): [number, null, build], or [-1, EnFail, build]
export function en_scene_number(folder, name) {
  const b = new Build(folder);
  try {
    if (!en_name_ok(name)) {
      en_fail({ label: null, line: 0 }, 'scene "%.40s": a scene file\'s name is 1 to %d letters, digits, _ or -', name, EN_NAME_MAX);
    }
    const d = new Doc();
    b.en_read_pair('scenes/generated/' + name + '.ini', 'generated/' + name + '.ini', 'scenes/' + name + '.ini',
      'scenes/' + name + '.ini', d);
    const sc = d.sec('scene');
    if (sc === null) en_fail({ label: null, line: 0 }, 'scene %.320s: no [scene] section', name);
    const k = Doc.get(sc, 'number');
    if (k === null) en_fail({ label: null, line: 0 }, 'scene %.320s [scene]: key "number" missing', name);
    const where = k[2] + ' line ' + k[3];
    const n = en_number(k[1], where, 0, 4095, k[2], k[3]);
    if (n < EN_SCENE_FIRST) {
      en_fail({ label: k[2], line: k[3] }, '%.320s: scene %d is a scene of scene.bin (0-254): a DLL scene is numbered 256-4095', where, n);
    }
    return [n, null, b];
  } catch (ex) {
    if (ex instanceof EnFail) return [-1, ex, b];
    throw ex;
  }
}

export function en_listed(all, listed, name) {
  if (all) return true;
  const low = ascii_lower(name);
  return listed.some(x => ascii_lower(x) === low);
}

function sorted_values(m) {
  return [...m.values()].sort(pyCmp);
}

// enemies_scan: what the scan registers and says (see enemyscan.py scan). `registry`: the Enemies file's load lists
// (rules/enemies.js, shared 'enemies_registry', a Map); null: every folder and scene.
export function scan(folder, registry) {
  const reg = registry || new Map([['enemies_all', true], ['enemies_load', []], ['scenes_all', true], ['scenes_load', []]]);
  const out = { enemies: [], dropped: 0, scenes: [], skipped: 0, lines: [] };
  for (const [name, is_dir] of folder.listdir('enemies')) {
    if (!is_dir || name.startsWith('.')) continue;
    if (!en_name_ok(name) || !en_listed(reg.get('enemies_all'), reg.get('enemies_load'), name)) continue;
    if (!folder.is_file('enemies/' + name + '/enemy.ini') && !folder.is_file('enemies/' + name + '/generated.ini')) continue;
    if (out.enemies.length === ENEMIES_KNOWN_MAX) {
      out.dropped += 1;
      continue;
    }
    out.enemies.push(name);
  }
  if (out.dropped) out.lines.push([null, 0, DROPPED, cfmt(DROPPED, ENEMIES_KNOWN_MAX, out.dropped)]);
  const taken = new Map();
  const subs = ['scenes', 'scenes/generated'];
  for (let i = 0; i < 2; i++) {
    const real_sub = folder.resolve(subs[i]);
    for (const [fname, is_dir] of folder.listdir(subs[i])) {
      const length = fname.length;
      if (is_dir || length < 5 || ascii_lower(fname.slice(-4)) !== '.ini') continue;
      const rel = real_sub + '/' + fname;
      if (!en_name_ok(fname.slice(0, -4))) {
        out.lines.push([rel, 0, SKIP_NAME, cfmt(SKIP_NAME, i ? 'generated\\' : '', fname)]);
        out.skipped += 1;
        continue;
      }
      const name = fname.slice(0, -4);
      if (i && folder.is_file('scenes/' + name + '.ini')) continue;      // (read with the user's file, in the first folder)
      if (!en_listed(reg.get('scenes_all'), reg.get('scenes_load'), name)) continue;
      const [number, fail, b] = en_scene_number(folder, name);
      if (number < 0) {
        const where = fail.label ? (b.paths.has(fail.label) ? b.paths.get(fail.label) : null) : null;
        out.lines.push([where || rel, where ? fail.line : 0, SKIP_SCENE, cfmt(SKIP_SCENE, name, fail.text)]);
        out.skipped += 1;
        continue;
      }
      if (taken.has(number)) {
        out.lines.push([rel, 0, SKIP_TWICE, cfmt(SKIP_TWICE, name, number, taken.get(number), name)]);
        out.skipped += 1;
        continue;
      }
      taken.set(number, name);
      out.scenes.push([number, name, sorted_values(b.paths)]);
    }
  }
  out.summary = cfmt(SUMMARY, out.enemies.length, out.scenes.length, out.skipped);
  return out;
}
