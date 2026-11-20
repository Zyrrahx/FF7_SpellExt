// The SpellExtConfig folder as one workspace: its files, the open documents with their unsaved edits, checks of the
// whole folder in the DLL's order, and saves through safety.js (port of sxcfg/workspace.py).
import fs from 'node:fs';
import * as discover from './discover.js';
import * as safety from './safety.js';
import * as validate from './validate.js';
import './rules/index.js';
import * as enemyscan from './enemyscan.js';
import * as gamedata from './gamedata.js';
import * as scenebuild from './scenebuild.js';
import * as enform from './enform.js';
import * as formation from './formation.js';
import * as modelsrc from './modelsrc.js';
import { document_for, is_en_path } from './document.js';
import * as enemies_rules from './rules/enemies.js';
import { Schema } from './schema.js';
import { pyJoin, pyRealpath, pyCommonpath, pyIsdir, pyIsfile, pyExists, pyListdir, pyLower, pyCmp } from './py.js';

export const TEXT_DIRS = ['cameras', 'effects', 'ai'];     // text the DLL reads (ai: the .txt are this tool's sources)
export const VIEW_DIRS = ['Readme'];                        // shown, never written by the form
export const SKIP_DIRS = ['Backups', 'cache', 'files'];
export const EN_DIRS = ['scenes', 'enemies'];               // the DLL's own grammar (en_parse): listed by enemies_scan's rules
export const ENEMY_FILES = ['enemy.ini', 'generated.ini'];  // of a folder enemies\<folder>: the user's, the converter's

// sorted(names, key=str.lower): stable, by code point
function sortedLower(names) {
  return names.map((n, i) => [pyLower(n), i, n]).sort((a, b) => pyCmp(a[0], b[0]) || (a[1] - b[1])).map(x => x[2]);
}

export const OWN_CAMERA = "the formation's own camera block";

export class Workspace {
  constructor(config_dir, game_dir, scene_bin = null, battle_lgp = null, menu_lgp = null) {
    this.config_dir = pyRealpath(config_dir);
    if (!pyIsdir(this.config_dir)) {
      const e = new Error('no such folder: ' + config_dir);
      e.name = 'FileNotFoundError';
      throw e;
    }
    this.schema = Schema.load(this.config_dir);
    this.game_dir = discover.game_dir(this.config_dir, game_dir);
    this.docs = new Map();      // relative path -> {doc: Document, stamp: [mtime, size], dirty: bool, saved_bytes}
    this.writable = accessW(this.config_dir);
    this._game = null;          // the game folder's scene.bin and kernel (gamedata.GameData), read when first needed
    this._builds = new scenebuild.Cache();
    this.items_kernel = null;   // (stage C2) the chosen kernel's kernel2.bin for the item names (kernels.kernel2_beside)
    this.scene_bin = scene_bin || null;     // (formation diagrams) the scene.bin set in the settings, or null
    this.battle_lgp = battle_lgp || null;   // (model preview) the battle.lgp set in the settings, or null
    this.menu_lgp = menu_lgp || null;       // (portrait panel) the menu archive set in the settings, or null
  }

  // ---- files -------------------------------------------------------------------------------------------------------
  path(rel) {
    const p = pyRealpath(pyJoin(this.config_dir, rel));
    if (pyCommonpath([this.config_dir, p]) !== this.config_dir) {
      const e = new Error('outside the config folder: ' + rel);
      e.name = 'ValueError';
      throw e;
    }
    return p;
  }

  fields_file() {
    try {
      return discover.fields_file_name(this.text('FF7_SpellExt_Game.ini'));
    } catch (e) {
      if (e.code) return null;      // OSError
      throw e;
    }
  }

  list_files() {
    const out = [];
    const ff = this.fields_file();
    for (const name of sortedLower(pyListdir(this.config_dir))) {
      const p = pyJoin(this.config_dir, name);
      if (!pyIsfile(p)) continue;
      let entry = this.schema.file(name, ff);
      let read_by_dll = entry !== null && (pyLower(name) !== 'ff7_spellext_fields.ini' ||
                                           pyLower(ff || '') === pyLower(name));
      if (pyLower(name) === 'ff7_spellext_spells_test.ini') {
        read_by_dll = true;
        entry = this.schema.file('FF7_SpellExt_Spells.ini');
      }
      out.push({ path: name, group: 'config', read_by_dll, title: truthy(entry) && entry.title !== undefined ? entry.title : null,
                 size: fs.statSync(p).size, dirty: this.docs.has(name) ? this.docs.get(name).dirty : false });
    }
    for (const d of TEXT_DIRS.concat(VIEW_DIRS)) {
      const folder = pyJoin(this.config_dir, d);
      if (!pyIsdir(folder)) continue;
      for (const name of sortedLower(pyListdir(folder))) {
        const p = pyJoin(folder, name);
        if (!pyIsfile(p)) continue;
        const rel = d + '/' + name;
        const low = pyLower(name);
        if (d === 'ai' && !(low.endsWith('.txt') || low.endsWith('.ai'))) continue;
        if (d !== 'ai' && !low.endsWith('.txt') && !low.endsWith('.json')) continue;
        out.push({ path: rel, group: d, read_by_dll: d === 'cameras' || d === 'effects' || low.endsWith('.ai'),
                   title: null, size: fs.statSync(p).size, readonly: VIEW_DIRS.indexOf(d) >= 0 || low.endsWith('.ai'),
                   dirty: this.docs.has(rel) ? this.docs.get(rel).dirty : false });
      }
    }
    for (const f of this.list_en_files()) out.push(f);
    return out;
  }

  // The Enemies file's load lists as the DLL would read them (rules/enemies.js), or null with enemies off.
  registry() {
    const low = new Map();
    for (const k of pyListdir(this.config_dir)) low.set(pyLower(k), k);
    const text = (name) => {
      const real = low.get(pyLower(name));
      if (real === undefined || !pyIsfile(pyJoin(this.config_dir, real))) return null;
      return this.text(real);
    };
    return enemies_rules.registry_of(text(enemies_rules.GAME_FILE), text(enemies_rules.FILE));
  }

  // The config folder as the scan sees it (enemyscan.Folder), unsaved scene and enemy documents included, and a file the
  // editor made (an override's user file) once it has a line.
  en_folder() {
    const texts = new Map();
    const made = new Set();
    for (const [rel, e] of this.docs) {
      if (!is_en_path(rel)) continue;
      if (e.stamp !== null) texts.set(rel, e.doc.text());
      else if (e.dirty) {
        texts.set(rel, e.doc.text());
        made.add(rel);
      }
    }
    return new enemyscan.Folder(this.config_dir, texts, made);
  }

  // A listed file's size: a file the editor made and has not saved has its text's
  _en_size(folder, rel) {
    if (folder.made.has(rel)) return folder.texts.get(rel).length;
    return fs.statSync(pyJoin(this.config_dir, rel)).size;
  }

  // The scene files (scenes\*.ini, scenes\generated\*.ini) and the enemy folders' enemy.ini and generated.ini, in the
  // order and by the rules of the DLL's start-up scan (enemies_scan): see workspace.py list_en_files. Nothing else of the
  // two folders is listed (the AI files, the model files), nor a file whose real path is outside the config folder (a
  // link). Generated files are editable: `generated` marks them. The walk has a fixed depth: it never recurses.
  list_en_files(folder) {
    const f = folder || this.en_folder();
    const reg = this.registry();
    const out = [];
    let known = 0;
    const dirty = (rel) => this.docs.has(rel) ? this.docs.get(rel).dirty : false;
    for (const [name, is_dir] of f.listdir('enemies')) {
      if (!is_dir || name.startsWith('.')) continue;
      const base = f.resolve('enemies') + '/' + name;
      const files = f.listdir(base).filter(([n]) => ENEMY_FILES.indexOf(pyLower(n)) >= 0).map(([n, , is_file]) => [n, is_file]);
      const has = files.some(([, is_file]) => is_file);
      const ok = reg !== null && enemyscan.en_name_ok(name) && has &&
        enemyscan.en_listed(reg.get('enemies_all'), reg.get('enemies_load'), name);
      if (ok) known += 1;
      for (const [n, is_file] of files) {
        if (!is_file || !this.inside(base + '/' + n)) continue;
        const rel = base + '/' + n;
        out.push({ path: rel, group: 'enemies', read_by_dll: ok && known <= enemyscan.ENEMIES_KNOWN_MAX, title: null,
                   size: this._en_size(f, rel), readonly: false,
                   generated: pyLower(n) === 'generated.ini', dirty: dirty(rel) });
      }
    }
    const subs = ['scenes', 'scenes/generated'];
    for (let i = 0; i < 2; i++) {
      const real = f.resolve(subs[i]);
      for (const [fname, , is_file] of f.listdir(subs[i])) {
        if (!is_file || fname.length < 5 || enemyscan.ascii_lower(fname.slice(-4)) !== '.ini') continue;
        const rel = real + '/' + fname;
        if (!this.inside(rel)) continue;
        const name = fname.slice(0, -4);
        const ok = reg !== null && enemyscan.en_name_ok(name) &&
          enemyscan.en_listed(reg.get('scenes_all'), reg.get('scenes_load'), name);
        out.push({ path: rel, group: 'scenes', read_by_dll: ok, title: null,
                   size: this._en_size(f, rel), readonly: false, generated: Boolean(i),
                   dirty: dirty(rel) });
      }
    }
    return out;
  }

  // Whether `rel` is a file inside the config folder (a link out of it is not listed: path() refuses it).
  inside(rel) {
    try {
      this.path(rel);
      return true;
    } catch (e) {
      if (e.name === 'ValueError') return false;
      throw e;
    }
  }

  // The note a generated scene or enemy file is shown with (null for any other file).
  static generated_note(rel) {
    const parts = rel.split('/');
    const low = parts.map(p => pyLower(p));
    if (low.length === 3 && low[0] === 'scenes' && low[1] === 'generated') {
      return enemyscan.GENERATED_NOTE.replace('%s', 'scenes\\' + parts[2]);
    }
    if (low.length === 3 && low[0] === 'enemies' && low[2] === 'generated.ini') {
      return enemyscan.GENERATED_NOTE.replace('%s', 'enemies\\' + parts[1] + '\\enemy.ini');
    }
    return null;
  }

  open(rel, reload) {
    if (this.docs.has(rel) && !reload) return this.docs.get(rel);
    const p = this.path(rel);
    const data = fs.readFileSync(p);
    const st = safety.stamp(p);
    this.docs.set(rel, { doc: document_for(rel, data), stamp: st, dirty: false, saved_bytes: data });
    return this.docs.get(rel);
  }

  // An empty document for a file the folder does not have yet (a template's .ini, the templates file): written by its
  // first save. Until then changed_on_disk says whether a file appeared there meanwhile.
  create(rel) {
    const p = this.path(rel);
    if (pyExists(p) || this.docs.has(rel)) return this.open(rel);
    this.docs.set(rel, { doc: document_for(rel, Buffer.alloc(0)), stamp: null, dirty: false, saved_bytes: Buffer.alloc(0) });
    return this.docs.get(rel);
  }

  // The file's text as it stands in the workspace (unsaved edits included).
  text(rel) {
    if (this.docs.has(rel)) return this.docs.get(rel).doc.text();
    return fs.readFileSync(this.path(rel)).toString('latin1');
  }

  mark(rel) {
    const e = this.docs.get(rel);
    e.dirty = !e.doc.serialize().equals(e.saved_bytes);
  }

  changed_on_disk(rel) {
    const e = this.docs.get(rel);
    if (!e) return false;
    const p = this.path(rel);
    if (e.stamp === null) return pyExists(p);      // made by create(): nothing was on disk
    return !pyExists(p) || !safety.same_stamp(safety.stamp(p), e.stamp);
  }

  // ---- checks ------------------------------------------------------------------------------------------------------
  // Every file a reader reads, by the name the DLL reads it under, as it stands in the workspace (a Map, in the
  // folder's own order, as Python's dict).
  texts() {
    const out = new Map();
    const ff = this.fields_file();
    for (const name of pyListdir(this.config_dir)) {
      const p = pyJoin(this.config_dir, name);
      if (pyIsfile(p) && (truthy(this.schema.file(name)) || pyLower(name) === 'ff7_spellext_spells_test.ini' ||
                          (ff && pyLower(name) === pyLower(ff)))) {
        out.set(name, this.text(name));
      }
    }
    // a file made by create() and not saved yet (the readers read it as it stands)
    for (const [rel, e] of this.docs) {
      if (e.stamp === null && rel.indexOf('/') < 0 && !out.has(rel) && truthy(this.schema.file(rel))) out.set(rel, e.doc.text());
    }
    // the fields reader is registered under the default name: hand it the file the game file names
    if (ff && pyLower(ff) !== 'ff7_spellext_fields.ini') {
      const low = lowerMap(out);
      if (low.has(pyLower(ff))) out.set('FF7_SpellExt_Fields.ini', out.get(low.get(pyLower(ff))));
      else if (low.has('ff7_spellext_fields.ini')) out.delete(low.get('ff7_spellext_fields.ini'));
    } else if (!ff) {
      const low = lowerMap(out);
      if (low.has('ff7_spellext_fields.ini')) out.delete(low.get('ff7_spellext_fields.ini'));
    }
    return out;
  }

  // (custom icons) what the readers need to say a named icon file is missing: the folder SpellExtConfig/files/icons and the
  // Set of the files under it (lower case, '\\' between folders: the game's Windows ignores case).
  icon_state() {
    const base = pyJoin(this.config_dir, 'files', 'icons');
    const have = new Set();
    const walk = (dir, rel) => {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (e) {
        return;
      }
      for (const e of entries) {
        const p = pyJoin(dir, e.name);
        if (e.isDirectory()) walk(p, rel + e.name + '\\');
        else if (pyIsfile(p)) have.add(pyLower(rel + e.name));
      }
    };
    walk(base, '');
    return new Map([['icon_dir', base], ['icon_files', have]]);
  }

  check() {
    this.quiet_lines = [];
    const shared = this.icon_state();
    const res = validate.check_folder(this.texts(), undefined, shared);
    const out = new Map();
    for (const [f, probs] of res) out.set(f, probs.map(p => p.as_dict()));
    if (shared.has('enemies_registry')) {
      const folder = this.en_folder();
      const sc = enemyscan.scan(folder, shared.get('enemies_registry'));
      Workspace.add_scan(out, sc);
      this.add_builds(out, this.builds(folder, sc, shared), sc);
    }
    return out;
  }

  // The game folder's data a scene's build reads (read again when one of its files changed)
  // (stage C2) with the item names of the chosen kernel's kernel2.bin when the editor has one (items_kernel)
  game_data() {
    if (this._game === null) {
      this._game = this.scene_bin ? new gamedata.GameData(this.game_dir, this.scene_bin) : new gamedata.GameData(this.game_dir);
    }
    if (typeof this._game.set_items_kernel === 'function') this._game.set_items_kernel(this.items_kernel);
    return this._game.fresh();
  }

  // [[number, name, scenebuild.Result]]: the build of every registered scene, each kept until a file it read changes
  // (see workspace.py builds). With no arguments: the folder as it stands, after a check of the main files.
  // `only`: the scene names to build (the others are left out)
  builds(folder, sc, shared, only) {
    if (shared === undefined || shared === null) {
      shared = this.icon_state();
      validate.check_folder(this.texts(), undefined, shared);
      if (!shared.has('enemies_registry')) return [];
    }
    folder = folder || this.en_folder();
    sc = sc || enemyscan.scan(folder, shared.get('enemies_registry'));
    return this._builds.builds(folder, sc, this.game_data(), shared, only);
  }

  // A scene's build as check lines: its problem and notes, and (when it builds) one line in the tool's words that it does
  static scene_lines(number, name, r) {
    let ls = scenebuild.lines_of(number, name, r);
    if (r.ok) {
      ls = ls.concat([{ file: scenebuild.scene_file_of(r, name), line: 0, kind: 'tool', fmt: null, match: null,
        text: 'DLL scene ' + number + " '" + name + "' builds (forecast): " + scenebuild.built_text(r) }]);
    }
    return ls;
  }

  // (stage C2) "Check all scenes" a part at a time (workspace.py scene_range); null with enemies off
  scene_range(start, count) {
    const shared = this.icon_state();
    validate.check_folder(this.texts(), undefined, shared);
    if (!shared.has('enemies_registry')) return null;
    const folder = this.en_folder();
    const sc = enemyscan.scan(folder, shared.get('enemies_registry'));
    const names = new Set(sc.scenes.slice(start, start + count).map(x => x[1]));
    const out = [];
    for (const [number, name, r] of this.builds(folder, sc, shared, names)) {
      const verdict = r.ok ? 'built' : r.problem instanceof scenebuild.NotForecast ? 'not forecast' : 'refused';
      out.push({ number, name, verdict, lines: Workspace.scene_lines(number, name, r) });
    }
    return { total: sc.scenes.length, start, results: out };
  }

  // (stage C2) A scene or enemy file's form view beside its lines (enform.view)
  en_view(rel) {
    const folder = this.en_folder();
    const [prel, there] = enform.partner_of(folder, rel);
    let ptext = null;
    if (there) {
      ptext = folder.texts.has(prel) ? folder.texts.get(prel) : fs.readFileSync(this.path(prel)).toString('latin1');
    }
    const game = enform.file_kind(rel) === enform.SCENE ? this.game_data() : null;
    return enform.view(folder, rel, this.text(rel), ptext, game);
  }

  // ---- (formation diagrams, stage 1) the scene.bin setting, the game's own formations (workspace.py) ---------------
  set_scene_bin(path) {
    this.scene_bin = path || null;
    this._game = null;
  }

  // (model preview) a game file of the settings (gamedata.GAME_FILES) set (a path) or cleared (null)
  set_game_file(key, path) {
    if (key === 'scene_bin') this.set_scene_bin(path);
    else if (key === 'battle_lgp') this.battle_lgp = path || null;
    else if (key === 'menu_lgp') this.menu_lgp = path || null;
  }

  // (model preview) the sources a battle model's files come from (modelsrc.Sources); seventh: null the 7th Heaven the
  // config folder sits in, a folder, or false; (stage 4) caches: the Model panel's
  model_sources(seventh = null, caches = null) {
    return new modelsrc.Sources(this, this.battle_lgp, seventh, caches);
  }

  // (model preview) the model an enemy folder, two letters or a model number names, described file by file
  model(target, seventh = null, src = null) {
    return modelsrc.describe(this, target, src || this.model_sources(seventh));
  }

  game_formations() {
    const g = this.game_data();
    const [mods, why] = discover.scene_bin_mods(this.config_dir);
    const out = { scene_bin: g.scene_path, set: Boolean(g.scene_bin), line: g.scene_line(), problem: g.scene_problem,
                  mods, mods_why: why, kinds: formation.KIND_NAMES.slice(), battles: [] };
    if (g.scene_problem !== null) return out;
    for (const sc of [...g.heads.keys()].sort((a, b) => a - b)) {
      const head = g.heads.get(sc);
      const names = g.names.get(sc);
      for (let f = 0; f < 4; f++) {
        const fm = formation.from_image(head, f, sc * 4 + f, names);
        const whos = [];
        const counts = new Map();
        for (const r of fm.rows) {
          if (r.model !== 0xffff) {
            if (!counts.has(r.who)) whos.push(r.who);
            counts.set(r.who, (counts.get(r.who) || 0) + 1);
          }
        }
        const so = formation.O_SETUP + 0x14 * f;
        let total = 0;
        for (const v of counts.values()) total += v;
        out.battles.push([sc * 4 + f, sc, f, fm.kind, formation.u16(head, so), total,
          whos.map(w => (counts.get(w) === 1 ? w : w + ' x' + counts.get(w))).join(', ')]);
      }
    }
    return out;
  }

  game_formation(battle) {
    const g = this.game_data();
    const sc = battle >> 2;
    const f = battle & 3;
    const out = { battle, scene: sc, formation: f, line: g.scene_line(), problem: g.scene_problem, stage: null, next: null,
                  escape: null, flags: null, names: null, layout: null, refs: [] };
    if (g.scene_problem !== null) return out;
    const head = g.heads.has(sc) ? g.heads.get(sc) : null;
    if (head === null) {
      out.problem = 'battle ' + battle + ': scene ' + sc + ' is not in ' + g.scene_path + ' (' + g.scenes + ' scenes)';
      return out;
    }
    const so = formation.O_SETUP + 0x14 * f;
    Object.assign(out, { stage: formation.u16(head, so), next: formation.u16(head, so + 2), escape: formation.u16(head, so + 4),
                         flags: formation.u16(head, so + 0x10), names: g.names.get(sc),
                         layout: formation.layout(formation.from_image(head, f, battle, g.names.get(sc), 0,
                           undefined, 0, OWN_CAMERA)),
                         refs: formation.scene_refs(head) });
    return out;
  }

  // The check's lines of one scene's build (name), or of every scene whose enemies key names an enemy folder (enemy), as
  // a Map {file: [lines]}; with neither, of every scene. null with enemies off.
  scene_check(name, enemy) {
    const res = this.builds();
    if (!res.length && this.registry() === null) return null;
    const out = new Map();
    for (const [number, sname, r] of res) {
      if (name !== undefined && name !== null && enemyscan.ascii_lower(sname) !== enemyscan.ascii_lower(name)) continue;
      if (enemy !== undefined && enemy !== null &&
          !r.folder.slice(0, r.enemies).map(x => enemyscan.ascii_lower(x)).includes(enemyscan.ascii_lower(enemy))) continue;
      for (const x of Workspace.scene_lines(number, sname, r)) {
        if (!out.has(x.file)) out.set(x.file, []);
        out.get(x.file).push(x);
      }
    }
    return out;
  }

  // The builds' lines into a check's result, each under the file and line its problem names; the tool's summary line under
  // the Enemies file
  add_builds(out, results, sc) {
    const low = new Map();
    for (const k of out.keys()) low.set(pyLower(k), k);
    const reg = low.has(pyLower(enemies_rules.FILE)) ? low.get(pyLower(enemies_rules.FILE)) : enemies_rules.FILE;
    const at = (k) => {
      if (!out.has(k)) out.set(k, []);
      return out.get(k);
    };
    const game = this.game_data();
    const quiet = scenebuild.no_game_data(game);      // (minor 5 of review C1) said once, in the summary line
    this.quiet_lines = [];                            // ... and on the file's own page (quiet_for)
    for (const [number, name, r] of results) {
      for (const x of scenebuild.lines_of(number, name, r)) {
        if (quiet && x.kind === 'tool' && x.fmt === scenebuild.BUILD_NOT_FORECAST) {
          this.quiet_lines.push(x);
          continue;
        }
        at(low.has(pyLower(x.file)) ? low.get(pyLower(x.file)) : x.file).push(x);
      }
    }
    at(reg).push({ file: reg, line: 0, kind: 'tool', fmt: null, match: null, text: scenebuild.summary(results, sc.enemies, game) });
  }

  // The "not forecast" lines of the last check that its result leaves out (no game data at all: minor 5) about the file
  // `rel`: its own page still shows them
  quiet_for(rel) {
    return (this.quiet_lines || []).filter(x => pyLower(x.file) === pyLower(rel));
  }

  // The start-up scan's forecast (enemyscan.scan) over the folder as it stands here.
  scan(registry) {
    return enemyscan.scan(this.en_folder(), registry);
  }

  // The scan's lines into a check's result (a Map): each under the file it is about (the folder's lines under the
  // Enemies file), then the tool's summary line under the Enemies file.
  static add_scan(out, sc) {
    const low = new Map();
    for (const k of out.keys()) low.set(pyLower(k), k);
    const reg = low.has(pyLower(enemies_rules.FILE)) ? low.get(pyLower(enemies_rules.FILE)) : enemies_rules.FILE;
    const at = (k) => {
      if (!out.has(k)) out.set(k, []);
      return out.get(k);
    };
    for (const [rel, line, fmt, text] of sc.lines) {
      const f = rel || reg;
      at(low.has(pyLower(f)) ? low.get(pyLower(f)) : f).push({ file: f, line, text, kind: 'problem', fmt });
    }
    at(reg).push({ file: reg, line: 0, text: sc.summary, kind: 'tool', fmt: null });
  }

  // ---- saving ------------------------------------------------------------------------------------------------------
  save(rel) {
    const e = this.docs.get(rel);
    if (!this.writable) throw new safety.WriteRefused('the config folder is not writable: read-only mode');
    const data = e.doc.serialize();
    const [backup, st] = safety.atomic_write(this.config_dir, this.path(rel), data, e.stamp);
    e.stamp = st;
    e.saved_bytes = data;
    e.dirty = false;
    return backup;
  }
}

function lowerMap(m) {
  const low = new Map();
  for (const k of m.keys()) low.set(pyLower(k), k);
  return low;
}

// Python's truth of a schema entry (a dict: empty is false)
function truthy(x) {
  return x !== null && x !== undefined && !(typeof x === 'object' && Object.keys(x).length === 0);
}

function accessW(p) {
  try {
    fs.accessSync(p, fs.constants.W_OK);
    return true;
  } catch (e) {
    return false;
  }
}
