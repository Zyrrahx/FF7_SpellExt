// (model preview, stages 2a and 2b) Where each file of a battle model comes from, in the order the running game asks,
// and the model described (battlemodel.js) from those files (sxcfg/modelsrc.py, line for line; its docstring gives the
// order and where each rule is read). READ ONLY. Node 22 language level. (stage 4) The Model block of an enemy file's
// form (panel) and its caches (Caches), as the Python port's.
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as archives from './archives.js';
import * as battlemodel from './battlemodel.js';
import * as enemyscan from './enemyscan.js';
import * as enform from './enform.js';
import * as gamedata from './gamedata.js';
import * as mods7h from './mods7h.js';
import * as scenebuild from './scenebuild.js';
import * as enemies_rules from './rules/enemies.js';
import { EditRefused } from './document.js';
import { pyJoin, pyExists, pyIsfile, pyIsdir, pyCmp, pyStrip } from './py.js';

export const POOL_FIRST = 365;
export const POOL_COUNT = 5;
export const CODE = 'read from the code';
export const MOD_READ = 'read from 7th Heaven 4.6.1\'s code';   // (review F2, minor 3) the IL, read by review F2
const B_SET = p => 'the battle.lgp chosen in place of the game folder\'s, ' + p + ',';
const NO_GAME = 'the game folder is not known (give the game folder)';
const MAX_FILE = archives.MAX_ENTRY;
export const MODEL_READ_BUDGET = 64 * 1048576;   // (Review T2 round 2, M6) the bytes of a model's files read, in all: 4 times the worst real case (16 MiB)
const asl = archives.ascii_lower;

export const model_letters = n => String.fromCharCode(97 + Math.floor(n / 26) % 26) + String.fromCharCode(97 + n % 26);
export const model_number = l => (l.charCodeAt(0) - 97) * 26 + (l.charCodeAt(1) - 97);

function read_file(path) {
  const fd = fs.openSync(path, 'r');
  try {
    const buf = Buffer.alloc(Math.min(fs.fstatSync(fd).size, MAX_FILE) + 1);
    let got = 0;
    for (;;) {
      const k = fs.readSync(fd, buf, got, buf.length - got, got);
      if (!k) break;
      got += k;
      if (got === buf.length) break;
    }
    if (got > MAX_FILE) throw new archives.ArchiveError('larger than ' + MAX_FILE + ' bytes');
    return buf.subarray(0, got);
  } finally {
    fs.closeSync(fd);
  }
}

function listing(d) {
  const out = new Map();
  let names;
  try { names = fs.readdirSync(d).sort(pyCmp); } catch (e) { return out; }
  for (const n of names) {
    const p = pyJoin(d, n);
    if (pyIsfile(p) && !out.has(asl(n))) out.set(asl(n), p);
  }
  return out;
}

export class Sources {
  constructor(ws, battle_lgp, seventh, caches) {
    this.ws = ws;
    this.config_dir = ws.config_dir;
    this.game_dir = ws.game_dir;
    this.caches = caches || null;
    this.mods_gen = null;       // (stage 4) which read of 7th Heaven's data these are (null: not through the caches)
    this.lines = [];
    this._archive(battle_lgp || null);
    this._direct();
    this._mods(seventh === undefined ? null : seventh);
    this._models();
  }

  _archive(chosen) {
    this.lgp = null;
    this.lgp_path = null;
    this.lgp_set = Boolean(chosen);
    this.lgp_problem = null;
    let path;
    if (chosen) {
      path = chosen;
      if (!pyExists(path)) this.lgp_problem = B_SET(path) + ' could not be read (no such file)';
      else if (!pyIsfile(path)) this.lgp_problem = B_SET(path) + ' could not be read (not a file)';
    } else if (!this.game_dir) {
      this.lgp_problem = NO_GAME;
      path = null;
    } else {
      path = gamedata.find_nocase(this.game_dir, ['data', 'battle', 'battle.lgp']);
      if (!path || !pyIsfile(path)) {
        this.lgp_problem = 'the game folder has no data\\battle\\battle.lgp';
        path = null;
      }
    }
    if (this.lgp_problem === null) {
      try {
        this.lgp = archives.open_cached('lgp', path);
        this.lgp_path = path;
      } catch (e) {
        if (e instanceof archives.ArchiveError) this.lgp_problem = (chosen ? B_SET(path) : path) + ' is ' + e.message;
        else if (e.code) this.lgp_problem = chosen ? B_SET(path) + ' could not be read (cannot be read)' : path + ' could not be read';
        else throw e;
      }
    }
    this.lgp_line = this.lgp !== null
      ? 'battle.lgp ' + this.lgp_path + ' (' + (chosen ? 'chosen in place of the game folder\'s; ' : '') + this.lgp.count + ' files)'
      : 'battle.lgp: ' + this.lgp_problem;
    this.lines.push(this.lgp_line);
  }

  _direct() {
    this.direct = { battle: new Map(), 'battle.lgp': new Map() };
    this.direct_name = null;
    this.direct_off = false;
    if (!this.game_dir) return;
    const toml = gamedata.find_nocase(this.game_dir, ['FFNx.toml']);
    if (!toml || !pyIsfile(toml)) {
      this.lines.push('FFNx\'s direct folder: the game folder has no FFNx.toml: not looked at');
      return;
    }
    let text;
    try {
      const fd = fs.openSync(toml, 'r');
      try {
        const buf = Buffer.alloc(1 << 20);
        let got = 0;
        for (;;) {
          const k = fs.readSync(fd, buf, got, buf.length - got, got);
          if (!k) break;
          got += k;
          if (got === buf.length) break;
        }
        text = buf.subarray(0, got).toString('utf8');
      } finally {
        fs.closeSync(fd);
      }
    } catch (e) {
      this.lines.push('FFNx\'s direct folder: FFNx.toml could not be read: not looked at');
      return;
    }
    const m = /^[ \t]*direct_mode_path[ \t]*=[ \t]*"([^"\r\n]*)"/m.exec(text);
    const name = m ? m[1] : 'direct';
    if (!name) {
      this.lines.push('FFNx\'s direct folder: direct_mode_path is empty in FFNx.toml (direct mode is off)');
      this.direct_off = true;
      return;
    }
    this.direct_name = name.replace(/\//g, '\\');
    const d = gamedata.find_nocase(this.game_dir, name.split(/[\\/]/).filter(x => x));
    let n = 0;
    if (d && pyIsdir(d)) {
      for (const sub of mods7h.SUBS) {
        const s = gamedata.find_nocase(d, [sub]);
        if (s && pyIsdir(s)) {
          this.direct[sub] = listing(s);
          n += this.direct[sub].size;
        }
      }
    }
    this.lines.push('FFNx\'s direct folder: ' + this.direct_name + '\\battle\\ and ' + this.direct_name +
                    '\\battle.lgp\\ of the game folder (' + n + ' file(s))');
  }

  _mods(seventh) {
    if (seventh === false) {
      this.mods = { why: 'other mods are not looked at (as asked)', mods: [] };
      this.mods_gen = this.caches !== null ? 0 : null;
    } else if (this.caches !== null) {
      [this.mods, this.mods_gen] = this.caches.mods_of(JSON.stringify([seventh || '', this.config_dir]), () => this._read_mods(seventh));
    } else {
      this.mods = this._read_mods(seventh);
    }
    if (this.mods.why) {
      this.lines.push(this.mods.why);
      return;
    }
    const with_files = this.mods.mods.filter(x => x.layers.battle.length || x.layers['battle.lgp'].length).length;
    this.lines.push('7th Heaven, profile ' + this.mods.profile + ': ' + this.mods.mods.length + ' active mod(s), ' + with_files +
                    ' with battle files, ' + this.mods.inactive + ' inactive (not looked at); the order between mods and inside a ' +
                    'mod is read from 7th Heaven 4.6.1\'s code');
    for (const x of this.mods.mods) this.lines.push(...x.lines);
  }

  _read_mods(seventh) {
    if (seventh) {
      mods7h._note(pyJoin(seventh, '7thWorkshop'));
      return pyIsdir(pyJoin(seventh, '7thWorkshop')) ? mods7h.read(seventh)
        : { why: "7th Heaven's settings were not found in " + seventh + ': other mods are not looked at', mods: [] };
    }
    return mods7h.for_config(this.config_dir);
  }

  _models() {
    this.assigned = ['', '', '', '', ''];
    this.enemies_on = false;
    const game_text = this._config_text(enemies_rules.GAME_FILE);
    const text = this._config_text(enemies_rules.FILE);
    if (game_text === null || !enemies_rules.enemies_on(game_text)) return;
    this.enemies_on = true;
    const g = enemies_rules.en_registry_parse(enemies_rules.QUIET, text !== null ? text : '');
    this.assigned = g.get('models').slice();
  }

  _config_text(name) {
    let names;
    try { names = fs.readdirSync(this.config_dir).sort(pyCmp); } catch (e) { return null; }
    let real = names.includes(name) ? name : names.find(x => asl(x) === asl(name));
    if (real === undefined || !pyIsfile(pyJoin(this.config_dir, real))) return null;
    try { return this.ws.text(real); } catch (e) { if (e.code) return null; throw e; }
  }

  candidates(name, pool) {
    const key = asl(name);
    const out = [];
    if (pool) {
      const p = gamedata.find_nocase(this.config_dir, ['enemies', pool, 'model', key.slice(2)]);
      if (p && pyIsfile(p)) {
        out.push({ layer: 'spellext', label: "SpellExt's enemies\\" + pool + '\\model\\' + key.slice(2), mark: CODE, loc: ['file', p] });
      }
    }
    for (const sub of mods7h.SUBS) {
      for (const m of this.mods.mods) {
        for (const [folder, files] of m.layers[sub]) {
          if (files.has(key)) {
            out.push({ layer: 'mod', label: m.name + ' (' + (folder ? folder + '\\' : '') + sub + '\\)', mark: MOD_READ, loc: files.get(key) });
          }
        }
      }
      if (this.direct[sub].has(key)) {
        out.push({ layer: 'direct', label: "the game folder's " + this.direct_name + '\\' + sub + '\\', mark: CODE,
                   loc: ['file', this.direct[sub].get(key)] });
      }
    }
    if (this.lgp !== null && this.lgp.has(name)) {
      out.push({ layer: 'archive', label: this.lgp_set ? 'the chosen battle.lgp' : 'battle.lgp', mark: CODE, loc: ['lgp', name] });
    }
    return out;
  }

  looked_in(pool) {
    const out = [];
    if (pool) out.push("SpellExt's enemies\\" + pool + '\\model\\');
    const n = this.mods.mods.filter(x => x.layers.battle.length || x.layers['battle.lgp'].length).length;
    if (n) out.push(n + ' active 7th Heaven mod(s) with battle files');
    if (this.direct_name !== null) out.push("the game folder's " + this.direct_name + '\\battle\\ and ' + this.direct_name + '\\battle.lgp\\');
    if (this.lgp !== null) out.push(this.lgp_set ? 'the chosen battle.lgp' : 'battle.lgp');
    return out.length ? out.join(', ') : 'no source (' + this.lgp_problem + ')';
  }

  read(c) {
    const loc = c.loc;
    if (loc[0] === 'file') return read_file(loc[1]);
    if (loc[0] === 'iro') return archives.open_cached('iro', loc[1]).read(loc[2]);
    return this.lgp.read(loc[1]);
  }

  // (stage 4) `deps`, when an array, gets the [path, stamp] of each file read, taken before it is read (the panel's LRU)
  fetcher(prefix, pool, rows, number, deps) {
    let used = 0;   // (Review T2 round 2, M6) the bytes of this model's files read so far
    return part => {
      const name = prefix + part;
      const cands = this.candidates(name, pool);
      const row = { file: name, from: cands.length ? cands[0].label : null, mark: cands.length ? cands[0].mark : null,
                    over: cands.slice(1).map(c => c.label) };
      rows.push(row);
      if (!cands.length) {
        const head = part === 'aa' ? 'model ' + number + ' (files ' + prefix + '..): ' : '';
        return [null, head + name + ' is in none of: ' + this.looked_in(pool)];
      }
      if (Array.isArray(deps)) {
        const loc = cands[0].loc;
        const path = loc[0] === 'file' || loc[0] === 'iro' ? loc[1] : this.lgp_path;
        deps.push([path, archives.stamp_or_none(path)]);
      }
      if (used > MODEL_READ_BUDGET) {
        row.problem = 'not read';
        return [null, cands[0].label + ': ' + name + ' not read (the model\'s files pass ' + (MODEL_READ_BUDGET / 1048576) + ' MB)'];
      }
      let why;
      try {
        const data = this.read(cands[0]);
        used += data.length;
        return [data, null];
      } catch (e) {
        if (e instanceof archives.ArchiveError) why = e.message;
        else if (e.code) why = 'cannot be read';
        else throw e;
      }
      row.problem = why;
      return [null, cands[0].label + ': ' + name + ' could not be read (' + why + ')'];
    };
  }

  // (stage 4) what decides where each file of a model comes from, as text (the panel's LRU key), or null when these
  // sources were not read through the caches; the files' own stamps are the entry's `deps`
  fingerprint(letters, pool, number) {
    if (this.mods_gen === null) return null;
    let pool_dir = null;
    let names = [];
    if (pool) {
      pool_dir = gamedata.find_nocase(this.config_dir, ['enemies', pool, 'model']);
      if (pool_dir && pyIsdir(pool_dir)) {
        try { names = fs.readdirSync(pool_dir).sort(pyCmp); } catch (e) { names = []; }
      }
    }
    return JSON.stringify([letters, pool, number, this.lgp_path, this.lgp_path ? archives.stamp_or_none(this.lgp_path) : null,
                           this.lgp_problem, this.lgp_set, this.direct_name, this.direct_off,
                           mods7h.SUBS.map(sub => [sub, [...this.direct[sub]].sort((a, b) => pyCmp(a[0], b[0]))]), this.mods_gen,
                           pool_dir || null, names]);
  }
}

// ---- (stage 4) the panel's caches (PLAN D8) ----
// (review F4) the RGBA bytes a model's textures may decode to in the panel, in all (the largest real model: 16 MB with
// the user's mods, 4 MB without), and the panel's models kept, in bytes (their canonical text and base64 pixels)
export const TEXTURE_BUDGET = 24 * 1048576;
export const CACHE_BYTES = 128 * 1048576;

// (review F4 round 2) [triangles, vertices] the renderer draws at most: MV.MAX_TRIANGLES and MV.MAX_VERTICES, read from
// renderer/modelview.js itself (the one place the numbers are written; the Python page's copy is the same bytes)
function renderer_limits() {
  const text = fs.readFileSync(new URL('../renderer/modelview.js', import.meta.url), 'utf8');
  const t = /^\s*MV\.MAX_TRIANGLES = ([0-9]+);/m.exec(text);
  const v = /^\s*MV\.MAX_VERTICES = ([0-9]+);/m.exec(text);
  if (!t || !v) throw new Error('renderer/modelview.js does not say MV.MAX_TRIANGLES and MV.MAX_VERTICES');
  return Object.freeze([parseInt(t[1], 10), parseInt(v[1], 10)]);
}
export const GEO_BUDGET = renderer_limits();   // the panel's parts in all: what the renderer draws, no more

// (3D formation view, stage 2) [[triangles, vertices], models] a scene's models may carry in all, read from renderer/modelview.js
// as renderer_limits reads its own: the composed mesh's caps MV.SCENE_MAX_TRIANGLES and MV.SCENE_MAX_VERTICES less the
// MV.SCENE_RESERVE kept for markers, shadows, placeholders and floor, and MV.SCENE_MAX_MODELS
function scene_limits() {
  const text = fs.readFileSync(new URL('../renderer/modelview.js', import.meta.url), 'utf8');
  const v = {};
  for (const k of ['SCENE_MAX_TRIANGLES', 'SCENE_MAX_VERTICES', 'SCENE_RESERVE', 'SCENE_MAX_MODELS']) {
    const m = new RegExp('^\\s*MV\\.' + k + ' = ([0-9]+);', 'm').exec(text);
    if (!m) throw new Error('renderer/modelview.js does not say MV.' + k);
    v[k] = parseInt(m[1], 10);
  }
  return [Object.freeze([v.SCENE_MAX_TRIANGLES - v.SCENE_RESERVE, v.SCENE_MAX_VERTICES - v.SCENE_RESERVE]), v.SCENE_MAX_MODELS];
}
// a scene's parts in all (the models of one call), and how many models
export const [SCENE_GEO_BUDGET, SCENE_MODELS] = scene_limits();
export const SCENE_TEXTURE_BUDGET = TEXTURE_BUDGET;   // a scene's RGBA bytes in all: one scene answer is never larger than one panel's

// What the Model panel keeps between looks: 7th Heaven's data (the active mods as read) while every file and folder that
// read looked at keeps its stamp; the last MODELS models described, each while what decides its sources
// (Sources.fingerprint) and every file it read are the same, and (review F4) at most `cache_bytes` of them in all, an
// entry larger than that never kept; each model's textures decoded only up to `texture_budget` bytes, and (round 2) its
// parts parsed only up to `geo_budget` ([triangles, vertices]: what the renderer draws). The LGP and .iro
// indexes are archives.open_cached's. clear() drops everything (the form's Reload).
export class Caches {
  constructor(texture_budget = TEXTURE_BUDGET, cache_bytes = CACHE_BYTES, geo_budget = GEO_BUDGET) {
    this.texture_budget = texture_budget;
    this.geo_budget = geo_budget;
    this.cache_bytes = cache_bytes;
    this.mods = new Map();
    this.models = new Map();
    this.bytes = 0;
    this.gen = 0;
    this.counts = { mods_read: 0, mods_kept: 0, model_read: 0, model_kept: 0, model_not_kept: 0 };
  }

  clear() {
    this.mods.clear();
    this.models.clear();
    this.bytes = 0;
    archives.clear_cache();
    mods7h.clear_listings();
  }

  static same(deps) {
    return deps.every(([p, st]) => archives.same_stamp(archives.stamp_or_none(p), st));
  }

  // [the mods read, its generation]: kept while nothing it read changed
  mods_of(key, read) {
    const [r, , gen] = this.mods_with_deps(key, read);
    return [r, gen];
  }

  // (portrait panel) [the mods read, [[path, stamp]] of everything the read looked at, its generation]
  mods_with_deps(key, read) {
    const hit = this.mods.get(key);
    if (hit !== undefined && Caches.same(hit[1])) {
      this.counts.mods_kept += 1;
      return [hit[0], hit[1], hit[2]];
    }
    const [r, deps] = mods7h.tracked(read);
    this.gen += 1;
    this.counts.mods_read += 1;
    this.mods.set(key, [r, deps, this.gen]);
    return [r, deps, this.gen];
  }

  // the entry {model, rows, deps, portable, digest, bytes} of `key`: kept while its files keep their stamps; else made
  // again. The oldest are dropped while more than MODELS are kept or more than `cache_bytes`; an entry larger than
  // `cache_bytes` by itself is answered and not kept.
  model(key, make) {
    const hit = this.models.get(key);
    if (hit !== undefined && Caches.same(hit.deps)) {
      this.models.delete(key);
      this.models.set(key, hit);
      this.counts.model_kept += 1;
      return hit;
    }
    if (hit !== undefined) {
      this.models.delete(key);
      this.bytes -= hit.bytes;
    }
    const e = make();
    this.counts.model_read += 1;
    if (e.bytes > this.cache_bytes) {
      this.counts.model_not_kept += 1;
      return e;
    }
    this.models.set(key, e);
    this.bytes += e.bytes;
    while (this.models.size > Caches.MODELS || this.bytes > this.cache_bytes) {
      const k = this.models.keys().next().value;
      this.bytes -= this.models.get(k).bytes;
      this.models.delete(k);
    }
    return e;
  }
}
Caches.MODELS = 8;

export const CACHES = new Caches();

// (stage 4) the form's Reload: every model, 7th Heaven read and archive index kept is dropped
export function clear_caches() { CACHES.clear(); }

// battlemodel.describe of `letters` from its sources, its rows added to `rows`; (stage 4) with `caches`, kept in their
// LRU: [the description, the entry or null]
export function model_of(src, letters, pool, rows, number, caches) {
  const key = caches ? src.fingerprint(letters, pool, number) : null;
  if (key === null) return [battlemodel.describe(letters, src.fetcher(letters, pool, rows, number)), null];
  const e = caches.model(key, () => {
    // (review F4) the textures decoded only up to the panel's budget; the entry keeps ONE form of the pixels: the base64
    // of the portable form the route sends (the description loses its raw `_rgba` once that is made)
    const mine = [];
    const deps = [];
    const d = battlemodel.describe(letters, src.fetcher(letters, pool, mine, number, deps), caches.texture_budget, caches.geo_budget);
    const canon = battlemodel.canonical(d);
    const port = battlemodel.portable(d);
    d.textures = d.textures.map(t => { const o = Object.assign({}, t); delete o._rgba; return o; });
    const size = canon.length + port.textures.reduce((n, t) => n + t.rgba_base64.length, 0);
    return { model: d, rows: mine, deps, portable: port, digest: crypto.createHash('sha256').update(canon, 'ascii').digest('hex'), bytes: size };
  });
  for (const x of e.rows) rows.push(Object.assign({}, x, { over: x.over.slice() }));
  return [e.model, e];
}

// ---- what a target names ----
export function enemy_model_key(ws, real) {
  const folder = ws.en_folder();
  const texts = [];
  for (const f of ['generated.ini', 'enemy.ini']) {
    const [size, text] = folder.read('enemies/' + real + '/' + f, 1 << 20);
    texts.push(size >= 0 && text !== null ? text : '');
  }
  const secs = enform.overlay(enform.lenient(texts[0]), enform.lenient(texts[1]), enform.ENEMY);
  for (const s of secs) {
    if (s.name === 'enemy') for (const k of s.keys) if (k.key === 'model') return k;
  }
  return null;
}

export function target_of(ws, target) {
  const folder = ws.en_folder();
  const t = pyStrip(target || '');
  const real = t && !t.includes('/') && !t.includes('\\') ? folder.resolve('enemies/' + t) : null;
  if (real !== null && pyIsdir(pyJoin(ws.config_dir, real))) return ['folder', real.slice(real.indexOf('/') + 1)];
  if (/^[A-Za-z]{2}$/.test(t)) return ['number', model_number(asl(t))];
  if (/^[0-9]{1,3}$/.test(t) && parseInt(t, 10) < 676) return ['number', parseInt(t, 10)];
  return [null, target + ' is not an enemy folder of the config (enemies\\' + target + '), a model\'s two letters (aa-zz) or a model ' +
          'number 0-675'];
}

export function model_check(ws, real) {
  const folder = ws.en_folder();
  const env = new scenebuild.Env(folder, []);
  const b = new scenebuild.Builder(env);
  b.b = new enemyscan.Build(folder);
  try {
    return [b.model_check(real, 'enemies/' + real + '/model/aa'), null];
  } catch (e) {
    if (!(e instanceof enemyscan.EnFail)) throw e;
    return [false, e.text];
  }
}

// (stage 4) `key` the folder's model key as written; with `caches` (the panel's) the model comes from their LRU when it can
// (3D formation view, stage 2) 'slot 1 (ob..)': the pool slot `slot` (0-based) as the words give it, 1-based
export const slot_words = slot => 'slot ' + (slot + 1) + ' (' + model_letters(POOL_FIRST + slot) + '..)';

// (3D formation view, stage 2) `slot` (0-2, the index in a scene's `enemies`): a folder whose key is `pool` is the pool model
// 365 + slot, and the words name that slot; slot 0 gives the words and numbers the Model panel has always had. (Review T2, M1)
// `as_pool` (a DLL scene's enemy: scene number 256 and over): the pool branch is taken whatever the folder's model key says, as the
// DLL does (slot i is model 365 + i; the key is read only for a scene.bin scene), with one line saying the key is ignored.
export function describe(ws, target, src, resolved, caches, slot = 0, as_pool = false) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= POOL_COUNT) throw new Error('slot is 0 to ' + (POOL_COUNT - 1));
  const out = { target, kind: null, folder: null, number: null, letters: null, pool: null, key: null, lines: [], files: [], model: null };
  const [kind, val] = resolved || target_of(ws, target);
  if (kind === null) {
    out.lines.push(val);
    return out;
  }
  const L = out.lines;
  let pool = null;
  let number;
  if (kind === 'folder') {
    out.kind = 'folder';
    out.folder = val;
    const k = enemy_model_key(ws, val);
    const label = k && k.from === enform.USER ? 'enemies\\' + val + '\\enemy.ini' : 'enemies\\' + val + '\\generated.ini';
    if (k === null) {
      L.push('enemies\\' + val + ': no model key (enemy.ini or generated.ini, [enemy])');
      return out;
    }
    out.key = pyStrip(k.value);
    if (as_pool || asl(pyStrip(k.value)) === 'pool') {
      number = POOL_FIRST + slot;
      if (asl(pyStrip(k.value)) !== 'pool') {
        L.push('in a DLL scene enemy slot ' + (slot + 1) + ' is model ' + number + ' whatever `model = ' + pyStrip(k.value) + '` says');
      }
      const [served, refused] = model_check(ws, val);
      if (refused) {
        L.push(refused);
        pool = val;
        L.push('model = pool: the files the folder has are shown (as the pool model of slot ' + (slot + 1) + ', ' + model_letters(number) +
               '..); in a battle the scene is refused');
      } else if (served) {
        pool = val;
        L.push('model = pool: the DLL serves enemies\\' + val + '\\model\\ as the pool model of the enemy\'s slot (365 + slot: ob.., ' +
               'oc.., od..); shown as ' + slot_words(slot));
      } else {
        L.push('enemies\\' + val + '\\model\\ has no aa (the skeleton): the DLL serves nothing from this folder; in a battle the game ' +
               'draws the archive\'s model of the enemy\'s slot (ob.., oc.. or od..: models 365-367); shown as ' + slot_words(slot));
      }
    } else {
      try {
        number = enemyscan.en_number(k.value, label + ' line ' + k.line, 0, 369);
      } catch (e) {
        if (!(e instanceof enemyscan.EnFail)) throw e;
        L.push(e.text);
        return out;
      }
      L.push('model = ' + number + ' (files ' + model_letters(number) + '..): the game\'s model, from the normal search');
    }
  } else {
    out.kind = 'number';
    number = val;
  }
  out.number = number;
  const letters = model_letters(number);
  out.letters = letters;
  if (pool === null && number >= POOL_FIRST && number < POOL_FIRST + POOL_COUNT && src.assigned[number - POOL_FIRST]) {
    const a = src.assigned[number - POOL_FIRST];
    if (kind === 'folder') {
      L.push('[models] ' + number + ' = ' + a + ': outside the battles of DLL scenes the DLL serves model ' + number + ' from enemies\\' +
             a + '\\model\\');
    } else {
      pool = a;
      L.push('[models] ' + number + ' = ' + a + ': served from enemies\\' + a + '\\model\\ for the run, outside the battles of DLL ' +
             'scenes (a file the folder lacks comes from the normal search)');
    }
  }
  out.pool = pool;
  if (pool && (src.direct_off || (src.direct_name !== null && asl(src.direct_name) !== 'direct'))) {
    // (review F2, minor 5) the DLL answers only paths under direct\ (enemies_driver_bare): said, not changed
    L.push('FFNx\'s direct_mode_path is ' + (src.direct_off ? 'empty (direct mode off)' : src.direct_name) + ': the DLL serves its pool ' +
           'only under direct\\, so in the game these files may not be served (the rows show the DLL\'s order as if they were)');
  }
  [out.model, out._cache] = model_of(src, letters, pool, out.files, number, caches || null);
  return out;
}

// ---- (stage 4) the Model block of an enemy file's form ----
export const NOT_SHOWN = Object.freeze([
  'FFNx\'s texture replacements (mods\\Textures, HD packs) are not shown: the .tex files the model names are drawn',
  'the game\'s battle lighting is not drawn: the vertex colours as stored, lit a little from the eye',
  'semi-transparent parts are drawn opaque',
  'the pose is the first frame of the model\'s first animation',
]);
// (3D formation view, stage 2) the pool model's number as the panel says it, for the pool slot `slot` (0-based)
export const pool_text = (slot = 0) => 'pool (365 + slot): shown as slot ' + (slot + 1) + ', model ' + (POOL_FIRST + slot) + ' (files ' +
                                       model_letters(POOL_FIRST + slot) + '..)';
export const POOL_TEXT = pool_text(0);   // 'pool (365 + slot): shown as slot 1, model 365 (files ob..)'

// the model's number as the panel says it: 'pool (365 + slot)...' or 'model N (files xy..)'; null without one
export function number_text(r, slot = 0, as_pool = false) {
  if (r.key !== null && (as_pool || asl(r.key) === 'pool')) return pool_text(slot);
  if (r.number !== null) return 'model ' + r.number + ' (files ' + r.letters + '..)';
  return null;
}

// The Model block of an enemy file's form, READ ONLY (sxcfg/modelsrc.py panel): enemies\<real> (an enemy folder the route
// found among the listed ones) described through the panel's caches (CACHES unless `caches`). `digest` covers all of it;
// when `have` is that digest the model is not sent again (`same`).
export function panel(ws, real, have, caches) {
  caches = caches || CACHES;
  const src = ws.model_sources(null, caches);
  const r = describe(ws, real, src, ['folder', real], caches);
  const d = r.model;
  const e = r._cache || null;
  const out = { folder: real, key: r.key, number: r.number, letters: r.letters, pool: r.pool, number_text: number_text(r),
                sources: src.lines.slice(), lines: r.lines.slice(), files: r.files, skeleton: d ? d.skeleton : null,
                counts: d ? battlemodel.summary(d) : null, problems: d ? d.problems.slice() : [], notes: d ? d.notes.slice() : [],
                not_shown: NOT_SHOWN.slice() };
  let mdig = null;
  if (d !== null) mdig = e === null ? battlemodel.digest(d) : e.digest;
  out.digest = battlemodel.digest({ panel: out, model: mdig });
  out.same = Boolean(have) && have === out.digest;
  if (d === null || out.same) out.model = null;
  else out.model = e === null ? battlemodel.portable(d) : e.portable;
  return out;
}

// ---- (3D formation view, stage 2) a scene's models: one route call, one budget ----
export const R_LIST = 'refs is a list of 1 to ' + SCENE_MODELS + ' model references';
export const R_COUNT = n => 'at most ' + SCENE_MODELS + ' models in one call (' + n + ' given)';
export const R_FORM = 'a model reference is {folder, slot, dll} or {number}';
export const R_DLL = 'dll is true or false (a DLL scene: its number is 256 or more)';
export const R_FOLDER = 'an enemy folder\'s name is 1 to 64 characters';
export const R_SLOT = 'slot is 0, 1 or 2 (the index in the scene\'s enemies)';
export const R_NUMBER = 'a model number is 0 to 369';
export const R_MOD_IDS = n => 'model ' + n + ': an id of 370 and above is not an enemy\'s model (a mod\'s scene.bin names the battle ' +
                              'stages\' files there): not drawn';
const thousands = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const pl = (n, one, many) => thousands(n) + ' ' + (n === 1 ? one : many);
const is_obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// The model references of one call, checked and made exact: [{folder: real name, slot: 0-2}, {number: 0-369}]. A reference is
// {folder, slot} (`resolve(name)` gives the folder's real name or throws: only a listed enemy folder) or {number}; 1 to
// SCENE_MODELS of them, identical ones folded (the same folder in two slots is two). A reference that cannot be drawn is refused
// with its words (EditRefused).
export function scene_refs_resolve(refs, resolve) {
  if (!Array.isArray(refs) || refs.length < 1 || refs.length > SCENE_MODELS) {
    if (Array.isArray(refs) && refs.length > SCENE_MODELS) throw new EditRefused(R_COUNT(refs.length));
    throw new EditRefused(R_LIST);
  }
  const out = [];
  const seen = new Set();
  for (const ref of refs) {
    const ks = is_obj(ref) ? Object.keys(ref).sort().join(',') : null;
    if (ks !== 'dll,folder,slot' && ks !== 'folder,slot' && ks !== 'number') throw new EditRefused(R_FORM);
    let item, key;
    if (ks === 'number') {
      const n = ref.number;
      if (!Number.isInteger(n) || n < 0 || n > 0xffff) throw new EditRefused(R_NUMBER);
      if (n >= 370) throw new EditRefused(R_MOD_IDS(n));
      item = { number: n };
      key = 'n:' + n;
    } else {
      const { folder: name, slot } = ref;
      if (typeof name !== 'string' || !(name.length > 0 && name.length <= 64)) throw new EditRefused(R_FOLDER);
      if (!Number.isInteger(slot) || slot < 0 || slot >= SCENE_MODELS) throw new EditRefused(R_SLOT);
      const dll = ref.dll === undefined ? false : ref.dll;
      if (typeof dll !== 'boolean') throw new EditRefused(R_DLL);
      const real = resolve(name);
      item = { folder: real, slot, dll };
      key = 'f:' + asl(real) + ':' + slot + ':' + dll;
    }
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function ref_label(ref, r) {
  if (ref.number !== undefined) return 'model ' + ref.number;
  return ref.folder + (r.key !== null && (ref.dll === true || asl(r.key) === 'pool') ? ' (slot ' + (ref.slot + 1) + ')' : '');
}

// The models of ONE scene for the 3D view, READ ONLY (sxcfg/modelsrc.py scene_models, line for line): `refs`
// (scene_refs_resolve's) each described as the Model panel does (describe, with the ref's pool slot, through the panel's caches:
// a model looked at in the panel is a hit here, and the other way round), then the scene's budgets applied to what is SENT, not
// to what is cached: parts in all up to SCENE_GEO_BUDGET (a model that would pass it is sent without parts), textures in all up
// to SCENE_TEXTURE_BUDGET (request order, then index; a texture past it is left out), each cut a note. `digest` covers all of
// it; when `have` is that digest the models are not sent again (`same`). `src` the sources (null: the panel's). `budget`
// [[triangles, vertices], RGBA bytes]: the scene's budgets, only for a test that plants a small one (null: the module's).
export function scene_models(ws, refs, have, caches, src, budget) {
  caches = caches || CACHES;
  src = src || ws.model_sources(null, caches);
  const rows = [];
  const notes_g = [];
  const notes_t = [];
  let used_t = 0;
  let used_v = 0;
  let used_uv = 0;
  let used_px = 0;
  const [[cap_t, cap_v], cap_px] = budget || [SCENE_GEO_BUDGET, SCENE_TEXTURE_BUDGET];
  for (const ref of refs) {
    let slot, r;
    if (ref.number !== undefined) {
      slot = 0;
      r = describe(ws, String(ref.number), src, ['number', ref.number], caches);
    } else {
      slot = ref.slot;
      r = describe(ws, ref.folder, src, ['folder', ref.folder], caches, slot, ref.dll === true);
    }
    const d = r.model;
    const e = r._cache || null;
    const label = ref_label(ref, r);
    const row = { ref: Object.assign({}, ref), key: r.key, number: r.number, number_text: number_text(r, slot, ref.number === undefined && ref.dll === true), lines: r.lines.slice(),
                  problems: d ? d.problems.slice() : [], notes: d ? d.notes.slice() : [], counts: d ? battlemodel.summary(d) : null,
                  sent: null, model: null, _digest: null };
    if (d !== null) {
      row._digest = e === null ? battlemodel.digest(d) : e.digest;
      let port = e === null ? battlemodel.portable(d) : e.portable;
      // (Review T2 round 2, M5) the model's POLYGONS: what describe's pre-check counted (real parts have polygons = triangles)
      const tri = port.parts.reduce((n, p) => n + p.polygons, 0);
      const vtx = port.parts.reduce((n, p) => n + Math.floor(p.xyz.length / 3), 0);
      const uvn = port.parts.reduce((n, p) => n + Math.floor(p.uv.length / 2), 0);
      // (Review T2, M2) no `tri &&`: a model of vertices only, or of texture coordinates only, counts too
      if (used_t + tri > cap_t || used_v + vtx > cap_v || used_uv + uvn > cap_v) {
        notes_g.push(label + ': not drawn (the scene\'s budget of ' + thousands(cap_t) + ' triangles and ' + thousands(cap_v) +
                     ' vertices or texture coordinates is used: this model has ' + pl(tri, 'triangle', 'triangles') + ', ' + pl(vtx, 'vertex', 'vertices') +
                     ' and ' + pl(uvn, 'texture coordinate', 'texture coordinates') + ')');
        port = Object.assign({}, port, { parts: [], textures: [] });
      } else {
        used_t += tri;
        used_v += vtx;
        used_uv += uvn;
        const kept = [];
        for (const t of port.textures.slice().sort((a, b) => a.index - b.index)) {
          const size = 4 * t.width * t.height;
          if (used_px + size > cap_px) {
            notes_t.push(label + ': ' + t.file + ' drawn untextured (the scene\'s texture budget of ' + (cap_px >> 20) +
                         ' MB is used: it is ' + t.width + ' x ' + t.height + ', ' + thousands(size) + ' bytes)');
          } else {
            used_px += size;
            kept.push(t);
          }
        }
        if (kept.length !== port.textures.length) port = Object.assign({}, port, { textures: kept });
      }
      row.sent = { parts: port.parts.length, triangles: port.parts.reduce((n, p) => n + p.tris.length, 0),
                   vertices: port.parts.reduce((n, p) => n + Math.floor(p.xyz.length / 3), 0), textures: port.textures.map(t => t.index) };
      row.model = port;
    }
    rows.push(row);
  }
  const out = { models: rows.map(row => { const m = Object.assign({}, row); delete m.model; delete m._digest; return m; }),
                notes: notes_g.concat(notes_t), not_shown: NOT_SHOWN.slice() };
  out.digest = battlemodel.digest({ scene: out, model: rows.map(row => row._digest) });
  out.same = Boolean(have) && have === out.digest;
  out.models = out.models.map((m, i) => Object.assign({}, m, { model: out.same ? null : rows[i].model }));
  return out;
}

export function r_canon(r) {
  return { target: r.target, kind: r.kind, folder: r.folder, number: r.number, letters: r.letters, pool: r.pool, lines: r.lines,
           files: r.files, model: r.model };
}

export function summary_lines(r, src) {
  const out = [];
  let head = 'model ' + r.target;
  if (r.kind === 'folder') {
    head = r.letters ? 'enemy folder ' + r.folder + ': model ' + r.number + ' (files ' + r.letters + '..)' : 'enemy folder ' + r.folder;
  } else if (r.kind === 'number') {
    head = 'model ' + r.number + ' (files ' + r.letters + '..)';
  }
  out.push(head, ...src.lines, ...r.lines);
  const d = r.model;
  if (r.files.length) {
    out.push('files:');
    for (const f of r.files) {
      if (f.from === null) {
        out.push('  ' + f.file + '  (none)');
        continue;
      }
      let line = '  ' + f.file + '  ' + f.from + ' [' + f.mark + ']';
      if (f.over.length) line += '; over: ' + f.over.join(', ');
      out.push(line);
    }
  }
  if (d !== null) {
    const s = d.skeleton;
    if (s) {
      out.push('skeleton: ' + s.bones + ' bones, ' + s.textures + ' textures, ' + s.animations + ' body animations, ' + s.weapons +
               ' weapons, ' + s.weapon_animations + ' weapon animations');
    }
    if (d.frame0) {
      const f = d.frame0;
      out.push('frame 0 of animation 0 (of ' + f.animations + '): position ' + f.position.join(' ') + ', key ' + f.key + ', ' +
               f.used_bones + ' angle triples (record bones ' + f.record_bones + ')');
    }
    const c = battlemodel.summary(d);
    out.push('parts: ' + c.parts + ' (' + c.vertices + ' vertices, ' + c.triangles + ' triangles)');
    for (const t of d.textures) {
      out.push('texture ' + t.index + ' ' + t.file + ': ' + t.width + ' x ' + t.height + ', ' + t.depth + '-bit, palette ' + t.palette +
               ', colour key ' + t.colour_key + ', rgba ' + t.rgba.slice(0, 16));
    }
    for (const p of d.problems) out.push('problem: ' + p);
    for (const n of d.notes) out.push('note: ' + n);
    out.push('digest: ' + battlemodel.digest(r_canon(r)));
  }
  return out;
}

export function all_targets(ws, src) {
  const out = [];
  if (src.lgp !== null) {
    const pre = [...new Set(src.lgp.names().filter(n => n.length === 4).map(n => asl(n.slice(0, 2))))].sort(pyCmp);
    for (const p of pre) {
      if (!src.lgp.has(p + 'aa')) continue;
      let data;
      try {
        data = src.lgp.read(p + 'aa');
      } catch (e) {
        if (e instanceof archives.ArchiveError) continue;
        throw e;
      }
      if (data.length >= 16 && data.readUInt32LE(12)) out.push([p, ['number', model_number(p)]]);
    }
  }
  for (const [name, is_dir] of ws.en_folder().listdir('enemies')) if (is_dir) out.push([name, ['folder', name]]);
  return out;
}
