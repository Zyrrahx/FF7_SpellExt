// (model preview, stage 2b) 7th Heaven's other active mods, as a source of battle files, READ ONLY (sxcfg/mods7h.py,
// line for line; its docstring says what is read from 7th Heaven's files and from 7th Heaven 4.6.1's code). Node 22 language level.
import fs from 'node:fs';
import nodePath from 'node:path';
import * as archives from './archives.js';
import * as discover from './discover.js';
import { pyJoin, pyDirname, pyIsdir, pyIsfile, pyIslink, pyCmp, pyStrip, pySplit, pyRealpath, pyBasename } from './py.js';

export const MAX_XML = 1 << 20;
export const SUBS = ['battle', 'battle.lgp'];
const asl = archives.ascii_lower;

// ---- (stage 4) what a read depends on: the Model panel's cache keeps a read while none of these changed ----
let TRACK = null;

// a file read or a folder listed by the read under way, with its stamp taken BEFORE it is read
export function _note(path) {
  if (TRACK !== null && path) TRACK.push([path, archives.stamp_or_none(path)]);
}

// [fn(), [[path, stamp]] of every file and folder it read] (modelsrc.Caches: 7th Heaven's data)
export function tracked(fn) {
  const outer = TRACK;
  TRACK = [];
  try {
    const r = fn();
    return [r, TRACK];
  } finally {
    TRACK = outer;
  }
}

// ---- a small XML reader (sxcfg/mods7h.py parse_xml) ----
export class XmlError extends Error {
  constructor(message) { super(message); this.name = 'XmlError'; }
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function unescape(s) {
  return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z]+);/g, (m0, e) => {
    if (Object.hasOwn(ENT, e)) return ENT[e];
    let n = -1;
    if (e.startsWith('#x') || e.startsWith('#X')) n = parseInt(e.slice(2), 16);
    else if (e.startsWith('#')) n = parseInt(e.slice(1), 10);
    return n > 0 && n < 0x110000 && !(n >= 0xd800 && n < 0xe000) ? String.fromCodePoint(n) : m0;
  });
}

const NAME_RE = /[A-Za-z_:][-A-Za-z0-9_:.]*/y;
const ATTR_RE = /[ \t\r\n]*([A-Za-z_:][-A-Za-z0-9_:.]*)[ \t\r\n]*=[ \t\r\n]*("[^"]*"|'[^']*')/y;

function match_at(re, text, at) {
  re.lastIndex = at;
  return re.exec(text);
}

export function parse_xml(text) {
  if (text.startsWith('\ufeff')) text = text.slice(1);
  const root = { tag: null, attrs: new Map(), children: [], text: '' };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt < 0) {
      top().text += unescape(text.slice(i));
      break;
    }
    if (lt > i) top().text += unescape(text.slice(i, lt));
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      if (end < 0) throw new XmlError('a comment is not closed');
      i = end + 3;
    } else if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9);
      if (end < 0) throw new XmlError('a CDATA section is not closed');
      top().text += text.slice(lt + 9, end);
      i = end + 3;
    } else if (text.startsWith('<?', lt)) {
      const end = text.indexOf('?>', lt + 2);
      if (end < 0) throw new XmlError('a processing instruction is not closed');
      i = end + 2;
    } else if (text.startsWith('<!', lt)) {
      const end = text.indexOf('>', lt + 2);
      if (end < 0) throw new XmlError('a declaration is not closed');
      i = end + 1;
    } else if (text.startsWith('</', lt)) {
      const end = text.indexOf('>', lt + 2);
      if (end < 0) throw new XmlError('a closing tag is not closed');
      const name = pyStrip(text.slice(lt + 2, end));
      if (stack.length < 2 || top().tag !== name) {
        throw new XmlError('</' + name + '> closes ' + (stack.length > 1 ? '<' + top().tag + '>' : 'nothing'));
      }
      stack.pop();
      i = end + 1;
    } else {
      const m = match_at(NAME_RE, text, lt + 1);
      if (!m) throw new XmlError('a tag without a name');
      const el = { tag: m[0], attrs: new Map(), children: [], text: '' };
      let j = lt + 1 + m[0].length;
      for (;;) {
        const a = match_at(ATTR_RE, text, j);
        if (!a) break;
        if (!el.attrs.has(a[1])) el.attrs.set(a[1], unescape(a[2].slice(1, -1)));
        j += a[0].length;
      }
      while (j < n && ' \t\r\n'.includes(text[j])) j += 1;
      if (text.startsWith('/>', j)) {
        top().children.push(el);
        i = j + 2;
      } else if (text.startsWith('>', j)) {
        top().children.push(el);
        stack.push(el);
        i = j + 1;
      } else {
        throw new XmlError('the tag <' + el.tag + '> is not closed');
      }
    }
  }
  if (stack.length > 1) throw new XmlError('<' + top().tag + '> is not closed');
  if (root.children.length !== 1) throw new XmlError(root.children.length + ' top elements');
  return root.children[0];
}

export const kids = (el, tag) => el.children.filter(c => c.tag === tag);

export function child_text(el, tag) {
  for (const c of el.children) if (c.tag === tag) return pyStrip(c.text);
  return null;
}

// ---- conditions ----
export class NotUnderstood extends Error {
  constructor(message) { super(message); this.name = 'NotUnderstood'; }
}

function int_or_none(s) {
  s = pyStrip(s);
  return /^[+-]?[0-9]{1,9}$/.test(s) ? parseInt(s, 10) : null;
}

export function option_holds(text, values, defaults) {
  const k = text.indexOf('=');
  if (k < 0) throw new NotUnderstood('"' + pyStrip(text) + '" is not "option = value"');
  const oid = pyStrip(text.slice(0, k));
  const want = pyStrip(text.slice(k + 1));
  const w = int_or_none(want);
  if (w === null) throw new NotUnderstood('"' + pyStrip(text) + '" does not compare with a number');
  let have = values.has(oid) ? values.get(oid) : null;
  if (have === null) have = defaults.has(oid) ? defaults.get(oid) : null;
  if (have === null) throw new NotUnderstood('the option ' + oid + ' is neither in the profile nor among the mod\'s options');
  const h = int_or_none(have);
  if (h === null) throw new NotUnderstood('the option ' + oid + ' has the value "' + have + '", not a number');
  return h === w;
}

export const MAX_DEPTH = 32;   // (review F2, minor 2) an <ActiveWhen> nested deeper is not understood

export function cond_holds(el, values, defaults, depth = 0) {
  if (depth > MAX_DEPTH) throw new NotUnderstood('an <ActiveWhen> nested more than ' + MAX_DEPTH + ' deep');
  const t = el.tag;
  if (t === 'Option') return option_holds(el.text, values, defaults);
  if (t === 'And' || t === 'Or') {
    const subs = el.children.map(c => cond_holds(c, values, defaults, depth + 1));
    if (!subs.length) throw new NotUnderstood('an empty <' + t + '>');
    return t === 'And' ? subs.every(x => x) : subs.some(x => x);
  }
  throw new NotUnderstood('the element <' + t + '>');
}

export function folder_active(mf, values, defaults) {
  try {
    if (mf.attrs.has('ActiveWhen')) return [option_holds(mf.attrs.get('ActiveWhen'), values, defaults), null];
    const aw = kids(mf, 'ActiveWhen');
    if (!aw.length) return [true, null];
    if (aw[0].children.length !== 1) throw new NotUnderstood('an <ActiveWhen> of ' + aw[0].children.length + ' conditions');
    return [cond_holds(aw[0].children[0], values, defaults), null];
  } catch (e) {
    if (!(e instanceof NotUnderstood)) throw e;
    return [false, e.message];
  }
}

// ---- the profile ----
function read_text(path, limit) {
  _note(path);
  limit = limit || MAX_XML;
  let data;
  try {
    const fd = fs.openSync(path, 'r');
    try {
      const buf = Buffer.alloc(limit + 1);
      let got = 0;
      for (;;) {
        const k = fs.readSync(fd, buf, got, limit + 1 - got, got);
        if (!k) break;
        got += k;
        if (got >= limit + 1) break;
      }
      data = buf.subarray(0, got);
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    return null;
  }
  if (data.length > limit) return null;
  return data.toString('utf8');
}

function xt(text, tag) {
  const m = new RegExp('<' + tag + '>([^<]*)</' + tag + '>').exec(text);
  return m ? pyStrip(unescape(m[1])) : null;
}

export function profile(seventh) {
  const ws = pyJoin(seventh, '7thWorkshop');
  const settings = read_text(pyJoin(ws, 'settings.xml'));
  if (settings === null) return { why: "7th Heaven's settings.xml could not be read" };
  const name = xt(settings, 'CurrentProfile') || 'Default';
  const lib_loc = xt(settings, 'LibraryLocation');
  let mods = lib_loc ? discover._wine_to_host(lib_loc) : null;
  _note(mods);
  if (!mods || !pyIsdir(mods)) {
    mods = pyJoin(seventh, 'mods');
    _note(mods);
  }
  const ptext = read_text(pyJoin(ws, 'profiles', name + '.xml'));
  const ltext = read_text(pyJoin(ws, 'library.xml'), 16 * MAX_XML);
  if (ptext === null || ltext === null) return { why: "7th Heaven's profile " + name + ' or library.xml could not be read' };
  const lib = new Map();
  for (const m of ltext.matchAll(/<InstalledItem>([\s\S]*?)<\/InstalledItem>/g)) {
    const mid = xt(m[1], 'ModID');
    const loc = xt(m[1], 'InstalledLocation');
    if (mid && loc && !lib.has(mid)) lib.set(mid, [xt(m[1], 'Name') || loc, loc]);
  }
  const out = [];
  for (const m of ptext.matchAll(/<ProfileItem>([\s\S]*?)<\/ProfileItem>/g)) {
    const item = m[1];
    const mid = xt(item, 'ModID');
    const values = new Map();
    for (const s of item.matchAll(/<ProfileSetting>([\s\S]*?)<\/ProfileSetting>/g)) {
      const sid = xt(s[1], 'ID');
      const val = xt(s[1], 'Value');
      if (sid !== null && val !== null && !values.has(sid)) values.set(sid, val);
    }
    const active = asl(xt(item, 'IsModActive') || '') === 'true';
    if (lib.has(mid)) {
      const [lname, loc] = lib.get(mid);
      out.push({ name: lname, id: mid, location: loc, where: pyJoin(mods, loc), active, values });
    } else {
      out.push({ name: xt(item, 'Name') || mid, id: mid, location: null, where: null, active, values });
    }
  }
  return { profile: name, mods_dir: mods, mods: out };
}

// ---- one mod's battle files ----
function realpath_or_null(p) {
  try { return fs.realpathSync(p); } catch (e) { return null; }
}

function inside(path, root) {
  const rp = realpath_or_null(path) || nodePath.resolve(path);
  const rr = realpath_or_null(root) || nodePath.resolve(root);
  return rp === rr || rp.startsWith(rr.replace(/[\\/]+$/, '') + nodePath.sep);
}

function sorted_listdir(p) {
  try { return fs.readdirSync(p).sort(pyCmp); } catch (e) { return null; }
}

function find_dir(root, parts) {
  let p = root;
  for (const part of parts) {
    _note(p);
    const names = sorted_listdir(p);
    if (names === null) return null;
    let hit = names.includes(part) ? part : names.find(x => asl(x) === asl(part));
    if (hit === undefined) return null;
    p = pyJoin(p, hit);
    if (pyIslink(p)) return ['link', p];
  }
  return pyIsdir(p) ? p : null;
}

function mod_xml_loose(where) {
  _note(where);
  const names = sorted_listdir(where);
  if (names === null) return null;
  for (const x of names) if (asl(x) === 'mod.xml' && pyIsfile(pyJoin(where, x))) return read_text(pyJoin(where, x));
  return null;
}

function folder_files(m, folder, sub, iro) {
  const parts = folder.split('\\').filter(x => x).concat([sub]);
  const got = new Map();
  if (iro === null) {
    const d = find_dir(m.where, parts);
    if (d === null) return got;
    if (Array.isArray(d)) {
      m.lines.push(m.name + ': ' + parts.join('\\') + ' is a link: not followed');
      return got;
    }
    _note(d);
    const names = sorted_listdir(d);
    if (names === null) return got;
    for (const x of names) {
      const p = pyJoin(d, x);
      if (!pyIslink(p) && pyIsfile(p) && !got.has(asl(x))) got.set(asl(x), ['file', p]);
    }
    return got;
  }
  for (const [k, x] of iro.in_folder(asl(parts.join('\\')))) if (!got.has(k)) got.set(k, ['iro', iro.path, x]);
  return got;
}

export function clean_folder(f) {
  f = pyStrip(f || '').replace(/\//g, '\\');
  return f.split('\\').filter(x => x).join('\\');
}

export function read_mod(mod, mods_dir) {
  const m = { name: mod.name, where: mod.where, kind: null, folders: [], conditional: [],
              layers: { battle: [], 'battle.lgp': [] }, lines: [] };
  const where = mod.where;
  if (where === null) {
    m.lines.push(mod.name + ': not in 7th Heaven\'s library: not looked at');
    return m;
  }
  _note(where);
  if (!inside(where, mods_dir)) {
    m.lines.push(mod.name + ': ' + mod.location + ' is a link out of the mods folder: not followed');
    return m;
  }
  let xml = null;
  let iro = null;
  if (pyIsdir(where)) {
    m.kind = 'folder';
    xml = mod_xml_loose(where);
  } else if (pyIsfile(where) && asl(where).endsWith('.iro')) {
    m.kind = 'iro';
    try {
      iro = archives.open_cached('iro', where);
    } catch (e) {
      if (!(e instanceof archives.ArchiveError) && !e.code) throw e;
      m.lines.push(mod.name + ': ' + (e instanceof archives.ArchiveError ? e.message : 'its archive could not be read'));
      return m;
    }
    if (iro.has('mod.xml')) {
      try {
        const data = iro.read('mod.xml');
        xml = data.length <= MAX_XML ? data.toString('utf8') : null;
      } catch (e) {
        if (!(e instanceof archives.ArchiveError)) throw e;
        xml = null;
      }
    }
  } else {
    m.lines.push(mod.name + ': ' + mod.location + ' is not there');
    return m;
  }
  let folders = null;
  const defaults = new Map();
  const conditional = [];
  const cond_on = [];
  let root = null;
  if (xml !== null) {
    try {
      root = parse_xml(xml);
    } catch (e) {
      if (!(e instanceof XmlError)) throw e;
      m.lines.push(mod.name + ': its mod.xml could not be read (' + e.message + '): its top folder is used');
    }
    if (root !== null) {
      for (const co of kids(root, 'ConfigOption')) {
        const oid = child_text(co, 'ID');
        const d = child_text(co, 'Default');
        if (oid !== null && d !== null && !defaults.has(oid)) defaults.set(oid, d);
      }
      const mfs = kids(root, 'ModFolder');
      if (mfs.length) {
        folders = [];
        for (const mf of mfs) {
          const f = clean_folder(mf.attrs.get('Folder'));
          const [act, why] = folder_active(mf, mod.values, defaults);
          folders.push({ folder: f, active: act, why });
        }
      }
      for (const c of kids(root, 'Conditional')) {
        conditional.push(clean_folder(c.attrs.get('Folder')));
        cond_on.push(folder_active(c, mod.values, defaults)[0]);
      }
    }
  }
  if (folders === null) folders = [];
  // (review F2, minor 3) 7th Heaven 4.6.1 maps a mod's top folder when no ModFolder is active and no Conditional folder's
  // ActiveWhen holds (AppWrapper Wrap.Run, read from its IL by review F2)
  if (xml === null || root === null || !(folders.some(fo => fo.active) || cond_on.some(x => x))) {
    folders.push({ folder: '', active: true, why: null });
  }
  m.folders = folders;
  for (const fo of folders) {
    if (fo.why && SUBS.some(sub => folder_files(m, fo.folder, sub, iro).size)) {
      m.lines.push(mod.name + ': the folder ' + fo.folder + ' is not used: its ActiveWhen is not understood (' + fo.why + ')');
    }
  }
  for (const f of conditional) {
    let cnt = 0;
    for (const sub of SUBS) cnt += folder_files(m, f, sub, iro).size;
    m.conditional.push({ folder: f, files: cnt });
    if (cnt) m.lines.push(mod.name + ': its folder ' + f + ' changes ' + cnt + ' battle file(s) in some battles (a runtime condition): not used here');
  }
  for (const sub of SUBS) {
    for (const fo of folders) {
      if (!fo.active) continue;
      const got = folder_files(m, fo.folder, sub, iro);
      if (got.size) m.layers[sub].push([fo.folder, got]);
    }
  }
  return m;
}

export function read(seventh) {
  const p = profile(seventh);
  if (p.why !== undefined) return { why: p.why, mods: [] };
  const out = { profile: p.profile, mods: [], inactive: 0, why: null };
  for (const mod of p.mods) {
    if (!mod.active) {
      out.inactive += 1;
      continue;
    }
    out.mods.push(read_mod(mod, p.mods_dir));
  }
  return out;
}

export function for_config(config_dir) {
  _note(pyJoin(pyDirname(pyDirname(discover.mod_folder(config_dir))), '7thWorkshop', 'settings.xml'));
  const sh = discover.seventh_heaven(config_dir);
  if (!sh) return { why: "7th Heaven's settings were not found: other mods are not looked at", mods: [] };
  return read(sh);
}

// ---- (portrait panel, stage 2) "the first active mod folder holding <folder>\<rel>", with cached folder listings (sxcfg/mods7h.py) ----
export const LIST_MAX = 20000;       // a folder of more names than this is not looked through (a line says so)
export const LIST_KEEP = 4096;       // folders whose listings are kept
const LISTS = new Map();             // folder -> [stamp, Map(lower name -> [names]), truncated]
let LISTINGS = 0;                    // how many folders were really listed (tests: a second lookup in a folder lists nothing)
export const listings = () => LISTINGS;

// the folder listings kept are dropped (the panel's Reload)
export function clear_listings() { LISTS.clear(); }

// [Map(lower name -> [names as the system has them]), truncated]: the names of a folder, kept while its stamp (taken BEFORE it is listed) is the
// same; [empty, false] when it cannot be listed; every name yielded counts against LIST_MAX, over it [empty, true]
function listing(directory) {
  const st = archives.stamp_or_none(directory);
  const hit = LISTS.get(directory);
  if (hit !== undefined && st !== null && archives.same_stamp(hit[0], st)) return [hit[1], hit[2]];
  let names = new Map(), trunc = false, n = 0;
  let dir = null;
  try {
    dir = fs.opendirSync(directory);
    for (;;) {
      const ent = dir.readSync();
      if (ent === null) break;
      n += 1;
      if (n > LIST_MAX) { trunc = true; names = new Map(); break; }
      const k = asl(ent.name);
      if (!names.has(k)) names.set(k, []);
      names.get(k).push(ent.name);
    }
  } catch (e) {
    names = new Map();
  } finally {
    if (dir !== null) { try { dir.closeSync(); } catch (e) { /* closed */ } }
  }
  LISTINGS += 1;
  if (LISTS.size >= LIST_KEEP) LISTS.clear();
  LISTS.set(directory, [st, names, trunc]);
  return [names, trunc];
}

const smallest = list => list.reduce((a, b) => (b < a ? b : a));       // (ASCII-case variants of one name: the same order as Python's)

// [path, note] of the regular file root/parts... with each part found without case (the exact spelling first, else the smallest of the
// others), every folder on the way listed once and kept: [null, null] when there is none, [null, text] for a link on the way or at the end
// (not followed), something at the end that is not a regular file (a FIFO, a folder: never opened) or a folder of more than LIST_MAX names (not
// looked through)
export function resolve(root, parts) {
  let p = root;
  for (const part of parts) {
    const [names, trunc] = listing(p);
    if (trunc) return [null, p + ': more than ' + LIST_MAX + ' names: not looked through'];
    const variants = names.get(asl(part));
    if (!variants || !variants.length) return [null, null];
    p = pyJoin(p, variants.includes(part) ? part : smallest(variants));
    if (pyIslink(p)) return [null, p + ' is a link: not followed'];
  }
  if (pyIsfile(p)) return [p, null];
  return [null, p + ' is not a regular file: not read'];
}

// [the first active mod folder (mods by profile order, folders by mod.xml order) that holds <folder>\<rel> (rel: parts split by / or \), [notes]]:
// {mod, folder, loc: ['file', path] or ['iro', archive path, entry], rel} or null
export function lookup(mods, rel) {
  const notes = [];
  const rparts = rel.split(/[\\/]/).filter(x => x);
  for (const m of mods.mods || []) {
    if (m.kind === null) continue;
    let iro = null;
    if (m.kind === 'iro') {
      try {
        iro = archives.open_cached('iro', m.where);
      } catch (e) {
        if (e instanceof archives.ArchiveError || e.code) continue;
        throw e;
      }
    }
    for (const fo of m.folders) {
      if (!fo.active) continue;
      const parts = fo.folder.split('\\').filter(x => x).concat(rparts);
      if (iro !== null) {
        const key = asl(parts.join('\\'));
        if (iro.files.has(key)) return [{ mod: m.name, folder: fo.folder, loc: ['iro', iro.path, iro.files.get(key)[0]], rel: iro.files.get(key)[0] }, notes];
        continue;
      }
      const [path, note] = resolve(m.where, parts);
      if (note) notes.push(m.name + ': ' + note);
      if (path !== null) {
        return [{ mod: m.name, folder: fo.folder, loc: ['file', path], rel: nodePath.relative(m.where, path).split(nodePath.sep).join('\\') }, notes];
      }
    }
  }
  return [null, notes];
}

// ---- (ai_newthreat) `ai = NAME` files that the mod the config folder sits in serves: <mod>\<folder>\ai\NAME.ai (sxcfg/mods7h.py) ----
// a ModFolder's ActiveWhen as mod.xml words it ("newthreat = 1", "a = 1 and b = 0", ...), or null: always
export function when_text(mf) {
  const words1 = (t) => pySplit(t).join(' ');
  if (mf.attrs.has('ActiveWhen')) return words1(mf.attrs.get('ActiveWhen'));
  const aw = kids(mf, 'ActiveWhen');
  if (!aw.length) return null;
  const words = (el, depth) => {
    if (depth > MAX_DEPTH) return '...';
    if (el.tag === 'Option') return words1(el.text);
    if (el.tag === 'And' || el.tag === 'Or') {
      const subs = el.children.map(c => words(c, depth + 1));
      const joined = subs.join(' ' + el.tag.toLowerCase() + ' ');
      return depth && subs.length > 1 ? '(' + joined + ')' : joined;
    }
    return '<' + el.tag + '>';
  };
  return aw[0].children.map(c => words(c, 0)).join(' and ') || '(an empty ActiveWhen)';
}

// The DLL takes `ai = NAME` from <game>\direct\ai\NAME.ai first and from SpellExtConfig\ai\NAME.ai after it; 7th Heaven 4.6.1
// answers the first from an active folder's ai\NAME.ai. For each NAME of `names` that a folder of the mod the config folder sits
// in holds (<mod>\<folder>\ai\NAME.ai, any case; the first such folder in mod.xml order; the top folder when mod.xml declares
// none): Map(lower NAME -> {name, mod, folder, when, active}); active true / false, null when the profile cannot be read or
// the condition is not understood. Other mods are not looked at. (sxcfg/mods7h.py served_ai, line for line)
export function served_ai(config_dir, names) {
  const out = new Map();
  names = names.filter(n => n);
  if (!names.length) return out;
  const mod = discover.mod_folder(config_dir);
  const xml = mod_xml_loose(mod);
  if (xml === null) return out;
  let root;
  try {
    root = parse_xml(xml);
  } catch (e) {
    if (!(e instanceof XmlError)) throw e;
    return out;
  }
  const defaults = new Map();
  for (const co of kids(root, 'ConfigOption')) {
    const oid = child_text(co, 'ID');
    const d = child_text(co, 'Default');
    if (oid !== null && d !== null && !defaults.has(oid)) defaults.set(oid, d);
  }
  const mod_name = child_text(root, 'Name') || pyBasename(mod);
  let values = null;
  let mod_on = null;
  const sh = discover.seventh_heaven(config_dir);
  if (sh) {
    const p = profile(sh);
    if (!('why' in p)) {
      for (const m of p.mods) {
        if (m.where && pyIsdir(m.where) && pyRealpath(m.where) === pyRealpath(mod)) {
          values = m.values;
          mod_on = m.active;
          break;
        }
      }
    }
  }
  const mfs = kids(root, 'ModFolder');
  const folders = mfs.length ? mfs : [{ tag: 'ModFolder', attrs: new Map([['Folder', '']]), children: [], text: '' }];
  for (const n of names) {
    const low = asl(n);
    if (out.has(low)) continue;
    for (const mf of folders) {
      const f = clean_folder(mf.attrs.has('Folder') ? mf.attrs.get('Folder') : null);
      const [path] = resolve(mod, f.split('\\').filter(x => x).concat(['ai', n + '.ai']));
      if (path === null) continue;
      let active;
      if (values === null) active = null;
      else if (!mod_on) active = false;
      else {
        const [act, why] = folder_active(mf, values, defaults);
        active = why ? null : act;
      }
      out.set(low, { name: n, mod: mod_name, folder: f, when: mfs.length ? when_text(mf) : null, active });
      break;
    }
  }
  return out;
}
