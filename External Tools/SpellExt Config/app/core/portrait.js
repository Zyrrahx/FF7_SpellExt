// (portrait panel, stage 1) Which picture a new character's portrait is, and what the panel shows of it: sxcfg/portrait.py,
// line for line and in the same words (read its header for what is mirrored from the DLL, and for stage 2's FFNx replacement textures, 7th Heaven's
// serving of them and FFNx's direct folder). READ ONLY: nothing here writes. Node 22 language level.
import fs from 'node:fs';
import nodePath from 'node:path';
import crypto from 'node:crypto';
import * as archives from './archives.js';
import * as battlemodel from './battlemodel.js';
import * as dds from './dds.js';
import * as gamedata from './gamedata.js';
import * as modelsrc from './modelsrc.js';
import * as mods7h from './mods7h.js';
import * as pnghead from './pnghead.js';
import * as chr_rules from './rules/characters.js';
import { Reading } from './validate.js';
import { cfmt } from './cfmt.js';

export const CHAR_FILE = chr_rules.FILE;
export const FIRST_ID = chr_rules.NEW_CHARACTER_FIRST_ID;
export const LAST_ID = chr_rules.NEW_CHARACTER_FIRST_ID + chr_rules.ROSTER_MAX - 1;
export const LOOSE_FOLDER = 'files';
export const MAX_DEPTH = 12;
export const MAX_NAME = 100;
export const MAX_DIR = 320;
export const WALK_ENTRIES = 20000;
export const WALK_LINES = 100;
export const WALK_PATH_TEXT = 2 << 20;
export const TEX_CAP = 20 << 20;
export const TEX_PIXELS = 16 << 20;
export const PNG_SEND = 16 << 20;
export const SEND_LONG = 192;
export const FRAMES = { large: [84, 96, 128, 128], small: [40, 48, 64, 64] };
export const TITLES = { large: 'the main menu (display mode 2: your setup)', small: '_l: the other display modes' };
export const RESTART = 'a change to a portrait file shows in the game after a restart (the files are indexed, and a PNG converted, once a session)';
export const SUB_DIRECT = ['menu', 'menu.lgp', 'menu_us.lgp'];            // FFNx 1.24.3 lgp_open_file's folders under direct_mode_path
export const FFNX_DEFAULTS = { override_path: 'override', mod_path: 'mods/textures', mod_ext: ['dds', 'png'], override_mod_path: '', direct_mode_path: 'direct' };
export const PNG_UNCHECKED = "the data is not checked as the DLL checks it (read the game's log for 'PNG not used')";
const REC_KEYS = ['id', 'name', 'portrait', 'portrait_form', 'portrait_number', 'portrait_fit', 'portrait_refused', 'battle_model', 'base',
                  'base_used', 'base_from'];
const CP1252_HIGH = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

export class Refused extends Error {
  constructor(message) { super(message); this.name = 'Refused'; }
}

const lower = archives.ascii_lower;
const fmt = cfmt;

function isdir(p) { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } }
function is_regular(p) { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }
function isfile(p) { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }
// compares by code point, as Python's strings compare (JS's < compares UTF-16 code units: a name outside the BMP would sort before U+E000-U+FFFF)
function cmpStr(a, b) {
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const x = a.codePointAt(i), y = b.codePointAt(j);
    if (x !== y) return x < y ? -1 : 1;
    i += x > 0xFFFF ? 2 : 1;
    j += y > 0xFFFF ? 2 : 1;
  }
  return (i < a.length ? 1 : 0) - (j < b.length ? 1 : 0);
}

// The bytes of `s` in Windows-1252 (Wine's ANSI code page for an English locale, inferred), or null when it holds a
// character that code page cannot spell
export function ansi_len(s) {
  let n = 0;
  for (const ch of s) {
    const o = ch.codePointAt(0);
    if (!(o < 0x80 || (o >= 0xA0 && o <= 0xFF) || CP1252_HIGH.includes(ch))) return null;
    n += 1;
  }
  return n;
}

export function dos_path(path) {
  const p = nodePath.resolve(path);
  if (/^[A-Za-z]:/.test(p)) return p.replace(/\//g, '\\');
  return 'Z:' + p.replace(/\//g, '\\');
}

const stampOf = path => {
  const st = archives.stamp_or_none(path);
  return st === null ? null : [st[0], st[1], st[2]];
};

// ---- the loose-file index (PLAN D3) ----
export function loose_index(config_dir) {
  const top = nodePath.join(config_dir, LOOSE_FOLDER);
  const out = { files: new Map(), lines: [], folders: [], on: isdir(top), dos: dos_path(top) + '\\' };
  if (!out.on) return out;
  const budget = { entries: 0, text: 0, stopped: false, more: 0 };
  walk_folder(top, out.dos, '', 0, out, budget);
  if (budget.more) out.lines.push(fmt('files: ... and %d more lines of this kind not listed', budget.more));
  if (budget.stopped) {
    out.lines.push(fmt("files: the folder walk stopped after %d entries or %d bytes of paths (the tool's own safety stop, the game has none): " +
                       'the rest is not listed', WALK_ENTRIES, WALK_PATH_TEXT));
  }
  return out;
}

// one index line, at most WALK_LINES of them (the rest are counted)
function walk_line(out, budget, text) {
  if (out.lines.length < WALK_LINES) out.lines.push(text);
  else budget.more += 1;
}

// the names of a folder in the order the system gives them, each counted against WALK_ENTRIES BEFORE any filter; reading stops when
// the budget is spent (budget.stopped)
function read_names(directory, budget) {
  const names = [];
  let dir;
  try {
    dir = fs.opendirSync(directory, { encoding: 'buffer' });
  } catch (e) {
    return names;
  }
  try {
    for (;;) {
      const ent = dir.readSync();
      if (ent === null) break;
      budget.entries += 1;
      if (budget.entries > WALK_ENTRIES) { budget.stopped = true; break; }
      // [the name as text, the path as bytes]: a name that is not UTF-8 decodes with U+FFFD, so only the bytes can be stat'ed
      names.push([ent.name.toString('utf8'), Buffer.concat([Buffer.from(directory + nodePath.sep), ent.name])]);
    }
  } catch (e) { /* the names read so far */ } finally {
    try { dir.closeSync(); } catch (e) { /* closed */ }
  }
  return names;
}

function walk_folder(directory, dos, rel, depth, out, budget) {
  if (depth > MAX_DEPTH || budget.stopped) return;
  const n = ansi_len(dos);
  if ((n !== null ? n : Buffer.byteLength(dos, 'utf8')) > MAX_DIR) {
    walk_line(out, budget, fmt('files\\%s: its path is longer than the game reads (%d bytes): nothing in it is used', rel, MAX_DIR));
    return;
  }
  out.folders.push([rel, stampOf(directory)]);
  const names = read_names(directory, budget);
  names.sort((a, b) => cmpStr(lower(a[0]), lower(b[0])) || cmpStr(a[0], b[0]));
  const entries = names.map(([name, full]) => [name, isdir(full)]);
  for (const want_dir of [false, true]) {
    for (const [name, is_dir] of entries) {
      if (is_dir !== want_dir || name.startsWith('.')) continue;
      const length = ansi_len(name);
      if (length === null) {
        walk_line(out, budget, fmt('files\\%s: a name Windows-1252 cannot spell; the game may not find it (inferred)', rel + name));
        continue;
      }
      if (length > MAX_NAME) continue;
      budget.text += dos.length + length + 1;
      if (budget.text > WALK_PATH_TEXT) {
        budget.stopped = true;
        return;
      }
      if (is_dir) {
        walk_folder(nodePath.join(directory, name), dos + name + '\\', rel + name + '\\', depth + 1, out, budget);
        if (budget.stopped) return;
        continue;
      }
      const key = lower(name);
      const have = out.files.get(key);
      if (have !== undefined) {
        walk_line(out, budget, fmt('loose files: %s ignored, files\\%s is used', 'files\\' + rel + name, have.rel));
        have.dups.push(rel + name);
      } else {
        out.files.set(key, { name, rel: rel + name, path: nodePath.join(directory, name), dups: [] });
      }
    }
  }
}

// ---- the PNG crop box (png_tex.c px_fit_cover) and what the screens draw ----
export function crop_box(w, h, frame_w, frame_h) {
  if (w * frame_h > h * frame_w) {
    let crop_w = Math.floor(h * frame_w / frame_h);
    if (!crop_w) crop_w = 1;
    return [Math.floor((w - crop_w) / 2), 0, crop_w, h];
  }
  let crop_h = Math.floor(w * frame_h / frame_w);
  if (!crop_h) crop_h = 1;
  return [0, Math.floor((h - crop_h) / 2), w, crop_h];
}

export function drawn_region(w, h) {
  return [Math.max(1, Math.floor(w * 21 / 32)), Math.max(1, Math.floor(h * 3 / 4)), Math.max(1, Math.floor(w * 5 / 8))];
}

// The cw x ch part at (x0, y0) of a w-wide RGBA picture, each f x f block averaged: [width, height, bytes]
export function box_average(rgba, w, x0, y0, cw, ch, f) {
  const ow = Math.max(1, Math.floor(cw / f)), oh = Math.max(1, Math.floor(ch / f));
  if (f === 1) {
    const out = Buffer.alloc(cw * ch * 4);
    for (let y = 0; y < ch; y++) Buffer.from(rgba.buffer, rgba.byteOffset + ((y0 + y) * w + x0) * 4, cw * 4).copy(out, y * cw * 4);
    return [cw, ch, out];
  }
  const n = f * f, half = Math.floor(n / 2);
  const out = Buffer.alloc(ow * oh * 4);
  const acc = new Uint32Array(ow * 4);
  for (let oy = 0; oy < oh; oy++) {
    acc.fill(0);
    for (let dy = 0; dy < f; dy++) {
      const base = ((y0 + oy * f + dy) * w + x0) * 4;
      for (let ox = 0; ox < ow; ox++) {
        for (let dx = 0; dx < f; dx++) {
          const q = base + (ox * f + dx) * 4;
          acc[ox * 4] += rgba[q]; acc[ox * 4 + 1] += rgba[q + 1]; acc[ox * 4 + 2] += rgba[q + 2]; acc[ox * 4 + 3] += rgba[q + 3];
        }
      }
    }
    for (let i = 0; i < ow * 4; i++) out[oy * ow * 4 + i] = Math.floor((acc[i] + half) / n);
  }
  return [ow, oh, out];
}

// ---- reading a .tex ----
function tex_header_refusal(name, head) {
  if (head.length >= battlemodel.TEX_HEAD) {
    const w = head.readUInt32LE(15 * 4), h = head.readUInt32LE(16 * 4);
    if (w >= 1 && w <= battlemodel.MAX_SIDE && h >= 1 && h <= battlemodel.MAX_SIDE && 4 * w * h > TEX_PIXELS) {
      return fmt('%s: %d x %d is more than the preview draws (%d MB of pixels): not drawn', name, w, h, TEX_PIXELS >> 20);
    }
  }
  return null;
}

export function tex_picture(name, data) {
  const line = tex_header_refusal(name, data.subarray(0, battlemodel.TEX_HEAD));
  if (line) return [null, line];
  let t;
  try {
    t = battlemodel.parse_tex(data);
  } catch (ex) {
    if (ex instanceof battlemodel.Bad) return [null, fmt('%s: %s', name, ex.message)];
    throw ex;
  }
  const w = t.width, h = t.height;
  const [rw, rh, mw] = drawn_region(w, h);
  const f = Math.max(1, Math.min(Math.floor((Math.max(rw, rh) + SEND_LONG - 1) / SEND_LONG), rw, rh));      // (never more than the rows and columns drawn)
  const [ow, oh, px] = box_average(t.rgba, w, 0, 0, rw, rh, f);
  return [{ kind: 'rgba', width: ow, height: oh, rgba: Buffer.from(px).toString('base64'), texture: [w, h], region: [rw, rh], menu_w: mw, scale: f }, null];
}

export function read_loose_tex(path, shown) {
  let fd;
  try {
    const st = fs.statSync(path);
    if (!st.isFile()) return [null, fmt('%s: %s', shown, pnghead.WHY_NOT_REGULAR)];
    const size = st.size;
    if (size > TEX_CAP) return [null, fmt('%s: %d bytes, more than the preview reads (%d MB): not drawn', shown, size, TEX_CAP >> 20)];
    fd = pnghead.openNonblocking(path);
    const head = Buffer.alloc(battlemodel.TEX_HEAD);
    const got = fs.readSync(fd, head, 0, head.length, 0);
    const h = head.subarray(0, got);
    const line = tex_header_refusal(shown, h);
    if (line) return [null, line];
    const rest = Buffer.alloc(Math.min(TEX_CAP, Math.max(0, size - got)));
    let n = 0;
    while (n < rest.length) {
      const k = fs.readSync(fd, rest, n, rest.length - n, got + n);
      if (!k) break;
      n += k;
    }
    return [Buffer.concat([h, rest.subarray(0, n)]), null];
  } catch (e) {
    return [null, fmt('%s: could not be read', shown)];
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// ---- the menu archive (PLAN D4) and FFNx's override folder ----
// [FFNx.toml's keys the panel uses (FFNX_DEFAULTS where a key is absent), the toml's path or null]
export function ffnx_settings(game_dir) {
  const cfg = Object.assign({}, FFNX_DEFAULTS, { mod_ext: FFNX_DEFAULTS.mod_ext.slice() });
  if (!game_dir) return [cfg, null];
  const toml = gamedata.find_nocase(game_dir, ['FFNx.toml']);
  if (!toml || !isfile(toml)) return [cfg, null];
  let text;
  try {
    const fd = fs.openSync(toml, 'r');
    try {
      const buf = Buffer.alloc(1 << 20);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      text = buf.subarray(0, n).toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch (e) {
    return [cfg, null];
  }
  for (const key of ['override_path', 'mod_path', 'override_mod_path', 'direct_mode_path']) {
    const m = new RegExp('^[ \\t]*' + key + '[ \\t]*=[ \\t]*"([^"\\r\\n]*)"', 'm').exec(text);
    if (m) cfg[key] = m[1];
  }
  const m = /^[ \t]*mod_ext[ \t]*=[ \t]*\[([^\]\r\n]*)\]/m.exec(text);
  if (m) cfg.mod_ext = [...m[1].matchAll(/"([^"\r\n]*)"/g)].map(x => x[1]).filter(x => x && !/[\\/]/.test(x)).slice(0, 8);
  return [cfg, toml];
}

// FFNx.toml's override_path (default 'override'), and the toml's path (null when it was not read)
export function ffnx_override(game_dir) {
  const [cfg, toml] = ffnx_settings(game_dir);
  return [cfg.override_path, toml];
}

const split_path = s => s.split(/[\\/]/).filter(x => x);

export function menu_archive(game_dir, chosen, override) {
  const res = { path: null, archive: null, line: '', problem: null, from: null };
  let path = null;
  if (chosen) {
    path = chosen;
    res.from = 'chosen';
    if (!fs.existsSync(path)) res.problem = fmt('menu archive %s could not be read (no such file)', path);
    else if (!isfile(path)) res.problem = fmt('menu archive %s could not be read (not a file)', path);
  } else if (!game_dir) {
    res.problem = 'menu_us.lgp: not found (give the game folder, or point at a menu archive in Settings)';
  } else {
    const ov = gamedata.find_nocase(game_dir, split_path(override).concat(['menu', 'menu_us.lgp']));
    if (ov && isfile(ov)) {
      path = ov;
      res.from = 'override';
    } else {
      path = gamedata.find_nocase(game_dir, ['data', 'menu', 'menu_us.lgp']);
      res.from = 'game';
      if (!path || !isfile(path)) {
        path = null;
        res.problem = 'menu_us.lgp: not found (give the game folder, or point at a menu archive in Settings)';
      }
    }
  }
  if (res.problem === null) {
    try {
      res.archive = archives.open_cached('lgp', path);
      res.path = path;
    } catch (e) {
      if (e instanceof archives.ArchiveError) res.problem = fmt('menu archive %s is %s', path, e.message);
      else res.problem = fmt('menu archive %s could not be read (cannot be read)', path);
    }
  }
  if (res.archive !== null) {
    const how = { chosen: "chosen in Settings, in place of the game folder's; ", override: "FFNx's override folder's, standing in for the whole archive " +
                  '(FFNx 1.24.3; inferred for the installed driver); ', game: '' }[res.from];
    res.line = fmt('menu archive %s (%s%d files)', path, how, res.archive.count);
  } else {
    res.line = res.problem;
  }
  return res;
}

export const game_stem = number => chr_rules.PORTRAIT_FILES[number];

// ---- the resolution ----
export class Look {
  constructor(ws, rec, chosen_menu = null, index = null) {
    this.config_dir = ws.config_dir;
    this.game_dir = ws.game_dir;
    this.rec = rec;
    this.index = index !== null ? index : loose_index(ws.config_dir);
    [this.cfg, this.toml] = ffnx_settings(this.game_dir);
    this.override = this.cfg.override_path;
    this.chosen_menu = chosen_menu;
    this.menu = menu_archive(this.game_dir, chosen_menu, this.override);
    this.stamps = [];
    this.seventh = ws.seventh || null;                  // the 7th Heaven folder given, or null: the one the config folder sits in
    [this.mods, this.mods_deps] = load_mods(this.config_dir, this.seventh);
    this.beside = beside_exe(this.config_dir, this.game_dir);
    this.memo = new Map();                              // replacement and direct-folder lookups, made once a look
    this.notes = [];                                    // links not followed, folders too large to look through (once each)
  }

  note(text) {
    if (text && !this.notes.includes(text)) this.notes.push(text);
  }

  touch(path) { this.stamps.push([path, stampOf(path)]); }

  find(name) { return this.index.files.get(lower(name)) || null; }

  override_file(name) {
    if (!this.game_dir) return null;
    const parts = split_path(this.override).concat(['battle', name]);
    const p = gamedata.find_nocase(this.game_dir, parts);
    this.touch(p || nodePath.join(this.game_dir, ...parts));
    return p && isfile(p) ? p : null;
  }
}

function read_mods(config_dir, seventh) {
  if (seventh) {
    mods7h._note(nodePath.join(seventh, '7thWorkshop'));
    if (isdir(nodePath.join(seventh, '7thWorkshop'))) return mods7h.read(seventh);
    return { why: fmt("7th Heaven's settings were not found in %s: other mods are not looked at", seventh), mods: [] };
  }
  return mods7h.for_config(config_dir);
}

// [7th Heaven's active mods as read (mods7h.read), [[path, stamp]] of everything that read looked at]: kept by the Model panel's cache (the same
// key) while none of it changed
export function load_mods(config_dir, seventh) {
  const [r, deps] = modelsrc.CACHES.mods_with_deps(JSON.stringify([seventh || '', config_dir]), () => read_mods(config_dir, seventh));
  return [r, deps.map(([p, st]) => [p, st === null ? null : [st[0], st[1], st[2]]])];
}

// true when the config folder sits beside the game's exe (the DLL's fallback, spellext.c 440-452)
export function beside_exe(config_dir, game_dir) {
  if (!game_dir) return false;
  try {
    return fs.realpathSync(nodePath.dirname(fs.realpathSync(config_dir))) === fs.realpathSync(game_dir);
  } catch (e) {
    return false;
  }
}

export function effective_kind(rec, look) {
  const name = rec.portrait;
  if (!name) return ['none', -1, null];
  let number = rec.portrait_number;
  const e = look.find(name + '.tex') || look.find(name + '.png');
  if (rec.portrait_form === 0 && number >= 0 && e !== null) number = -1;
  if (number >= 0) return ['game', number, e];
  return ['file', number, e];
}

export function identity_lines(rec, look, kind, number, found) {
  const name = rec.portrait;
  if (!name) {
    if (rec.portrait_refused) return [fmt("portrait: the line is refused (%s): the base's portrait is shown (read)", rec.portrait_refused)];
    return ["no portrait of its own: the base's is shown (read)"];
  }
  const named = chr_rules.game_portrait_number(name, 0, name.length);
  if (kind === 'game') {
    const stem = game_stem(number);
    return [fmt("portrait %s = the game's own portrait %d (%s.tex or %s_l.tex by display mode, from the menu archive; a mod's " +
                'replacement of it applies if the mod has one)%s (read)', name, number, stem, stem,
                found !== null ? '; game: the file of that name is not used' : '')];
  }
  if (found !== null) {
    if (named >= 0 && rec.portrait_number !== -2) {
      return [fmt("portrait %s = the file files\\%s (a file of that name takes precedence over the game's portrait %d; write " +
                  "portrait = game:%s for the game's) (read)", name, found.rel, named, name)];
    }
    return [fmt('portrait %s = the file files\\%s (read)', name, found.rel)];
  }
  return [fmt("portrait %s = no %s.tex or %s.png under SpellExtConfig\\files%s: the base's is shown (read)", name, name, name,
              named >= 0 ? " (file: never the game's portrait)" : ' and not a game portrait')];
}

function png_picture(look, entry, size, fit, name) {
  const info = pnghead.inspect(entry.path);
  look.touch(entry.path);
  if (info.why === pnghead.WHY_NOT_REGULAR) return [null, [fmt('%s: %s', entry.name, info.why)]];
  if (!info.ok) return [null, [fmt("%s: %s: the DLL does not use it; the base's portrait is shown", entry.name, info.why)]];
  const w = info.width, h = info.height;
  const [fw, fh, cw, ch] = FRAMES[size];
  const lines = [];
  const [rw, rh, mw] = fit ? drawn_region(cw, ch) : drawn_region(w, h);
  let src, dst;
  if (fit) {
    const [x0, y0, sw, sh] = crop_box(w, h, fw, fh);
    let kept;
    if (sw < w) kept = fmt('x %d-%d kept', x0, x0 + sw - 1);
    else if (sh < h) kept = fmt('rows %d-%d kept', y0, y0 + sh - 1);
    else kept = 'no crop';
    const where = rw === fw ? fmt('fitted into %d x %d (the PHS) / %d x %d (the main menu)', fw, fh, mw, fh) :
      fmt('fitted into %d x %d (the PHS draws %d x %d, the rest white; the main menu %d x %d)', fw, fh, rw, rh, mw, rh);
    lines.push(fmt('made from %s (%d x %d): %s, %s, 256 colours (in the game: SpellExtConfig\\cache\\%s)', entry.name, w, h, kept, where, name));
    src = [x0, y0, sw, sh];
    dst = [fw, fh];
  } else {
    const pow2 = (w & (w - 1)) === 0 && (h & (h - 1)) === 0;
    lines.push(fmt('made from %s (%d x %d) kept at its own size (portrait_fit = no): the top-left %d x %d is drawn by the PHS, ' +
                   '%d of its width by the main menu%s', entry.name, w, h, rw, rh, mw, pow2 ? '' : ' (inferred: sizes that are not a power of two)'));
    src = [0, 0, rw, rh];
    dst = [rw, rh];
  }
  lines.push(fmt('%s: %s', entry.name, PNG_UNCHECKED));
  if (info.alpha) lines.push('transparent pixels: the game shows their stored colour; the preview cannot');
  if (info.partial) lines.push(fmt('%s: more than %d chunks: the walk stopped there, the verdict is not forecast', entry.name, pnghead.MAX_CHUNKS));
  const pic = { kind: 'png', png: null, png_from: null, width: w, height: h, src, dst, region: [rw, rh], menu_w: mw, fit: !!fit, alpha: info.alpha, _bytes: info.size };
  return [pic, lines];
}

export function own_picture(look, size) {
  const rec = look.rec;
  const p = rec.portrait, fit = rec.portrait_fit;
  const small = size === 'small';
  const res = { shown: false, label: null, lines: [], picture: null, path: null };
  const tex = look.find(p + (small ? '_l.tex' : '.tex'));
  let png = null;
  if (tex === null) {
    png = look.find(p + (small ? '_l.png' : '.png'));
    if (png === null && small && fit) png = look.find(p + '.png');
  }
  if (tex === null && png === null) {
    if (small && fit) res.lines.push(fmt("no %s_l.tex, %s_l.png or %s.png: the small picture is the base's", p, p, p));
    else if (small) res.lines.push(fmt("no %s_l.tex or %s_l.png, and portrait_fit = no: the small picture is the base's", p, p));
    else res.lines.push(fmt("no %s.tex or %s.png: the picture is the base's", p, p));
    return res;
  }
  const stem = chr_rules.PORTRAIT_FILES.includes(lower(p)) ? lower(p) : null;
  const name = p + (small ? '_l' : '');
  if (tex !== null) {
    res.path = tex.path;
    look.touch(tex.path);
    const ovr = look.override_file(name + '.tex');
    const [src_path, shown] = ovr ? [ovr, ovr] : [tex.path, 'files\\' + tex.rel];
    if (ovr) {
      res.lines.push(fmt("%s: FFNx reads it in place of the DLL's file %s (FFNx 1.24.3's override folder; the reach is inferred)", ovr, tex.rel));
      look.touch(ovr);
    }
    const [data, line0] = read_loose_tex(src_path, shown);
    if (data === null) {
      res.lines.push(line0);
      return res;
    }
    const [pic, line] = tex_picture(shown, data);
    if (pic === null) {
      res.lines.push(line);
      return res;
    }
    res.shown = true; res.picture = pic; res.label = tex.name;
    res.lines.push(fmt('%s: %d x %d, the game reads it as it is (read)', shown, pic.texture[0], pic.texture[1]));
    if (stem) res.lines.push(fmt("files\\%s replaces the game's %s%s.tex for every reader of the menu archive (inferred)", tex.rel, stem, small ? '_l' : ''));
  } else {
    res.path = png.path;
    const [pic, lines] = png_picture(look, png, size, fit, name + '.tex');
    res.lines.push(...lines);
    if (pic === null) return res;
    const ovr = look.override_file(name + '.tex');
    if (ovr) {
      res.lines.push(fmt("%s: FFNx reads it in place of the DLL's file (FFNx 1.24.3's override folder; the reach is inferred): " +
                         'the preview shows the PNG, not that file', ovr));
      look.touch(ovr);
    }
    res.shown = true; res.picture = pic; res.label = png.name;
    // the archive's override converts `<stem>.png` / `<stem>_l.png`: the small picture made from `<p>.png` has a flag of its own
    if (stem && (!small || lower(png.name) === lower(p) + '_l.png')) {
      res.lines.push(fmt("files\\%s is also the game's %s%s.tex (inferred): whichever is loaded first in a session decides " +
                         'whether SpellExtConfig\\cache\\%s%s.tex is fitted', png.rel, stem, small ? '_l' : '', stem, small ? '_l' : ''));
    }
  }
  return res;
}

// [bytes or null, line or null] of a .tex a lookup found: a file (read under the caps) or an entry of a mod's .iro
export function read_loc(loc, shown) {
  if (loc[0] === 'file') return read_loose_tex(loc[1], shown);
  try {
    return [archives.open_cached('iro', loc[1]).read(loc[2], TEX_CAP), null];
  } catch (ex) {
    if (ex instanceof archives.ArchiveError) return [null, fmt('%s: %s', shown, ex.message)];
    return [null, fmt('%s: could not be read', shown)];
  }
}

// FFNx's direct mode for the menu archive's file `fname` (PLAN 1.5 step 2): for each of direct_mode_path's menu, menu.lgp and menu_us.lgp in turn,
// the active mods' file first (7th Heaven answers FFNx's path from them), then the game folder's own. {loc, shown, text} or null; an empty
// direct_mode_path is direct mode off
export function direct_menu(look, fname) {
  const key = 'direct\u0000' + fname;
  if (look.memo.has(key)) return look.memo.get(key);
  let out = null;
  const dpath = look.cfg.direct_mode_path;
  if (dpath) {
    const dparts = dpath.split(/[\\/]/).filter(x => x);
    for (const sub of SUB_DIRECT) {
      const [hit, notes] = mods7h.lookup(look.mods, sub + '\\' + fname);
      for (const n of notes) look.note(n);
      if (hit !== null) {
        out = { loc: hit.loc, shown: fmt('%s\\%s', hit.mod, hit.rel),
                text: fmt('%s (7th Heaven mod %s, folder %s; FFNx asks %s\\%s\\%s, which 7th Heaven answers from the mod: inferred)',
                          hit.rel, hit.mod, hit.folder || 'top', dpath, sub, fname) };
        break;
      }
      if (look.game_dir) {
        const [p, note] = mods7h.resolve(look.game_dir, dparts.concat([sub, fname]));
        look.note(note);
        if (p !== null) {
          out = { loc: ['file', p], shown: p, text: fmt("%s (FFNx's direct folder, read from FFNx 1.24.3's code)", p) };
          break;
        }
      }
    }
  }
  look.memo.set(key, out);
  return out;
}

// A game portrait of the menu archive (the character's own, or the base's): {shown, label, lines, picture}. FFNx's direct folder comes before the archive
export function game_picture(look, number, size) {
  const stem = game_stem(number) + (size === 'small' ? '_l' : '');
  const res = { shown: false, label: stem + '.tex', lines: [], picture: null };
  const name = stem + '.tex';
  const d = direct_menu(look, name);
  if (d !== null) {
    look.touch(d.loc[1]);
    let [data, line] = read_loc(d.loc, d.shown);
    let pic = null;
    if (data !== null) [pic, line] = tex_picture(d.shown, data);
    if (pic === null) {
      res.lines.push(line);
      return res;
    }
    res.shown = true; res.picture = pic;
    res.lines.push(fmt("%s: %d x %d, in place of the archive's %s: %s", d.shown, pic.texture[0], pic.texture[1], name, d.text));
    return res;
  }
  const arch = look.menu.archive;
  if (arch === null) {
    res.lines.push(look.menu.line);
    return res;
  }
  look.touch(look.menu.path);
  if (!arch.has(name)) {
    res.lines.push(fmt('menu archive %s has no %s', look.menu.path, name));
    return res;
  }
  let data;
  try {
    data = arch.read(name, TEX_CAP);
  } catch (ex) {
    if (ex instanceof archives.ArchiveError) res.lines.push(fmt('%s: %s', name, ex.message));
    else res.lines.push(fmt('%s: could not be read', name));
    return res;
  }
  const [pic, line] = tex_picture(name, data);
  if (pic === null) {
    res.lines.push(line);
    return res;
  }
  res.shown = true; res.picture = pic;
  res.lines.push(fmt('%s: %d x %d, from %s (read)', name, pic.texture[0], pic.texture[1], look.menu.path));
  for (const ext of ['.tex', '.png']) {
    const e = look.find(stem + ext);
    if (e !== null) {
      res.lines.push(ext === '.tex' ? fmt("files\\%s replaces the game's %s.tex for every reader of the menu archive (inferred)", e.rel, stem) :
        fmt("files\\%s is also the game's %s.tex (inferred): it stands in for it for every reader of the menu archive, converted without fit", e.rel, stem));
    }
  }
  return res;
}

// ---- (stage 2) FFNx's replacement textures ----
// [picture or null, line or null, the DDS header facts] of a DDS: the drawn part only, decoded then box-averaged to at most SEND_LONG
export function dds_picture(shown, head, size, fetch) {
  let info;
  try {
    info = dds.header(head, size);
  } catch (ex) {
    if (ex instanceof dds.Budget) return [null, fmt('%s: %d x %d is more than the preview draws (%d MB of pixels): not drawn', shown, ex.size[0], ex.size[1], TEX_PIXELS >> 20), null];
    if (ex instanceof dds.Bad) return [null, fmt('%s: %s (%s)', shown, dds.WHAT, ex.message), null];
    throw ex;
  }
  const w = info.width, h = info.height;
  const [rw, rh, mw] = drawn_region(w, h);
  const f = Math.max(1, Math.min(Math.floor((Math.max(rw, rh) + SEND_LONG - 1) / SEND_LONG), rw, rh));
  let px;
  try {
    px = dds.decode(info, fetch, rw, rh);
  } catch (ex) {
    if (ex instanceof dds.Bad) return [null, fmt('%s: %s (%s)', shown, dds.WHAT, ex.message), null];
    return [null, fmt('%s: could not be read', shown), null];
  }
  const [ow, oh, out] = box_average(px, rw, 0, 0, rw, rh, f);
  return [{ kind: 'rgba', width: ow, height: oh, rgba: Buffer.from(out).toString('base64'), texture: [w, h], region: [rw, rh], menu_w: mw, scale: f }, null, info];
}

// [picture or null, line or null, header facts] of a DDS a lookup found: a real file (only the header and the drawn rows or blocks are read) or an
// entry of a mod's .iro (read whole, under TEX_CAP)
function read_dds(loc, shown) {
  if (loc[0] === 'iro') {
    let data;
    try {
      data = archives.open_cached('iro', loc[1]).read(loc[2], TEX_CAP);
    } catch (ex) {
      if (ex instanceof archives.ArchiveError) return [null, fmt('%s: %s', shown, ex.message), null];
      return [null, fmt('%s: could not be read', shown), null];
    }
    return dds_picture(shown, data.subarray(0, dds.HEAD), data.length, (off, n) => data.subarray(off, off + n));
  }
  const path = loc[1];
  let fd;
  try {
    const st = fs.statSync(path);
    if (!st.isFile()) return [null, fmt('%s: %s', shown, pnghead.WHY_NOT_REGULAR), null];
    fd = pnghead.openNonblocking(path);
    const fetch = (off, n) => {
      const buf = Buffer.alloc(n);
      let got = 0;
      while (got < n) {
        const k = fs.readSync(fd, buf, got, n - got, off + got);
        if (!k) break;
        got += k;
      }
      return buf.subarray(0, got);
    };
    return dds_picture(shown, fetch(0, dds.HEAD), st.size, fetch);
  } catch (e) {
    return [null, fmt('%s: could not be read', shown), null];
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// FFNx's replacement of the texture `name` ('<p>', or 'menu/<stem>'): {name, hit ({where: 'mod'|'game', mod, folder, loc, shown, ext} or null), lines}
// (made once a look). The files asked for: <base>/<name>_00.<ext> for override_mod_path (when set), then mod_path, each ext of mod_ext in turn;
// under mods/textures a .dds from the active mods comes before the game folder's own file
export function replacement(look, name) {
  const key = 'repl\u0000' + name;
  if (look.memo.has(key)) return look.memo.get(key);
  const cfg = look.cfg;
  const parts = name.split('/');
  const bases = (cfg.override_mod_path ? [cfg.override_mod_path] : []).concat([cfg.mod_path]);
  let hit = null;
  const asked = [];
  for (const base of bases) {
    const bparts = base.split(/[\\/]/).filter(x => x);
    const served = bparts.length === 2 && lower(bparts[0]) === 'mods' && lower(bparts[1]) === 'textures';
    for (const ext of cfg.mod_ext) {
      const fname = fmt('%s_00.%s', parts[parts.length - 1], ext);
      if (!asked.includes(fname)) asked.push(fname);
      if (served && lower(ext) === 'dds') {
        const [got, notes] = mods7h.lookup(look.mods, parts.slice(0, -1).concat([fname]).join('\\'));
        for (const n of notes) look.note(n);
        if (got !== null) {
          hit = { where: 'mod', mod: got.mod, folder: got.folder, loc: got.loc, shown: got.rel, ext: lower(ext) };
          break;
        }
      }
      if (look.game_dir) {
        const [p, note] = mods7h.resolve(look.game_dir, bparts.concat(parts.slice(0, -1), [fname]));
        look.note(note);
        if (p !== null) {
          hit = { where: 'game', mod: null, folder: null, loc: ['file', p], shown: p, ext: lower(ext) };
          break;
        }
      }
    }
    if (hit !== null) break;
  }
  const lines = [];
  if (hit === null) {
    if (!cfg.mod_ext.length) lines.push(fmt('FFNx replacement of %s: mod_ext is empty in FFNx.toml: none is looked for', name));
    else lines.push(fmt('no FFNx replacement of %s found (%s under %s)', name, asked.join(', '), bases.join(', ')));
  } else {
    look.touch(hit.loc[1]);
  }
  const out = { name, hit, lines };
  look.memo.set(key, out);
  return out;
}

// [picture or null, lines, the facts of the replacement shown or null] of a replacement `hit` of the texture `name`
export function replacement_picture(look, name, hit) {
  const shown = hit.shown;
  let pic, w, h, format;
  if (hit.ext === 'dds') {
    const [p, line, info] = read_dds(hit.loc, shown);
    if (p === null) return [null, [line + ': the texture under it is shown'], null];
    pic = p;
    [w, h] = pic.texture;
    format = info.kind === 'bc7' ? 'BC7' : 'uncompressed ' + info.label;
  } else if (hit.ext === 'png') {
    const info = pnghead.dims(hit.loc[1]);
    if (!info.ok) return [null, [fmt('%s: %s: the texture under it is shown', shown, info.why)], null];
    w = info.width; h = info.height;
    const [rw, rh, mw] = drawn_region(w, h);
    const f = Math.max(1, Math.min(Math.floor((Math.max(rw, rh) + SEND_LONG - 1) / SEND_LONG), rw, rh));
    const dst = [Math.max(1, Math.floor(rw / f)), Math.max(1, Math.floor(rh / f))];
    pic = { kind: 'png', png: null, png_from: null, width: w, height: h, src: [0, 0, rw, rh], dst, canvas: dst,
            region: [rw, rh], menu_w: mw, fit: false, alpha: null, _bytes: info.size };
    format = 'PNG (drawn by the browser)';
  } else {
    return [null, [fmt('%s: a form the preview does not read (.%s): the texture under it is shown', shown, hit.ext)], null];
  }
  let line;
  if (hit.where === 'mod') {
    line = fmt("shown instead: %s from %s (7th Heaven, folder %s), %d x %d, %s: FFNx's replacement of %s (inferred: 7th Heaven's serving of mods\\Textures)",
               shown, hit.mod, hit.folder || 'top', w, h, format, name);
  } else {
    line = fmt("shown instead: %s, %d x %d, %s: FFNx's replacement of %s (read)", shown, w, h, format, name);
  }
  return [pic, [line], { name, file: shown, from: hit.where, mod: hit.mod, width: w, height: h, format }];
}

export function inputs_of(look) {
  const rec = look.rec;
  const files = [...look.index.files].map(([k, v]) => [lower(k), v.rel]);
  files.sort((a, b) => cmpStr(a[0], b[0]) || cmpStr(a[1], b[1]));
  return { v: 2, config: look.config_dir, rec: REC_KEYS.map(k => rec[k]), index: look.index.folders, files, stamps: look.stamps,
           menu: [look.menu.path, look.menu.problem, look.menu.path ? stampOf(look.menu.path) : null, look.chosen_menu],
           toml: [look.toml, look.toml ? stampOf(look.toml) : null, look.override],
           ffnx: [look.cfg.mod_path, look.cfg.mod_ext, look.cfg.override_mod_path, look.cfg.direct_mode_path],
           seventh: look.seventh, mods: look.mods_deps, beside: look.beside };
}

export function build(look) {
  const rec = look.rec;
  const [kind, number, found] = effective_kind(rec, look);
  const lines = identity_lines(rec, look, kind, number, found);
  const base_stem = game_stem(rec.base_used);
  const from_ = { base: 'the base key', battle_like: 'no base key; battle_like ' + rec.battle_model, default: 'no base key; the default, 0' }[rec.base_from];
  lines.push(fmt('base used: %d (%s): its portrait %s.tex is shown when this one is not', rec.base_used, from_, base_stem));
  if (found !== null) {
    for (const d of found.dups) lines.push(fmt('files\\%s and files\\%s: the game uses whichever Windows lists first; the tool shows files\\%s', found.rel, d, found.rel));
  }
  const pics = [];
  let own_shown = false;
  for (const size of ['large', 'small']) {
    const pic = { size, title: TITLES[size], shown: 'none', label: '', lines: [], image: null, served: 'none', replacement: null };
    if (kind === 'file') {
      const r = own_picture(look, size);
      pic.lines.push(...r.lines);
      if (r.shown) {
        pic.shown = 'own'; pic.label = r.label; pic.image = r.picture;
        if (r.picture.kind === 'png') pic._path = r.path;
        own_shown = true;
      }
    } else if (kind === 'game') {
      const r = game_picture(look, number, size);
      pic.lines.push(...r.lines);
      if (r.shown) { pic.shown = 'game'; pic.label = r.label; pic.image = r.picture; }
    }
    if (pic.shown === 'none') {
      const r = game_picture(look, rec.base_used, size);
      pic.lines.push(...r.lines.filter(x => !pic.lines.includes(x)));
      if (r.shown) { pic.shown = 'base'; pic.label = fmt("the base's portrait (%s)", r.label); pic.image = r.picture; }
    }
    serve(look, pic, size);
    pics.push(pic);
  }
  if (own_shown || kind === 'file') lines.push(RESTART);
  if (look.mods.why) lines.push(look.mods.why);
  if (!look.game_dir) {
    lines.push("no game folder: FFNx's replacement textures and direct folder are not looked at in it (7th Heaven's mods are, with FFNx's defaults: " +
               'mod_path mods/textures, mod_ext dds png)');
  } else if (look.toml === null) {
    lines.push("FFNx.toml was not found in the game folder: FFNx's defaults are assumed (mod_path mods/textures, mod_ext dds png, direct_mode_path direct)");
  }
  lines.push(...look.notes);
  lines.push(...look.index.lines);
  return { id: rec.id, name: rec.name, portrait: rec.portrait, form: rec.portrait ? ['plain', 'game', 'file'][rec.portrait_form] : 'none',
           kind, number, fit: !!rec.portrait_fit, base_used: rec.base_used, menu_archive: look.menu.line, lines, pictures: pics };
}

// The name FFNx asks for the texture `pic` shows (make_pc_name): `<p>` / `<p>_l` for the DLL's own file, `menu/<stem>` / `menu/<stem>_l` for a texture
// read from the menu archive; null when no texture is shown
function texture_name(look, pic) {
  const small = pic.size === 'small' ? '_l' : '';
  const rec = look.rec;
  if (pic.shown === 'own') return rec.portrait + small;
  if (pic.shown === 'game') return 'menu/' + game_stem(effective_kind(rec, look)[1]) + small;
  if (pic.shown === 'base') return 'menu/' + game_stem(rec.base_used) + small;
  return null;
}

// What the game draws for a picture: FFNx's replacement of the texture shown, when one is served and the preview can read it (else the texture, with a
// line); fills pic.served, pic.replacement and its source lines
function serve(look, pic, size) {
  const name = texture_name(look, pic);
  if (pic.image !== null) pic.served = 'texture';
  if (name === null) return;
  const r = replacement(look, name);
  pic.lines.push(...r.lines);
  if (pic.shown === 'own' && look.beside) {
    pic.lines.push(fmt("the config folder is beside the game's exe: FFNx may name this texture SpellExtConfig/cache/%s, not %s as looked for (inferred)", name, name));
  }
  if (r.hit === null) return;
  const [img, lines, rep] = replacement_picture(look, name, r.hit);
  pic.lines.push(...lines);
  if (img === null) return;
  pic.image = img; pic.served = 'replacement'; pic.replacement = rep;
  if (img.kind === 'png') pic._path = r.hit.loc[1];
  else delete pic._path;
}

export function finish(answer, look, digest) {
  const sent = new Map();                           // path -> the size of the picture that carries its bytes (a file is sent once)
  for (const pic of answer.pictures) {
    const path = pic._path;
    delete pic._path;
    const img = pic.image;
    if (img !== null && img.kind === 'png') {
      if (sent.has(path)) {
        img.png_from = sent.get(path);
        continue;
      }
      if (!is_regular(path)) {
        pic.lines.push(fmt('%s: %s', pic.label, pnghead.WHY_NOT_REGULAR));
        continue;
      }
      if (img._bytes < PNG_SEND) {
        let fd;
        try {
          fd = pnghead.openNonblocking(path);
          const cap = Math.min(PNG_SEND, fs.fstatSync(fd).size);
          const buf = Buffer.alloc(cap);
          let n = 0;
          while (n < cap) {
            const k = fs.readSync(fd, buf, n, cap - n, n);
            if (!k) break;
            n += k;
          }
          img.png = buf.subarray(0, n).toString('base64');
          sent.set(path, pic.size);
        } catch (e) { /* the picture stays unsent */ } finally {
          if (fd !== undefined) fs.closeSync(fd);
        }
      }
      if (img.png === null) {
        pic.lines.push(fmt('%s: %d bytes, more than the preview sends to the page (16 MiB): only the crop box is shown', pic.label, img._bytes));
      }
    }
  }
  answer.digest = digest;
  return answer;
}

export const canonical = d => battlemodel.canonical(d);
export const digest_of = look => crypto.createHash('sha256').update(canonical(inputs_of(look)), 'ascii').digest('hex');

export function record_of(text, ident) {
  const r = new Reading(CHAR_FILE, text);
  chr_rules.check(r);
  const rec = r.shared.get('characters').get(ident);
  return rec === undefined ? null : Object.assign({}, rec, { id: ident });
}

export function precheck(look) {
  const p = look.rec.portrait;
  if (p) {
    for (const name of [p + '.tex', p + '.png', p + '_l.tex', p + '_l.png']) {
      const e = look.find(name);
      if (e !== null) look.touch(e.path);
    }
    look.override_file(p + '.tex');
    look.override_file(p + '_l.tex');
    replacement(look, p);
    replacement(look, p + '_l');
  }
  for (const number of [...new Set([look.rec.base_used, look.rec.portrait_number])].sort((a, b) => a - b)) {
    if (number >= 0 && number < chr_rules.GAME_PORTRAITS) {
      for (const name of [game_stem(number), game_stem(number) + '_l']) {
        for (const ext of ['.tex', '.png']) {
          const e = look.find(name + ext);
          if (e !== null) look.touch(e.path);
        }
        const d = direct_menu(look, name + '.tex');
        if (d !== null) look.touch(d.loc[1]);
        replacement(look, 'menu/' + name);
      }
    }
  }
}

export function prepare(ws, ident, chosen_menu = null, text = null) {
  if (!Number.isInteger(ident) || ident < FIRST_ID || ident > LAST_ID) throw new Refused(fmt('a character ID is %d to %d', FIRST_ID, LAST_ID));
  if (text === null) {
    try {
      text = ws.text(CHAR_FILE);
    } catch (e) {
      text = '';
    }
  }
  const rec = record_of(text, ident);
  if (rec === null) throw new Refused(fmt('character %d is not a live section of %s', ident, CHAR_FILE));
  const look = new Look(ws, rec, chosen_menu);
  precheck(look);
  return [look, digest_of(look)];
}

export const complete = (look, digest) => finish(build(look), look, digest);

export function panel(ws, ident, have = null, chosen_menu = null, text = null) {
  const [look, digest] = prepare(ws, ident, chosen_menu, text);
  if (have !== null && have === digest) return { same: true, digest };
  return complete(look, digest);
}

// the answer for the command line's --json: each picture's pixels or PNG bytes as their sha256
export function cli_form(a) {
  const out = JSON.parse(canonical(a));
  for (const p of out.pictures) {
    const img = p.image;
    if (img !== null) {
      for (const k of ['rgba', 'png']) {
        if (img[k]) {
          img[k + '_sha256'] = crypto.createHash('sha256').update(Buffer.from(img[k], 'base64')).digest('hex');
          delete img[k];
        }
      }
    }
  }
  return out;
}

export function text_lines(a) {
  const out = [fmt('character %d %s: portrait %s', a.id, a.name, a.portrait || '(none)')];
  out.push(fmt('  form: %s, effective: %s%s, portrait_fit = %s, base used %d', a.form, a.kind,
               a.kind === 'game' ? fmt(' (game portrait %d)', a.number) : '', a.fit ? 'yes' : 'no', a.base_used));
  out.push('  ' + a.menu_archive);
  for (const ln of a.lines) out.push('  ' + ln);
  for (const p of a.pictures) {
    const img = p.image;
    let what = img === null ? 'nothing' : img.kind + ' ' + img.region.join('x');
    if (p.served === 'replacement') what += fmt(' [FFNx replacement %s]', p.replacement.file);
    out.push(fmt('  %s: %s (%s); shows %s', p.size, p.label || '-', p.shown, what));
    for (const ln of p.lines) out.push('    ' + ln);
  }
  return out;
}
